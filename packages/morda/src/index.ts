import { callbackData } from "@yaebal/callback-data";
import { Context, type Plugin } from "@yaebal/core";
import { MemoryStorage, type StorageAdapter } from "@yaebal/sklad";
import { type ApiLike, deliverView, removeMessage } from "./deliver.js";
import { KeyedLock, MAX_COMMIT_PASSES, MordaError, shortId } from "./internal.js";
import type {
	AnyDialogDef,
	ButtonDecoration,
	CallbackButton,
	CopyButton,
	DialogContext,
	DialogControl,
	DialogDef,
	DialogDefContext,
	DialogEvents,
	DialogFrame,
	DialogState,
	DialogsOptions,
	DialogTyped,
	RenderFrame,
	StartOptions,
	SwitchInlineButton,
	UrlButton,
	WebAppButton,
	WindowDef,
	WindowIds,
	WindowRender,
	WindowView,
} from "./types.js";

export type { ApiLike } from "./deliver.js";
export { MordaError } from "./internal.js";
export type * from "./types.js";

/** the historical name of {@link CallbackButton}. */
export type Button = CallbackButton;

// ── button helpers ───────────────────────────────────────────────────────────

/** A plain action button. */
export function button<C extends Context = Context>(
	label: string,
	opts: { id: string; onClick?: (ctx: DialogContext<string, C>) => unknown } & ButtonDecoration,
): CallbackButton<C> {
	return { id: opts.id, label, onClick: opts.onClick, icon: opts.icon, style: opts.style };
}

/** A button that pushes another window (optionally with params). */
export function switchTo(
	label: string,
	windowId: string,
	params?: unknown,
	deco: ButtonDecoration = {},
): CallbackButton {
	return {
		id: `to:${windowId}`,
		label,
		onClick: (ctx) => ctx.dialog.push(windowId, params),
		...deco,
	};
}

/** A button that pops the stack (optionally handing `result` to the parent). */
export function back(
	label = "← back",
	result?: unknown,
	deco: ButtonDecoration = {},
): CallbackButton {
	return { id: "back", label, onClick: (ctx) => ctx.dialog.back(result), ...deco };
}

/** A button that closes the whole dialog. */
export function cancel(label = "✕ close", deco: ButtonDecoration = {}): CallbackButton {
	return { id: "cancel", label, onClick: (ctx) => ctx.dialog.close(), ...deco };
}

/** A button that opens a url. */
export function url(label: string, target: string, deco: ButtonDecoration = {}): UrlButton {
	return { label, url: target, ...deco };
}

/** A button that opens a web app. */
export function webApp(label: string, target: string, deco: ButtonDecoration = {}): WebAppButton {
	return { label, webApp: target, ...deco };
}

/** A button that copies `text` to the clipboard. */
export function copy(label: string, text: string, deco: ButtonDecoration = {}): CopyButton {
	return { label, copy: text, ...deco };
}

/** A button that starts an inline query (in another chat, or the current one). */
export function switchInline(
	label: string,
	query = "",
	opts: { currentChat?: boolean } & ButtonDecoration = {},
): SwitchInlineButton {
	return {
		label,
		switchInline: query,
		currentChat: opts.currentChat,
		icon: opts.icon,
		style: opts.style,
	};
}

// ── engine ───────────────────────────────────────────────────────────────────

interface Engine {
	windows: Map<string, WindowDef>;
	/** declaration order; a window goes on the wire as its index (compact + stable). */
	order: string[];
	index: Map<string, number>;
	cd: ReturnType<typeof makeCd>;
	storage: StorageAdapter<DialogState>;
	lock: KeyedLock;
	/** the open lock sections, by key — see {@link Section}. */
	sections: Map<string, Section>;
	prefix: string;
	getKey: (ctx: Context) => string | undefined;
	access?: (ctx: DialogContext) => boolean | Promise<boolean>;
	events: DialogEvents;
	maxStack: number;
}

function makeCd(prefix: string) {
	return callbackData(prefix, { i: String, w: Number, b: String });
}

/** runtime-internal fields carried by every control instance. */
interface ControlInternals {
	_dirty: boolean;
	_nav: number;
}

interface Env {
	engine: Engine;
	api: ApiLike;
	ctx: DialogContext;
	control: DialogControl & ControlInternals;
	key: string;
}

