import type { Context, Plugin, User } from "@yaebal/core";
import {
	type DialogContext,
	type DialogControl,
	type DialogDef,
	type DialogsOptions,
	type Button as MordaButton,
	type WindowView,
	dialogs,
} from "../index.js";
import { Fragment, VNODE, type VNode } from "./jsx-runtime.js";

export type { VNode } from "./jsx-runtime.js";

/** A screen is a component: a zero-arg function returning a `<Screen>` tree. */
export type ScreenComponent = () => VNode;

export interface ButtonProps {
	id: string;
	onClick?: () => unknown;
	children?: unknown;
}

// Component markers. Never invoked by the runtime — matched by identity below.
export function Screen(props: { children?: unknown }): VNode {
	return { [VNODE]: true, type: Screen, props: { ...props } };
}
export function ButtonRow(props: { children?: unknown }): VNode {
	return { [VNODE]: true, type: ButtonRow, props: { ...props } };
}
export function Button(props: ButtonProps): VNode {
	return { [VNODE]: true, type: Button, props: { ...props } };
}

const MARKERS = new Set<unknown>([Screen, ButtonRow, Button, Fragment]);

// --- hooks runtime -----------------------------------------------------------

interface Frame {
	slots: unknown[];
	cursor: number;
	effects: Array<() => unknown>;
	ctx: DialogContext;
	idByComponent: Map<ScreenComponent, string>;
}

let current: Frame | undefined;

function need(): Frame {
	if (!current) throw new Error("morda/jsx: hooks may only be called during a screen render");
	return current;
}

/** Per-frame state. `setState` re-renders the screen in place and resolves when the edit lands. */
export function useState<T>(
	initial: T | (() => T),
): [T, (next: T | ((prev: T) => T)) => Promise<void>] {
	const frame = need();
	const i = frame.cursor++;
	if (!(i in frame.slots)) {
		frame.slots[i] = typeof initial === "function" ? (initial as () => T)() : initial;
	}
	const set = (next: T | ((prev: T) => T)): Promise<void> => {
		const prev = frame.slots[i] as T;
		frame.slots[i] = typeof next === "function" ? (next as (p: T) => T)(prev) : next;
		// ponytail: one editMessageText per setState — no batching. Combine writes
		// yourself if a handler calls setState many times in a row.
		return frame.ctx.dialog.rerender();
	};
	return [frame.slots[i] as T, set];
}

/**
 * Run an effect after the screen renders. `deps` gate re-runs.
 * Prefer passing `deps` — the no-deps form fires on every *internal* render
 * (a button press renders once to route and again to commit), not once per tap.
 */
export function useEffect(fn: () => unknown, deps?: unknown[]): void {
	const frame = need();
	const i = frame.cursor++;
	const prev = frame.slots[i] as { deps?: unknown[] } | undefined;
	frame.slots[i] = { deps };
	// ponytail: no cleanup support — effects are fire-and-forget (enough for bots).
	if (!prev || !depsEqual(prev.deps, deps)) frame.effects.push(fn);
}

function depsEqual(a: unknown[] | undefined, b: unknown[] | undefined): boolean {
	if (!a || !b || a.length !== b.length) return false;
	return a.every((v, i) => Object.is(v, b[i]));
}

export interface Navigation {
	push(target: ScreenComponent | string): Promise<void>;
	replace(target: ScreenComponent | string): Promise<void>;
	back(): Promise<void>;
}

/** Navigate by screen component (or window id). */
export function useNavigation(): Navigation {
	const frame = need();
	const dialog = frame.ctx.dialog;
	const idOf = (t: ScreenComponent | string): string => {
		if (typeof t === "string") return t;
		const id = frame.idByComponent.get(t);
		if (id === undefined) throw new Error("morda/jsx: navigating to a screen not in jsxDialogs()");
		return id;
	};
	return {
		push: (t) => dialog.push(idOf(t)),
		replace: (t) => dialog.replace(idOf(t)),
		back: () => dialog.back(),
	};
}

/** The Telegram user behind the current update. */
export function useUser(): User | undefined {
	return need().ctx.from;
}

/** The session session (requires `@yaebal/session` installed before the dialog). */
export function useSession<S>(): S {
	return (need().ctx as unknown as { session: S }).session;
}

export interface Translation {
	t(key: string, ...args: unknown[]): string;
	changeLanguage(language: string): unknown;
}

