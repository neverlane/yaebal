import type { Context, FormatResult, MediaSource } from "@yaebal/core";
import type { ButtonStyle } from "@yaebal/keyboard";
import type { StorageAdapter } from "@yaebal/sklad";

export type { ButtonStyle } from "@yaebal/keyboard";

/**
 * context inside a dialog: the ambient context plus the navigation control.
 * `C` is the bot's accumulated context — declare it via {@link defineDialog} and window
 * callbacks see plugin-added fields (and, on a `createBot` bot, the rich per-update
 * shortcuts) instead of the bare core `Context`.
 */
export type DialogContext<W extends string = string, C extends Context = Context> = C & {
	dialog: DialogControl<W>;
};

/** message text: plain string or a `format`/`fmt` result (entities flow to the wire). */
export type DialogText = string | FormatResult;

/** icon + style shared by every dialog button, forwarded to the inline keyboard. */
export interface ButtonDecoration {
	/** custom emoji id shown before the label (`icon_custom_emoji_id`). */
	icon?: string;
	/** button style: `"danger" | "success" | "primary"`. */
	style?: ButtonStyle;
}

/** a tappable button routed back into the dialog by stable id. */
export interface CallbackButton<C extends Context = Context> extends ButtonDecoration {
	id: string;
	label: string;
	onClick?: (ctx: DialogContext<string, C>) => unknown;
}

/** opens a url. */
export interface UrlButton extends ButtonDecoration {
	label: string;
	url: string;
}

/** opens a web app. */
export interface WebAppButton extends ButtonDecoration {
	label: string;
	webApp: string;
}

/** copies text to the clipboard. */
export interface CopyButton extends ButtonDecoration {
	label: string;
	copy: string;
}

/** starts an inline query in another chat (or the current one). */
export interface SwitchInlineButton extends ButtonDecoration {
	label: string;
	switchInline: string;
	currentChat?: boolean;
}

/** any button a window can render. */
export type DialogButton<C extends Context = Context> =
	| CallbackButton<C>
	| UrlButton
	| WebAppButton
	| CopyButton
	| SwitchInlineButton;

/** a media attachment shown above the text (text becomes the caption). */
export interface WindowMedia {
	type: "photo" | "video" | "animation" | "document" | "audio";
	/** file_id, https url, or a `media.*` source (uploads go multipart automatically). */
	media: string | MediaSource;
}

/** what a window renders to. */
export interface WindowView<C extends Context = Context> {
	text: DialogText;
	keyboard?: DialogButton<C>[][];
	media?: WindowMedia;
	/** show link previews for urls in `text`. omit for telegram's default. */
	linkPreview?: boolean;
}

/**
 * everything a render (or lifecycle hook) can reach beyond the context:
 * navigation params, the dialog-wide data bag, and the window's persisted slots.
 */
export interface RenderFrame {
	/** the window id this frame renders. */
	window: string;
	/** params passed to `start`/`push`/`replace` for this window. JSON-serializable. */
	params: unknown;
	/** dialog-wide mutable bag, persisted across windows. JSON-serializable values. */
	data: Record<string, unknown>;
	/**
	 * per-window persisted slots (survive restarts with a persistent storage).
	 * morda/jsx stores hook state here; builder code normally uses `data` instead.
	 */
	hooks: unknown[];
	/** the dialog instance id — changes on every `start`, drives stale-press detection. */
	intent: string;
}

/** a window rendered on demand — text/buttons can depend on context and frame. */
export type WindowRender<W extends string = string, C extends Context = Context> = (
	ctx: DialogContext<W, C>,
	frame: RenderFrame,
) => WindowView<C> | Promise<WindowView<C>>;

/** a window with lifecycle: render plus optional enter/leave/input/result hooks. */
export interface WindowDef<W extends string = string, C extends Context = Context> {
	render: WindowRender<W, C>;
	/** fired when the window is pushed onto (or replaces the top of) the stack. */
	onEnter?: (ctx: DialogContext<W, C>, frame: RenderFrame) => unknown;
	/** fired when the window leaves the stack (popped, replaced, or dialog closed). */
	onLeave?: (ctx: DialogContext<W, C>, frame: RenderFrame) => unknown;
	/**
	 * consume a text message sent while this window is on top. commands (`/…`)
	 * are never routed here. return `false` to decline — the update then falls
	 * through to the rest of the bot's handlers.
	 */
	onText?: (ctx: DialogContext<W, C> & { text: string }, frame: RenderFrame) => unknown;
	/** receives the value a child window passed to `back(result)`. */
	onResult?: (ctx: DialogContext<W, C>, result: unknown, frame: RenderFrame) => unknown;
	/**
	 * runs after the rendered view is delivered and the state persisted.
	 * `ctx.dialog.invalidate()` inside re-renders (morda/jsx runs effects here).
	 */
	onCommit?: (ctx: DialogContext<W, C>, frame: RenderFrame) => unknown;
}

/** a dialog is a flat map of named windows (bare render fn or full `WindowDef`). */
export type DialogDef<C extends Context = Context> = Record<
	string,
	WindowRender<string, C> | WindowDef<string, C>
>;

