import type { Chat, Context, Plugin, User } from "@yaebal/core";
import {
	type ApiLike,
	createDialogs,
	type DialogButton,
	type DialogContext,
	type DialogControl,
	type DialogDef,
	type DialogsOptions,
	MordaError,
	type RenderFrame,
	type WindowDef,
	type WindowMedia,
	type WindowView,
} from "../index.js";
import { Fragment, VNODE, type VNode } from "./jsx-runtime.js";

export type { VNode } from "./jsx-runtime.js";

/** a screen is a component: a zero-arg function returning a `<Screen>` tree. */
export type ScreenComponent = () => VNode;

// ── marker components (matched by identity, never invoked by the runtime) ────

export interface ScreenProps {
	children?: unknown;
	/**
	 * consume a text message sent while this screen is on top. commands (`/…`)
	 * are never routed here; return `false` to decline and let the rest of the
	 * bot handle the message.
	 */
	onText?: (ctx: DialogContext & { text: string }) => unknown;
	/** media shown above the text (text becomes the caption). */
	media?: WindowMedia;
	/** show link previews for urls in the text. omit for telegram's default. */
	linkPreview?: boolean;
}

export function Screen(props: ScreenProps): VNode {
	return { [VNODE]: true, type: Screen, props: { ...props } };
}

export function ButtonRow(props: { children?: unknown }): VNode {
	return { [VNODE]: true, type: ButtonRow, props: { ...props } };
}

export interface ButtonProps {
	id: string;
	onClick?: () => unknown;
	children?: unknown;
}

/** a tappable button. `onClick` runs on press; hooks are *not* callable inside. */
export function Button(props: ButtonProps): VNode {
	return { [VNODE]: true, type: Button, props: { ...props } };
}

/** a button that opens a url. */
export function Url(props: { url: string; children?: unknown }): VNode {
	return { [VNODE]: true, type: Url, props: { ...props } };
}

/** a button that opens a web app. */
export function WebApp(props: { url: string; children?: unknown }): VNode {
	return { [VNODE]: true, type: WebApp, props: { ...props } };
}

/** a button that copies text to the clipboard. */
export function Copy(props: { text: string; children?: unknown }): VNode {
	return { [VNODE]: true, type: Copy, props: { ...props } };
}

/** a button that starts an inline query. */
export function SwitchInline(props: {
	query?: string;
	currentChat?: boolean;
	children?: unknown;
}): VNode {
	return { [VNODE]: true, type: SwitchInline, props: { ...props } };
}

const MARKERS = new Set<unknown>([
	Screen,
	ButtonRow,
	Button,
	Url,
	WebApp,
	Copy,
	SwitchInline,
	Fragment,
]);

// ── hook machinery ───────────────────────────────────────────────────────────

type PendingEffect = () => Promise<void>;

interface HookFrame {
	rf: RenderFrame;
	ctx: DialogContext;
	cursor: number;
	pending: PendingEffect[];
	idByComponent: Map<ScreenComponent, string>;
}

let current: HookFrame | undefined;

/** effects queued by the render that produced this frame — run in onCommit. */
const effectQueues = new WeakMap<RenderFrame, PendingEffect[]>();

function need(): HookFrame {
	if (!current) {
		throw new MordaError("jsx: hooks may only be called while a screen renders");
	}
	return current;
}

/**
 * per-screen state, persisted in the dialog frame — with a persistent storage it
 * survives restarts and horizontal scaling. values must be JSON-serializable.
 * `setState` schedules one re-render after the current handler finishes
 * (many calls in one handler still edit the message once).
 */
export function useState<T>(initial: T | (() => T)): [T, (next: T | ((prev: T) => T)) => void] {
	const frame = need();
	const { rf, ctx } = frame;
	const i = frame.cursor++;

	if (!(i in rf.hooks)) {
		rf.hooks[i] = typeof initial === "function" ? (initial as () => T)() : initial;
	}

	const set = (next: T | ((prev: T) => T)): void => {
		const prev = rf.hooks[i] as T;
		rf.hooks[i] = typeof next === "function" ? (next as (p: T) => T)(prev) : next;
		ctx.dialog.invalidate();
	};

	return [rf.hooks[i] as T, set];
}