/**
 * one held lock section and the single `DialogState` in flight inside it.
 *
 * every `load()` made while the section is open resolves to the *same* object,
 * so a `setData()`/`update()` from a render or any lifecycle hook mutates the
 * very instance the surrounding code holds and later persists — `save()` stays
 * the only writer and no caller has to know when it is safe to write.
 */
interface Section {
	/** the section's state, read from storage at most once. */
	state?: Promise<DialogState | undefined>;
	/**
	 * a commit pass (or a bare render, when a press is being routed) is on the
	 * stack — `update()`/`rerender()` from in there must ask for another pass
	 * instead of recursing into the one that is already running.
	 */
	committing: boolean;
}

/** run `fn` with the section flagged as committing, restoring the previous flag after. */
async function inCommit<T>(engine: Engine, key: string, fn: () => Promise<T>): Promise<T> {
	const open = engine.sections.get(key);
	if (!open) return fn();
	const was = open.committing;
	open.committing = true;
	try {
		return await fn();
	} finally {
		open.committing = was;
	}
}

/**
 * enter the lock section for `key`. reentrant calls (a control method used
 * inside a hook) join the section that is already open and share its state.
 */
function section<T>(engine: Engine, key: string, fn: (open: Section) => Promise<T>): Promise<T> {
	return engine.lock.run(key, async () => {
		const open = engine.sections.get(key);
		if (open) return fn(open); // reentrant — the outermost section owns the state
		const fresh: Section = { committing: false };
		engine.sections.set(key, fresh);
		try {
			return await fn(fresh);
		} finally {
			engine.sections.delete(key);
		}
	});
}

const storageKey = (engine: Engine, key: string): string => `${engine.prefix}:${key}`;

const load = (engine: Engine, key: string): Promise<DialogState | undefined> => {
	const open = engine.sections.get(key);
	if (!open) return Promise.resolve(engine.storage.get(storageKey(engine, key)));
	open.state ??= Promise.resolve(engine.storage.get(storageKey(engine, key)));
	return open.state;
};

const save = async (engine: Engine, key: string, st: DialogState): Promise<void> => {
	const open = engine.sections.get(key);
	if (open) open.state = Promise.resolve(st);
	await engine.storage.set(storageKey(engine, key), st);
};

const drop = async (engine: Engine, key: string): Promise<void> => {
	const open = engine.sections.get(key);
	if (open) open.state = Promise.resolve(undefined);
	await engine.storage.delete(storageKey(engine, key));
};

/** render a window; `update()`/`rerender()` from inside it fold into a later pass. */
const renderWindow = (
	engine: Engine,
	key: string,
	def: WindowDef,
	ctx: DialogContext,
	rf: RenderFrame,
): Promise<WindowView> => inCommit(engine, key, async () => def.render(ctx, rf));

function windowOf(engine: Engine, id: string): WindowDef {
	const def = engine.windows.get(id);
	if (!def) {
		throw new MordaError(`unknown window "${id}" (have: ${engine.order.join(", ")})`);
	}
	return def;
}

function frameOf(st: DialogState, frame: DialogFrame): RenderFrame {
	frame.hooks ??= [];
	return {
		window: frame.w,
		params: frame.params,
		data: st.data,
		hooks: frame.hooks,
		intent: st.intent,
	};
}

function packFor(engine: Engine, st: DialogState) {
	return (windowId: string, buttonId: string): string =>
		engine.cd.pack({ i: st.intent, w: engine.index.get(windowId) ?? 0, b: buttonId });
}

function findButton(view: WindowView, id: string): CallbackButton | undefined {
	for (const row of view.keyboard ?? []) {
		for (const b of row) if ("id" in b && b.id === id) return b;
	}
	return undefined;
}

/**
 * the render → deliver → persist → onCommit loop. `onCommit` (morda/jsx runs
 * effects there) may `invalidate()` to request another pass; identical renders
 * are skipped inside `deliverView`, so extra passes cost no API calls. every
 * hook this loop calls may write dialog state: they all write into the section's
 * one in-flight `st`, which is what the saves below carry out.
 */
const commit = (env: Env): Promise<void> => inCommit(env.engine, env.key, () => commitPasses(env));

