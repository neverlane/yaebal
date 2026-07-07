import type { Context, FormatResult, MediaSource } from "@yaebal/core";
import type { StorageAdapter } from "@yaebal/session";

/** context inside a dialog: the base context plus the navigation control. */
export type DialogContext<W extends string = string> = Context & { dialog: DialogControl<W> };

/** message text: plain string or a `format`/`fmt` result (entities flow to the wire). */
export type DialogText = string | FormatResult;

/** a tappable button routed back into the dialog by stable id. */
export interface CallbackButton {
	id: string;
	label: string;
	onClick?: (ctx: DialogContext) => unknown;
}

/** opens a url. */
export interface UrlButton {
	label: string;
	url: string;
}

/** opens a web app. */
export interface WebAppButton {
	label: string;
	webApp: string;
}

/** copies text to the clipboard. */
export interface CopyButton {
	label: string;
	copy: string;
}

/** starts an inline query in another chat (or the current one). */
export interface SwitchInlineButton {
	label: string;
	switchInline: string;
	currentChat?: boolean;
}

/** any button a window can render. */
export type DialogButton =
	| CallbackButton
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
export interface WindowView {
	text: DialogText;
	keyboard?: DialogButton[][];
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
export type WindowRender<W extends string = string> = (
	ctx: DialogContext<W>,
	frame: RenderFrame,
) => WindowView | Promise<WindowView>;

/** a window with lifecycle: render plus optional enter/leave/input/result hooks. */
export interface WindowDef<W extends string = string> {
	render: WindowRender<W>;
	/** fired when the window is pushed onto (or replaces the top of) the stack. */
	onEnter?: (ctx: DialogContext<W>, frame: RenderFrame) => unknown;
	/** fired when the window leaves the stack (popped, replaced, or dialog closed). */
	onLeave?: (ctx: DialogContext<W>, frame: RenderFrame) => unknown;
	/**
	 * consume a text message sent while this window is on top. commands (`/…`)
	 * are never routed here. return `false` to decline — the update then falls
	 * through to the rest of the bot's handlers.
	 */
	onText?: (ctx: DialogContext<W> & { text: string }, frame: RenderFrame) => unknown;
	/** receives the value a child window passed to `back(result)`. */
	onResult?: (ctx: DialogContext<W>, result: unknown, frame: RenderFrame) => unknown;
	/**
	 * runs after the rendered view is delivered and the state persisted.
	 * `ctx.dialog.invalidate()` inside re-renders (morda/jsx runs effects here).
	 */
	onCommit?: (ctx: DialogContext<W>, frame: RenderFrame) => unknown;
}

/** a dialog is a flat map of named windows (bare render fn or full `WindowDef`). */
export type DialogDef = Record<string, WindowRender | WindowDef>;

/** the window-id union of a def — `start`/`push`/`replace` only accept these. */
export type WindowIds<D extends DialogDef> = Extract<keyof D, string>;

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
export interface DialogEvents {
	/** a press on an outdated keyboard (old instance or a window no longer on top). */
	onStale?: (ctx: DialogContext) => unknown;
	/** the `access` predicate rejected the interaction. */
	onAccessDenied?: (ctx: DialogContext) => unknown;
	/** the dialog fully closed; `result` comes from `back(result)` at the root. */
	onClose?: (ctx: DialogContext, result: unknown) => unknown;
}

export interface DialogsOptions {
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
	getKey?: (ctx: Context) => string | undefined;
	/** gate who may interact with an open dialog (checked on every press/input). */
	access?: (ctx: DialogContext) => boolean | Promise<boolean>;
	/** engine event hooks (stale press, access denied, dialog closed). */
	events?: DialogEvents;
	/** navigation stack depth cap (default 32). `push` beyond it throws. */
	maxStack?: number;
}