/**
 * run an effect after the rendered screen is delivered (and the state persisted)
 * — so `setState` inside an effect re-renders correctly. `deps` gate re-runs and
 * are persisted: an effect with `[]` runs once per screen *instance*, not once
 * per process. no cleanup functions — closures don't survive between updates.
 */
export function useEffect(fn: () => unknown, deps?: unknown[]): void {
	const frame = need();
	const { rf } = frame;
	const i = frame.cursor++;

	const slot = rf.hooks[i] as { d: unknown[] | null } | null | undefined;
	if (!(i in rf.hooks)) rf.hooks[i] = null; // claim the slot (null = never ran)

	const want = deps === undefined ? null : deps;
	const ran = slot != null;
	const changed = !ran || slot.d === null || want === null || !depsEqual(slot.d, want);

	if (changed) {
		// mark at schedule time, not after the run: the engine persists the state between
		// render and onCommit, so a marker written post-run only survives reference-sharing
		// storages — with redis/sqlite (or a cloning memory store) the effect would re-fire
		// on every update. cost: an effect that throws won't re-run (at-most-once).
		rf.hooks[i] = { d: want };
		frame.pending.push(async () => {
			await fn();
		});
	}
}

function depsEqual(a: unknown[], b: unknown[]): boolean {
	return a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
}

export interface Navigation {
	push(target: ScreenComponent | string, params?: unknown): Promise<void>;
	replace(target: ScreenComponent | string, params?: unknown): Promise<void>;
	back(result?: unknown): Promise<void>;
	close(): Promise<void>;
}

/** navigate by screen component (or window id). */
export function useNavigation(): Navigation {
	const frame = need();
	const dialog = frame.ctx.dialog;
	const byComponent = frame.idByComponent;

	const idOf = (t: ScreenComponent | string): string => {
		if (typeof t === "string") return t;
		const id = byComponent.get(t);
		if (id === undefined) {
			throw new MordaError("jsx: navigating to a screen that is not in jsxDialogs()");
		}
		return id;
	};

	return {
		push: (t, params) => dialog.push(idOf(t), params),
		replace: (t, params) => dialog.replace(idOf(t), params),
		back: (result) => dialog.back(result),
		close: () => dialog.close(),
	};
}

/** params passed to `push`/`replace`/`start` for this screen. */
export function useParams<P = unknown>(): P {
	return need().rf.params as P;
}

/**
 * the dialog-wide data bag (shared by all screens of the dialog, persisted).
 * patching re-renders after the current handler, like `setState`.
 */
export function useDialogData<T extends Record<string, unknown> = Record<string, unknown>>(): [
	T,
	(patch: Partial<T>) => void,
] {
	const frame = need();
	const { rf, ctx } = frame;
	return [
		rf.data as T,
		(patch) => {
			Object.assign(rf.data, patch);
			ctx.dialog.invalidate();
		},
	];
}

/** the telegram user behind the current update (undefined in background renders). */
export function useUser(): User | undefined {
	return need().ctx.from;
}

/** the chat the dialog lives in. */
export function useChat(): Chat | undefined {
	return need().ctx.chat;
}

/** the full context — the escape hatch when no dedicated hook fits. */
export function useContext<C extends Context = DialogContext>(): C {
	return need().ctx as unknown as C;
}

/** the session (requires `@yaebal/session` installed before the dialog). */
export function useSession<S>(): S {
	const session = (need().ctx as unknown as { session?: S }).session;
	if (session === undefined) {
		throw new MordaError("jsx: useSession() requires @yaebal/session installed before the dialog");
	}
	return session;
}