async function commitPasses(env: Env): Promise<void> {
	const { engine, api, ctx, control, key } = env;
	let window = "?";

	for (let pass = 0; pass < MAX_COMMIT_PASSES; pass++) {
		control._dirty = false;
		const st = await load(engine, key);
		const frame = st?.stack[st.stack.length - 1];
		if (!st || !frame) return; // closed mid-flight — nothing to render
		window = frame.w;

		const def = windowOf(engine, frame.w);
		const rf = frameOf(st, frame);
		// the render may itself write dialog state — it writes into `st`, so the save
		// below carries those writes out instead of clobbering them.
		const view = await renderWindow(engine, key, def, ctx, rf);
		await deliverView(api, st, frame.w, view, packFor(engine, st));
		await save(engine, key, st);

		if (def.onCommit) {
			const nav = control._nav;
			await def.onCommit(ctx, rf);
			if (control._nav !== nav) return; // onCommit navigated — it already committed
		}
		if (!control._dirty) return;
		// onCommit mutated frame state after the save above — persist it before the
		// next pass so a crash in between can't lose the write.
		await save(engine, key, st);
	}
	throw new MordaError(
		`window "${window}" re-rendered ${MAX_COMMIT_PASSES}× in one commit — a setState/invalidate loop?`,
	);
}

/** tear a dialog down: leave hooks, message removal, state drop, close event. */
async function closeState(env: Env, st: DialogState, result: unknown): Promise<void> {
	const { engine, api, ctx, key } = env;
	for (let i = st.stack.length - 1; i >= 0; i--) {
		const frame = st.stack[i];
		if (!frame) continue;
		await engine.windows.get(frame.w)?.onLeave?.(ctx, frameOf(st, frame));
	}
	await removeMessage(api, st);
	await drop(engine, key);
	await engine.events.onClose?.(ctx, result);
}