/** i18n helpers (requires `@yaebal/i18n` installed before the dialog). */
export function useTranslation(): Translation {
	const ctx = need().ctx as unknown as Partial<Translation>;
	if (!ctx.t || !ctx.changeLanguage) {
		throw new Error("morda/jsx: useTranslation() requires @yaebal/i18n installed");
	}
	return { t: ctx.t, changeLanguage: ctx.changeLanguage };
}

// --- flattening --------------------------------------------------------------

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
		if (guard >= 50) throw new Error("morda/jsx: component nesting too deep (cyclic render?)");
		cur = (cur.type as (p: unknown) => unknown)(cur.props);
	}
	return cur;
}

function toArray(x: unknown): unknown[] {
	if (Array.isArray(x)) return x;
	return x === undefined ? [] : [x];
}

function textOf(children: unknown): string {
	const parts: string[] = [];
	for (const c of toArray(children)) {
		const n = resolve(c);
		if (typeof n === "string" || typeof n === "number") parts.push(String(n));
	}
	return parts.join("");
}

function toButton(node: VNode): MordaButton {
	const props = node.props as unknown as ButtonProps;
	const onClick = props.onClick;
	return {
		id: props.id,
		label: textOf(props.children),
		onClick: onClick ? () => onClick() : undefined,
	};
}

function collectRow(children: unknown): MordaButton[] {
	const out: MordaButton[] = [];
	for (const c of toArray(children)) {
		const n = resolve(c);
		if (isVNode(n) && n.type === Button) out.push(toButton(n));
	}
	return out;
}

function collect(node: unknown, texts: string[], rows: MordaButton[][]): void {
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
		} else if (n.type === Button) {
			rows.push([toButton(n)]);
		}
	}
}

function renderView(el: unknown): WindowView {
	const screen = resolve(el);
	if (!isVNode(screen) || screen.type !== Screen) {
		throw new Error("morda/jsx: a screen component must render <Screen>…</Screen>");
	}
	const texts: string[] = [];
	const rows: MordaButton[][] = [];
	for (const c of toArray(screen.props.children)) collect(c, texts, rows);
	const keyboard = rows.filter((r) => r.length > 0);
	return keyboard.length > 0 ? { text: texts.join(""), keyboard } : { text: texts.join("") };
}

// --- wiring ------------------------------------------------------------------

// Hook state per chat+window. Evicted when a window leaves the stack (via morda's
// onLeave) so a reopened screen re-mounts fresh. Bounded by chats × windows.
const slotStore = new Map<string, unknown[]>();
const hookCounts = new Map<string, number>();

function makeRender(
	windowId: string,
	Component: ScreenComponent,
	idByComponent: Map<ScreenComponent, string>,
): (ctx: DialogContext) => Promise<WindowView> {
	return async (ctx) => {
		const storeKey = `${ctx.chat?.id ?? "_"}:${windowId}`;
		let slots = slotStore.get(storeKey);
		if (!slots) {
			slots = [];
			slotStore.set(storeKey, slots);
		}
		const frame: Frame = { slots, cursor: 0, effects: [], ctx, idByComponent };
		const prev = current;
		current = frame;
		let tree: VNode;
		try {
			tree = Component();
		} finally {
			current = prev;
		}
		// Rules of Hooks: a changed hook count means a conditional hook — fail loud
		// instead of silently reinterpreting slots.
		const expected = hookCounts.get(storeKey);
		if (expected !== undefined && expected !== frame.cursor) {
			throw new Error(
				"morda/jsx: hooks must be called unconditionally (hook count changed between renders)",
			);
		}
		hookCounts.set(storeKey, frame.cursor);
		const view = renderView(tree);
		for (const effect of frame.effects) await effect();
		return view;
	};
}

/** Install a set of JSX screens as a dialog. `bot.install(jsxDialogs({ main, settings }))`. */
export function jsxDialogs(
	screens: Record<string, ScreenComponent>,
	options?: DialogsOptions,
): Plugin<Context, { dialog: DialogControl }> {
	const idByComponent = new Map<ScreenComponent, string>();
	for (const [id, Component] of Object.entries(screens)) idByComponent.set(Component, id);
	const def: DialogDef = {};
	for (const [id, Component] of Object.entries(screens)) {
		def[id] = makeRender(id, Component, idByComponent);
	}
	return dialogs(def, {
		...options,
		onLeave: (chatId, windowId) => {
			const key = `${chatId}:${windowId}`;
			slotStore.delete(key);
			hookCounts.delete(key);
			options?.onLeave?.(chatId, windowId);
		},
	});
}