export interface Translation {
	t(key: string, ...args: unknown[]): string;
	changeLanguage(language: string): unknown;
}

/** i18n helpers (requires `@yaebal/i18n` installed before the dialog). */
export function useTranslation(): Translation {
	const ctx = need().ctx as unknown as Partial<Translation>;
	if (!ctx.t || !ctx.changeLanguage) {
		throw new MordaError("jsx: useTranslation() requires @yaebal/i18n installed before the dialog");
	}
	return { t: ctx.t, changeLanguage: ctx.changeLanguage };
}

// ── flattening ───────────────────────────────────────────────────────────────

function isVNode(x: unknown): x is VNode {
	return typeof x === "object" && x !== null && VNODE in x;
}

function resolve(node: unknown): unknown {
	let cur = node;
	for (
		let guard = 0;
		isVNode(cur) && typeof cur.type === "function" && !MARKERS.has(cur.type);
		guard++
	) {
		if (guard >= 50) throw new MordaError("jsx: component nesting too deep (cyclic render?)");
		cur = (cur.type as (p: unknown) => unknown)(cur.props);
	}
	return cur;
}

function toArray(x: unknown): unknown[] {
	if (Array.isArray(x)) return x;
	return x === undefined ? [] : [x];
}

/** flatten children into a label string (recurses into fragments and arrays). */
function textOf(children: unknown): string {
	const parts: string[] = [];
	const walk = (child: unknown): void => {
		const n = resolve(child);
		if (typeof n === "string" || typeof n === "number") {
			parts.push(String(n));
		} else if (Array.isArray(n)) {
			for (const c of n) walk(c);
		} else if (isVNode(n) && n.type === Fragment) {
			for (const c of toArray(n.props.children)) walk(c);
		}
	};
	for (const c of toArray(children)) walk(c);
	return parts.join("");
}

function toButton(node: VNode): DialogButton | undefined {
	const label = textOf(node.props.children);
	if (node.type === Button) {
		const props = node.props as unknown as ButtonProps;
		const onClick = props.onClick;
		return { id: props.id, label, onClick: onClick ? () => onClick() : undefined };
	}
	if (node.type === Url) return { label, url: node.props.url as string };
	if (node.type === WebApp) return { label, webApp: node.props.url as string };
	if (node.type === Copy) return { label, copy: node.props.text as string };
	if (node.type === SwitchInline) {
		return {
			label,
			switchInline: (node.props.query as string) ?? "",
			currentChat: node.props.currentChat as boolean | undefined,
		};
	}
	return undefined;
}

function collectRow(children: unknown): DialogButton[] {
	const out: DialogButton[] = [];
	const walk = (child: unknown): void => {
		const n = resolve(child);
		if (Array.isArray(n)) {
			for (const c of n) walk(c);
		} else if (isVNode(n)) {
			if (n.type === Fragment) {
				for (const c of toArray(n.props.children)) walk(c);
			} else {
				const b = toButton(n);
				if (b) out.push(b);
			}
		}
	};
	for (const c of toArray(children)) walk(c);
	return out;
}

function collect(node: unknown, texts: string[], rows: DialogButton[][]): void {
	const n = resolve(node);
	if (n === null || n === undefined || typeof n === "boolean") return;

	if (typeof n === "string" || typeof n === "number") {
		texts.push(String(n));
		return;
	}
	if (Array.isArray(n)) {
		for (const c of n) collect(c, texts, rows);
		return;
	}
	if (isVNode(n)) {
		if (n.type === Fragment) {
			for (const c of toArray(n.props.children)) collect(c, texts, rows);
		} else if (n.type === ButtonRow) {
			rows.push(collectRow(n.props.children));
		} else {
			const b = toButton(n);
			if (b) rows.push([b]); // a bare button becomes its own row
		}
	}
}

interface RenderedScreen {
	view: WindowView;
	props: ScreenProps;
}