function makeControl(
	engine: Engine,
	api: ApiLike,
	ctx: Context,
	fixedKey?: string,
): DialogControl & ControlInternals {
	const dctx = ctx as DialogContext;
	const keyOf = (): string => {
		const key = fixedKey ?? engine.getKey(ctx);
		if (key === undefined) {
			throw new MordaError("this update has no chat — the dialog control is unavailable here");
		}
		return key;
	};

	const control: DialogControl & ControlInternals = {
		_dirty: false,
		_nav: 0,

		async start(w, options: StartOptions = {}) {
			control._nav++;
			const chatId = ctx.chat?.id;
			if (chatId === undefined) throw new MordaError("start() requires a chat");
			windowOf(engine, w);
			const key = keyOf();
			await section(engine, key, async () => {
				const env: Env = { engine, api, ctx: dctx, control, key };
				const old = await load(engine, key);
				if (old) await closeState(env, old, undefined);

				const st: DialogState = {
					v: 2,
					intent: shortId(),
					stack: [{ w, ...(options.params !== undefined ? { params: options.params } : {}) }],
					data: options.data ?? {},
					chatId,
					messageId: 0,
					hasMedia: false,
					...(ctx.businessConnectionId !== undefined
						? { businessConnectionId: ctx.businessConnectionId }
						: {}),
				};
				await save(engine, key, st);
				const frame = st.stack[0] as DialogFrame;
				const nav = control._nav;
				await engine.windows.get(w)?.onEnter?.(dctx, frameOf(st, frame));
				await save(engine, key, st); // onEnter may have seeded frame state
				if (control._nav === nav) await commit(env);
			});
		},

		async push(w, params) {
			control._nav++;
			windowOf(engine, w);
			const key = keyOf();
			await section(engine, key, async () => {
				const st = await load(engine, key);
				if (!st) throw new MordaError("push() with no active dialog — call start() first");
				if (st.stack.length >= engine.maxStack) {
					throw new MordaError(
						`stack depth cap (${engine.maxStack}) reached — check for a push loop`,
					);
				}
				const frame: DialogFrame = { w, ...(params !== undefined ? { params } : {}) };
				st.stack.push(frame);
				await save(engine, key, st);
				const env: Env = { engine, api, ctx: dctx, control, key };
				const nav = control._nav;
				await engine.windows.get(w)?.onEnter?.(dctx, frameOf(st, frame));
				await save(engine, key, st); // onEnter may have seeded frame state
				if (control._nav === nav) await commit(env);
			});
		},

		async replace(w, params) {
			control._nav++;
			windowOf(engine, w);
			const key = keyOf();
			await section(engine, key, async () => {
				const st = await load(engine, key);
				if (!st) throw new MordaError("replace() with no active dialog — call start() first");
				const top = st.stack[st.stack.length - 1];
				if (top) await engine.windows.get(top.w)?.onLeave?.(dctx, frameOf(st, top));
				const frame: DialogFrame = { w, ...(params !== undefined ? { params } : {}) };
				st.stack[st.stack.length - 1] = frame;
				await save(engine, key, st);
				const env: Env = { engine, api, ctx: dctx, control, key };
				const nav = control._nav;
				await engine.windows.get(w)?.onEnter?.(dctx, frameOf(st, frame));
				await save(engine, key, st); // onEnter may have seeded frame state
				if (control._nav === nav) await commit(env);
			});
		},

		async back(result) {
			control._nav++;
			const key = keyOf();
			await section(engine, key, async () => {
				const st = await load(engine, key);
				if (!st) return; // closing what isn't open is a no-op
				const env: Env = { engine, api, ctx: dctx, control, key };
				const popped = st.stack.pop();
				if (popped) await engine.windows.get(popped.w)?.onLeave?.(dctx, frameOf(st, popped));
				if (st.stack.length === 0) {
					await removeMessage(api, st);
					await drop(engine, key);
					await engine.events.onClose?.(dctx, result);
					return;
				}
				await save(engine, key, st);
				const top = st.stack[st.stack.length - 1] as DialogFrame;
				const nav = control._nav;
				if (result !== undefined) {
					await engine.windows.get(top.w)?.onResult?.(dctx, result, frameOf(st, top));
					await save(engine, key, st); // onResult may have mutated frame state
				}
				if (control._nav === nav) await commit(env);
			});
		},

		async close() {
			control._nav++;
			const key = keyOf();
			await section(engine, key, async () => {
				const st = await load(engine, key);
				if (!st) return;
				await closeState({ engine, api, ctx: dctx, control, key }, st, undefined);
			});
		},

		async rerender() {
			const key = keyOf();
			await section(engine, key, async (open) => {
				// called from inside a commit (a render, or an onCommit effect): ask for
				// another pass instead of recursing into the commit already running.
				if (open.committing) return void control.invalidate();
				await commit({ engine, api, ctx: dctx, control, key });
			});
		},

		invalidate() {
			control._dirty = true;
		},

		async update(patch) {
			const key = keyOf();
			await section(engine, key, async (open) => {
				const st = await load(engine, key);
				if (!st) throw new MordaError("update() with no active dialog");
				Object.assign(st.data, patch);
				await save(engine, key, st);
				if (open.committing) return void control.invalidate(); // see rerender()
				await commit({ engine, api, ctx: dctx, control, key });
			});
		},

		async setData(patch) {
			const key = keyOf();
			await section(engine, key, async () => {
				const st = await load(engine, key);
				if (!st) throw new MordaError("setData() with no active dialog");
				Object.assign(st.data, patch);
				await save(engine, key, st);
			});
		},

		async getData<T = Record<string, unknown>>() {
			const st = await load(engine, keyOf());
			return st?.data as T | undefined;
		},

		async active() {
			return (await load(engine, keyOf())) !== undefined;
		},
	};

	return control;
}

// ── routing middleware ───────────────────────────────────────────────────────

type CallbackOutcome = "handled" | "stale" | "denied" | "foreign";

async function handleCallback(
	engine: Engine,
	ctx: DialogContext,
	next: () => Promise<void>,
): Promise<void> {
	const data = ctx.callbackQuery?.data;
	if (data === undefined || !engine.cd.filter(data)) return next();
	const payload = engine.cd.unpack(data);
	if (!payload) return next();
	const key = engine.getKey(ctx);
	if (key === undefined) return next();

	const control = ctx.dialog as DialogControl & ControlInternals;
	let ours = false;
	let outcome: CallbackOutcome = "foreign";

	try {
		outcome = await section(engine, key, async (): Promise<CallbackOutcome> => {
			const st = await load(engine, key);
			// no state: another install's button, or an expired dialog — let the rest
			// of the bot try. never swallow what we can't prove is ours.
			if (!st) return "foreign";
			if (st.intent !== payload.i) {
				// an outdated instance of ours — or a same-prefix sibling install.
				if (payload.w >= engine.order.length) return "foreign";
				ours = true;
				return "stale";
			}
			ours = true;

			const top = st.stack[st.stack.length - 1];
			if (!top || engine.index.get(top.w) !== payload.w) return "stale";
			if (engine.access && !(await engine.access(ctx))) return "denied";

			const def = windowOf(engine, top.w);
			const rf = frameOf(st, top);
			const view = await renderWindow(engine, key, def, ctx, rf);
			const btn = findButton(view, payload.b);
			// the button vanished from a fresh render (external state moved on) — stale.
			if (!btn) return "stale";

			if (btn.onClick) {
				const env: Env = { engine, api: ctx.api, ctx, control, key };
				const nav = control._nav;
				await btn.onClick(ctx);
				if (control._nav === nav && control._dirty) {
					// `st` is the section's one in-flight state, so this carries out both
					// the frame state onClick mutated (jsx setState) and anything it wrote
					// through setData()/update() — neither can clobber the other.
					await save(engine, key, st);
					await commit(env);
				}
			}
			return "handled";
		});
	} finally {
		// always clear the spinner on our buttons — even when onClick threw.
		if (ours || outcome !== "foreign") await ctx.answerCallbackQuery().catch(() => {});
	}

	if (outcome === "foreign") return next();
	if (outcome === "stale") await engine.events.onStale?.(ctx);
	if (outcome === "denied") await engine.events.onAccessDenied?.(ctx);
}