// biome-ignore lint/suspicious/noExplicitAny: variance escape hatch — window callbacks put `C` in parameter (contravariant) position, so `DialogDef<MyContext>` does not extend `DialogDef<Context>`; `any` is what lets one constraint accept every precisely-typed def (the real context is re-extracted via DialogDefContext).
export type AnyDialogDef = DialogDef<any>;

/**
 * the phantom key {@link DialogTyped} hangs the declared context off. a `unique symbol`
 * (not a string) so the carrier coexists with `DialogDef`'s string index signature and
 * never shows up in {@link WindowIds}. purely type-level — nothing exists at runtime.
 */
export declare const dialogContextBrand: unique symbol;

/**
 * type-level carrier for the ambient context a def was written against — attached by
 * {@link defineDialog}, never present at runtime (the `"~types"` trick from scenes/core).
 * the property is required *at the type level* so branded defs are distinguishable from
 * bare window maps in overload resolution — nothing ever reads it.
 */
export interface DialogTyped<C extends Context> {
	readonly [dialogContextBrand]: C;
}

/** the ambient context a def declared via {@link defineDialog}; bare defs fall back to `Context`. */
export type DialogDefContext<D> = D extends DialogTyped<infer C extends Context> ? C : Context;

/**
 * the window-id union of a def — `start`/`push`/`replace` only accept these.
 * unconstrained on purpose: `defineDialog` products are intersections, which typescript
 * refuses to relate to `DialogDef`'s index signature even though every window matches.
 */
export type WindowIds<D> = Extract<keyof D, string>;

export interface StartOptions {
	/** params for the first window (read as `frame.params`). JSON-serializable. */
	params?: unknown;
	/** seed the dialog-wide `data` bag. */
	data?: Record<string, unknown>;
}

/** navigation control exposed as `ctx.dialog`. */
export interface DialogControl<W extends string = string> {
	/** open a window in a fresh message + stack (closing any previous dialog). */
	start(window: W, options?: StartOptions): Promise<void>;
	/** push a window onto the stack and edit the message in place. */
	push(window: W, params?: unknown): Promise<void>;
	/** replace the top window and edit the message in place. */
	replace(window: W, params?: unknown): Promise<void>;
	/**
	 * pop the stack; at the root this closes the dialog. `result` is handed to
	 * the parent window's `onResult` (or `events.onClose` at the root).
	 */
	back(result?: unknown): Promise<void>;
	/** close the whole dialog: delete the message, drop the state. */
	close(): Promise<void>;
	/** re-render the current window in place, right now. */
	rerender(): Promise<void>;
	/**
	 * schedule one re-render after the current handler finishes. calling it many
	 * times in one handler still produces a single `editMessageText`.
	 */
	invalidate(): void;
	/** merge into the dialog `data` bag and re-render. */
	update(patch: Record<string, unknown>): Promise<void>;
	/** merge into the dialog `data` bag and persist — no render. */
	setData(patch: Record<string, unknown>): Promise<void>;
	/** read the dialog `data` bag (undefined when no dialog is open). */
	getData<T = Record<string, unknown>>(): Promise<T | undefined>;
	/** whether a dialog is currently open for this chat/user. */
	active(): Promise<boolean>;
}

/** one entry of the navigation stack, as persisted. */
export interface DialogFrame {
	w: string;
	params?: unknown;
	hooks?: unknown[];
}

/** persisted per-key dialog state. treat as opaque — the shape may change. */
export interface DialogState {
	v: 2;
	/** dialog instance id — a press from a previous instance is stale. */
	intent: string;
	stack: DialogFrame[];
	data: Record<string, unknown>;
	chatId: number;
	messageId: number;
	businessConnectionId?: string;
	hasMedia: boolean;
	/** signature of the last delivered render — skips no-op edits. */
	last?: string;
}

/** engine-level event hooks. all optional; the engine stays silent by default. */
export interface DialogEvents<C extends Context = Context> {
	/** a press on an outdated keyboard (old instance or a window no longer on top). */
	onStale?: (ctx: DialogContext<string, C>) => unknown;
	/** the `access` predicate rejected the interaction. */
	onAccessDenied?: (ctx: DialogContext<string, C>) => unknown;
	/** the dialog fully closed; `result` comes from `back(result)` at the root. */
	onClose?: (ctx: DialogContext<string, C>, result: unknown) => unknown;
}

export interface DialogsOptions<C extends Context = Context> {
	/** where to persist navigation state. defaults to in-memory (lost on restart). */
	storage?: StorageAdapter<DialogState>;
	/**
	 * callback_data namespace for this install. **must be unique per `dialogs()`
	 * install** or installs will swallow each other's presses. default `"dlg"`.
	 */
	prefix?: string;
	/**
	 * state key for an update. default: the chat id in private chats and
	 * `chat:user` elsewhere — so every group member gets an independent dialog.
	 */
	getKey?: (ctx: C) => string | undefined;
	/** gate who may interact with an open dialog (checked on every press/input). */
	access?: (ctx: DialogContext<string, C>) => boolean | Promise<boolean>;
	/** engine event hooks (stale press, access denied, dialog closed). */
	events?: DialogEvents<C>;
	/** navigation stack depth cap (default 32). `push` beyond it throws. */
	maxStack?: number;
}