function flatten(el: unknown): RenderedScreen {
	const screen = resolve(el);
	if (!isVNode(screen) || screen.type !== Screen) {
		throw new MordaError("jsx: a screen component must render <Screen>…</Screen>");
	}
	const props = screen.props as ScreenProps;

	const texts: string[] = [];
	const rows: DialogButton[][] = [];
	for (const c of toArray(props.children)) collect(c, texts, rows);

	const keyboard = rows.filter((r) => r.length > 0);
	const view: WindowView = { text: texts.join("") };
	if (keyboard.length > 0) view.keyboard = keyboard;
	if (props.media) view.media = props.media;
	if (props.linkPreview !== undefined) view.linkPreview = props.linkPreview;
	return { view, props };
}

// ── screen → window wiring ───────────────────────────────────────────────────

function renderScreen(
	ctx: DialogContext,
	rf: RenderFrame,
	Component: ScreenComponent,
	idByComponent: Map<ScreenComponent, string>,
): RenderedScreen {
	const frame: HookFrame = { rf, ctx, cursor: 0, pending: [], idByComponent };
	effectQueues.set(rf, frame.pending);

	const before = rf.hooks.length;
	const prev = current;
	current = frame;
	let rendered: RenderedScreen;
	try {
		// components may also run during flatten (children resolve lazily), so the
		// hook frame stays current until the whole view is collected.
		rendered = flatten(Component());
	} finally {
		current = prev;
	}

	// rules of hooks: fewer hooks than the persisted slots means a conditional
	// hook — fail loud instead of silently reinterpreting slots. (growth is fine:
	// it covers deploys that append hooks to a live dialog.)
	if (frame.cursor < before) {
		throw new MordaError(
			`jsx: screen "${rf.window}" called ${frame.cursor} hooks but its state has ${before} — hooks must run unconditionally`,
		);
	}
	return rendered;
}

function screenWindow(
	Component: ScreenComponent,
	idByComponent: Map<ScreenComponent, string>,
): WindowDef {
	return {
		render: (ctx, rf) => renderScreen(ctx, rf, Component, idByComponent).view,

		// effects run here: after the message landed and the state persisted, so a
		// setState inside an effect re-renders (the engine loops while invalidated).
		async onCommit(_ctx, rf) {
			const pending = effectQueues.get(rf);
			if (!pending) return;
			effectQueues.delete(rf);
			for (const run of pending) await run();
		},

		onText(ctx, rf) {
			const { props } = renderScreen(ctx, rf, Component, idByComponent);
			if (!props.onText) return false;
			return props.onText(ctx);
		},
	};
}

/**
 * install a set of JSX screens as a dialog:
 * `bot.install(jsxDialogs({ main: MainScreen, settings: SettingsScreen }))`.
 * returns the plugin; use {@link createJsxDialogs} if you need background
 * updates too.
 */
export function jsxDialogs<const S extends Record<string, ScreenComponent>>(
	screens: S,
	options?: DialogsOptions,
): Plugin<Context, { dialog: DialogControl<Extract<keyof S, string>> }> {
	return createJsxDialogs(screens, options).plugin;
}

/** {@link jsxDialogs} plus a `background` handle for edits outside an update. */
export function createJsxDialogs<const S extends Record<string, ScreenComponent>>(
	screens: S,
	options?: DialogsOptions,
): {
	plugin: Plugin<Context, { dialog: DialogControl<Extract<keyof S, string>> }>;
	background: (
		api: ApiLike,
		key: string,
	) => Promise<DialogControl<Extract<keyof S, string>> | undefined>;
} {
	const idByComponent = new Map<ScreenComponent, string>();
	for (const [id, Component] of Object.entries(screens)) idByComponent.set(Component, id);

	const def: DialogDef = {};
	for (const [id, Component] of Object.entries(screens)) {
		def[id] = screenWindow(Component, idByComponent);
	}

	const { plugin, background } = createDialogs(def, options);
	return {
		plugin: plugin as Plugin<Context, { dialog: DialogControl<Extract<keyof S, string>> }>,
		background: background as (
			api: ApiLike,
			key: string,
		) => Promise<DialogControl<Extract<keyof S, string>> | undefined>,
	};
}