async function handleText(
	engine: Engine,
	ctx: DialogContext,
	next: () => Promise<void>,
): Promise<void> {
	if (ctx.updateType !== "message" && ctx.updateType !== "business_message") return next();
	const text = ctx.message?.text;
	if (text === undefined || text.startsWith("/")) return next();
	const key = engine.getKey(ctx);
	if (key === undefined) return next();

	const control = ctx.dialog as DialogControl & ControlInternals;
	let handled = false;

	await section(engine, key, async () => {
		const st = await load(engine, key);
		const top = st?.stack[st.stack.length - 1];
		if (!st || !top) return;
		const def = engine.windows.get(top.w);
		if (!def?.onText) return;
		if (engine.access && !(await engine.access(ctx))) return;

		const rf = frameOf(st, top);
		const nav = control._nav;
		const result = await def.onText(ctx as DialogContext & { text: string }, rf);
		if (result === false) return; // declined — fall through to other handlers
		handled = true;
		if (control._nav === nav && control._dirty) {
			await save(engine, key, st); // same in-flight state onText wrote through — see handleCallback
			await commit({ engine, api: ctx.api, ctx, control, key });
		}
	});

	if (!handled) return next();
}

// ── construction ─────────────────────────────────────────────────────────────

function buildEngine(def: AnyDialogDef, options: DialogsOptions): Engine {
	const order = Object.keys(def);
	if (order.length === 0) throw new MordaError("dialogs() needs at least one window");

	const prefix = options.prefix ?? "dlg";
	if (!/^[\w-]{1,8}$/.test(prefix)) {
		throw new MordaError(`prefix "${prefix}" must be 1-8 chars of [a-zA-Z0-9_-]`);
	}

	const windows = new Map<string, WindowDef>();
	const index = new Map<string, number>();
	for (const [i, id] of order.entries()) {
		const entry = def[id] as WindowRender | WindowDef;
		windows.set(id, typeof entry === "function" ? { render: entry } : entry);
		index.set(id, i);
	}

	const defaultGetKey = (ctx: Context): string | undefined => {
		const chat = ctx.chat;
		if (!chat) return undefined;
		// groups get per-user dialogs so members can't hijack each other's menus.
		if (chat.type === "private") return String(chat.id);
		return ctx.from ? `${chat.id}:${ctx.from.id}` : String(chat.id);
	};

	return {
		windows,
		order,
		index,
		cd: makeCd(prefix),
		// clone: false — nothing else reads this store, so copying on every get/set is
		// pure cost. reference identity within one update comes from the lock Section,
		// not from the adapter, so a serializing storage behaves identically here.
		storage: options.storage ?? new MemoryStorage<DialogState>({ clone: false }),
		lock: new KeyedLock(),
		sections: new Map(),
		prefix,
		getKey: options.getKey ?? defaultGetKey,
		access: options.access,
		events: options.events ?? {},
		maxStack: options.maxStack ?? 32,
	};
}

/**
 * Dialogs engine. Declarative windows rendered into one message, callback
 * routing by stable button id, a persisted navigation stack, per-key locking,
 * stale-press detection, and edit/delete fallbacks for everything Telegram can
 * refuse — no manual `editMessageText` or `callback_data` wrangling.
 *
 * Returns the plugin plus a `background` handle for editing a dialog from
 * outside an update (timers, queues, webhooks).
 */