// ── widgets ──────────────────────────────────────────────────────────────────
// ready-made stateful components over the same hooks. like all hooks, widgets
// must render unconditionally (same order every render).

/** `− value +` stepper. uncontrolled by default; pass `value` to control it. */
export function Counter(props: {
	id: string;
	value?: number;
	onChange?: (next: number) => unknown;
	min?: number;
	max?: number;
	step?: number;
	format?: (value: number) => string;
}): VNode {
	const [internal, setInternal] = useState(props.value ?? props.min ?? 0);
	const value = props.value ?? internal;
	const step = props.step ?? 1;

	const set = (next: number): void => {
		const clamped = Math.min(props.max ?? Infinity, Math.max(props.min ?? -Infinity, next));
		if (clamped === value) return;
		if (props.value === undefined) setInternal(clamped);
		props.onChange?.(clamped);
	};

	return ButtonRow({
		children: [
			Button({ id: `${props.id}:-`, onClick: () => set(value - step), children: "−" }),
			Button({ id: `${props.id}:=`, children: props.format?.(value) ?? String(value) }),
			Button({ id: `${props.id}:+`, onClick: () => set(value + step), children: "+" }),
		],
	});
}

/** an on/off switch rendered as `☑ label` / `☐ label`. */
export function Toggle(props: {
	id: string;
	children?: unknown;
	value?: boolean;
	onChange?: (next: boolean) => unknown;
}): VNode {
	const [internal, setInternal] = useState(props.value ?? false);
	const value = props.value ?? internal;

	return Button({
		id: props.id,
		onClick: () => {
			if (props.value === undefined) setInternal(!value);
			props.onChange?.(!value);
		},
		children: [value ? "☑ " : "☐ ", ...toArray(props.children)],
	});
}

/** single-choice list; the selected item is marked with ✓. */
export function Select<T>(props: {
	id: string;
	items: readonly T[];
	itemId: (item: T) => string;
	label: (item: T) => string;
	selected?: string;
	onSelect?: (id: string, item: T) => unknown;
	columns?: number;
}): VNode {
	const [internal, setInternal] = useState<string | undefined>(props.selected);
	const selected = props.selected ?? internal;
	const columns = Math.max(1, props.columns ?? 1);

	const rows: VNode[] = [];
	for (let i = 0; i < props.items.length; i += columns) {
		rows.push(
			ButtonRow({
				children: props.items.slice(i, i + columns).map((item) => {
					const id = props.itemId(item);
					return Button({
						id: `${props.id}:${id}`,
						onClick: () => {
							if (props.selected === undefined) setInternal(id);
							props.onSelect?.(id, item);
						},
						children: `${selected === id ? "✓ " : ""}${props.label(item)}`,
					});
				}),
			}),
		);
	}
	return Fragment({ children: rows });
}

/** `« ‹ page/pages › »` pager. controlled: pass `page` and handle `onPage`. */
export function Pagination(props: {
	id: string;
	page: number;
	pages: number;
	onPage: (next: number) => unknown;
}): VNode {
	const { id, page, pages, onPage } = props;
	const go = (next: number): void => {
		const clamped = Math.min(pages, Math.max(1, next));
		if (clamped !== page) onPage(clamped);
	};

	return ButtonRow({
		children: [
			Button({ id: `${id}:first`, onClick: () => go(1), children: "«" }),
			Button({ id: `${id}:prev`, onClick: () => go(page - 1), children: "‹" }),
			Button({ id: `${id}:page`, children: `${page}/${pages}` }),
			Button({ id: `${id}:next`, onClick: () => go(page + 1), children: "›" }),
			Button({ id: `${id}:last`, onClick: () => go(pages), children: "»" }),
		],
	});
}