export function createDialogs<const D extends DialogTyped<Context>>(
	def: D,
	options?: DialogsOptions<DialogDefContext<D>>,
): {
	plugin: Plugin<DialogDefContext<D>, { dialog: DialogControl<WindowIds<D>> }>;
	background: (api: ApiLike, key: string) => Promise<DialogControl<WindowIds<D>> | undefined>;
};
export function createDialogs<const D extends DialogDef>(
	def: D,
	options?: DialogsOptions,
): {
	plugin: Plugin<Context, { dialog: DialogControl<WindowIds<D>> }>;
	background: (api: ApiLike, key: string) => Promise<DialogControl<WindowIds<D>> | undefined>;
};
export function createDialogs(
	def: AnyDialogDef,
	options: DialogsOptions = {},
): {
	plugin: Plugin<Context, { dialog: DialogControl<string> }>;
	background: (api: ApiLike, key: string) => Promise<DialogControl<string> | undefined>;
} {
	const engine = buildEngine(def, options);

	// built against the bare Context (the runtime needs nothing more); the typed
	// overload narrows the returned plugin to the declared ambient context — the
	// same shape scenes() uses. sound: the plugin only *adds* `dialog` and never
	// relies on that context's extra fields.
	const plugin: Plugin<Context, { dialog: DialogControl<string> }> = (composer) =>
		composer
			.derive((ctx) => ({
				dialog: makeControl(engine, ctx.api, ctx) as DialogControl<string>,
			}))
			.use(async (ctx, next) => {
				const dctx = ctx as unknown as DialogContext;
				if (ctx.updateType === "callback_query") return handleCallback(engine, dctx, next);
				return handleText(engine, dctx, next);
			});

	/**
	 * a headless control for a dialog opened earlier — `key` is the same value
	 * `getKey` produced (chat id, or `chat:user` in groups). resolves `undefined`
	 * when that key has no open dialog. renders run with a synthetic context:
	 * `ctx.chat` carries the stored chat id, `ctx.from` is undefined.
	 */
	async function background(api: ApiLike, key: string): Promise<DialogControl<string> | undefined> {
		const st = await load(engine, key);
		if (!st) return undefined;

		const ctx = new Context({
			api: api as never,
			update: { update_id: 0 } as never,
			updateType: "message",
		});
		Object.defineProperty(ctx, "chat", {
			value: { id: st.chatId, type: "private" },
			configurable: true,
		});
		const control = makeControl(engine, api, ctx, key);
		(ctx as DialogContext).dialog = control;
		return control;
	}

	return { plugin, background };
}

/** {@link createDialogs} without the background handle. */
export function dialogs<const D extends DialogTyped<Context>>(
	def: D,
	options?: DialogsOptions<DialogDefContext<D>>,
): Plugin<DialogDefContext<D>, { dialog: DialogControl<WindowIds<D>> }>;
export function dialogs<const D extends DialogDef>(
	def: D,
	options?: DialogsOptions,
): Plugin<Context, { dialog: DialogControl<WindowIds<D>> }>;
export function dialogs(
	def: AnyDialogDef,
	options: DialogsOptions = {},
): Plugin<Context, { dialog: DialogControl<string> }> {
	return createDialogs(def, options).plugin;
}

/**
 * declare the ambient context a dialog's windows are written against. curried so the
 * window map keeps its literal ids while `C` stays explicit:
 *
 * ```ts
 * type MyContext = Context & { session: { count: number } };
 *
 * const def = defineDialog<MyContext>()({
 *   start: {
 *     render: (ctx) => ({ text: `count: ${ctx.session.count}` }), // typed — no casts
 *     onText: (ctx) => void ctx.session.count++,
 *   },
 * });
 *
 * bot.install(session({ initial: () => ({ count: 0 }) })).install(dialogs(def));
 * // installing dialogs(def) on a bot that lacks MyContext is a compile error
 * ```
 *
 * on a `createBot()` bot the runtime context inside windows is the rich per-update
 * class, so `C` may include it (e.g. `MessageContext & { session: ... }`) — then
 * shortcuts like `ctx.delete()` type-check inside `onText`/`onClick` too.
 */
export function defineDialog<C extends Context = Context>(): <const D extends DialogDef<C>>(
	def: D,
) => D & DialogTyped<C> {
	return (def) => def as typeof def & DialogTyped<C>;
}
