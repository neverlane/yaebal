import { callbackData } from "@yaebal/callback-data";
import type { Context, Plugin } from "@yaebal/core";
import { InlineKeyboard, type InlineKeyboardMarkup } from "@yaebal/keyboard";
import { MemoryStorage, type StorageAdapter } from "@yaebal/session";

/** context inside a dialog: the base context plus the navigation control. */
export type DialogContext = Context & { dialog: DialogControl };

/** a single button. `onClick` may navigate via `ctx.dialog`. */
export interface Button {
	id: string;
	label: string;
	onClick?: (ctx: DialogContext) => unknown;
}

/** what a window renders to: a message text and rows of buttons. */
export interface WindowView {
	text: string;
	keyboard?: Button[][];
}

/** a window is rendered on demand, so its text/buttons can depend on context. */
export type WindowRender = (ctx: DialogContext) => WindowView | Promise<WindowView>;

/** a dialog is a flat map of named windows. */
export type DialogDef = Record<string, WindowRender>;

/** navigation control exposed as `ctx.dialog`. */
export interface DialogControl {
	/** open a window in a fresh message + stack. */
	start(windowId: string): Promise<void>;
	/** push a window onto the stack and edit the message. */
	push(windowId: string): Promise<void>;
	/** replace the top window and edit the message. */
	replace(windowId: string): Promise<void>;
	/** pop the stack; closing the dialog (deleting the message) at the root. */
	back(): Promise<void>;
	/** re-render the current window in place (after mutating external state). */
	rerender(): Promise<void>;
}

/** persisted per-chat navigation state. */
export interface DialogState {
	stack: string[];
	messageId: number;
	chatId: number;
}

export interface DialogsOptions {
	/** where to persist navigation state. defaults to in-memory (lost on restart). */
	storage?: StorageAdapter<DialogState>;
	/** fired when a window leaves the stack (popped, replaced, or dialog restarted).
	 *  the JSX layer uses this to drop a window's hook state so it re-mounts fresh. */
	onLeave?: (chatId: number, windowId: string) => void;
}

/** A button that navigates to another window. */
export function switchTo(label: string, windowId: string): Button {
	return { id: `to:${windowId}`, label, onClick: (ctx) => ctx.dialog.push(windowId) };
}

/** A button that pops the stack. */
export function back(label = "← Назад"): Button {
	return { id: "back", label, onClick: (ctx) => ctx.dialog.back() };
}

/** A plain action button. */
export function button(
	label: string,
	opts: { id: string; onClick?: (ctx: DialogContext) => unknown },
): Button {
	return { id: opts.id, label, onClick: opts.onClick };
}

function findButton(view: WindowView, id: string): Button | undefined {
	for (const row of view.keyboard ?? []) {
		for (const b of row) if (b.id === id) return b;
	}
	return undefined;
}

/**
 * Dialogs plugin. Renders declarative windows, routes button presses by stable
 * id, and maintains a per-chat navigation stack — no manual `editMessageText`
 * or callback_data wrangling.
 *
 * ponytail: builder-API has no auto re-render on state change — call
 * `ctx.dialog.rerender()` after mutating data a window reads. The JSX/hooks
 * layer (M2b) automates this via `useState`.
 */
export function dialogs(
	def: DialogDef,
	options: DialogsOptions = {},
): Plugin<Context, { dialog: DialogControl }> {
	const storage = options.storage ?? new MemoryStorage<DialogState>();
	const cd = callbackData("dlg", { w: String, b: String });

	const renderKeyboard = (windowId: string, view: WindowView): InlineKeyboardMarkup => {
		const kb = new InlineKeyboard();
		for (const row of view.keyboard ?? []) {
			for (const b of row) kb.text(b.label, cd.pack({ w: windowId, b: b.id }));
			kb.row();
		}
		return kb.build();
	};

	const renderWindow = async (w: string, ctx: DialogContext): Promise<WindowView> => {
		const window = def[w];
		if (!window) throw new Error(`morda: unknown window "${w}"`);
		return window(ctx);
	};

	const control = (ctx: Context): DialogControl => {
		const dctx = ctx as DialogContext;
		const chatId = ctx.chat?.id;
		const key = chatId?.toString();

		const load = async (): Promise<DialogState | undefined> =>
			key === undefined ? undefined : storage.get(key);

		const edit = async (st: DialogState): Promise<void> => {
			const w = st.stack[st.stack.length - 1];
			if (w === undefined || key === undefined) return;
			const view = await renderWindow(w, dctx);
			await ctx.api.call("editMessageText", {
				chat_id: st.chatId,
				message_id: st.messageId,
				text: view.text,
				reply_markup: renderKeyboard(w, view),
			});
			await storage.set(key, st);
		};

		return {
			async start(w) {
				if (chatId === undefined || key === undefined) {
					throw new Error("morda: start() requires a chat");
				}
				const old = await storage.get(key);
				if (old) for (const win of old.stack) options.onLeave?.(chatId, win);
				const view = await renderWindow(w, dctx);
				const msg = await ctx.send(view.text, { reply_markup: renderKeyboard(w, view) });
				await storage.set(key, { stack: [w], messageId: msg.message_id, chatId });
			},
			async push(w) {
				const st = await load();
				if (!st) throw new Error("morda: push() with no active dialog");
				st.stack.push(w);
				await edit(st);
			},
			async replace(w) {
				const st = await load();
				if (!st) throw new Error("morda: replace() with no active dialog");
				const oldTop = st.stack[st.stack.length - 1];
				if (oldTop !== undefined && chatId !== undefined) options.onLeave?.(chatId, oldTop);
				st.stack[st.stack.length - 1] = w;
				await edit(st);
			},
			async back() {
				const st = await load();
				if (!st || key === undefined) return;
				const popped = st.stack.pop();
				if (popped !== undefined && chatId !== undefined) options.onLeave?.(chatId, popped);
				if (st.stack.length === 0) {
					await ctx.api.call("deleteMessage", {
						chat_id: st.chatId,
						message_id: st.messageId,
					});
					await storage.delete(key);
					return;
				}
				await edit(st);
			},
			async rerender() {
				const st = await load();
				if (st) await edit(st);
			},
		};
	};

	// the Out type flows from `derive`, so no unsafe plugin cast is needed
	const plugin: Plugin<Context, { dialog: DialogControl }> = (composer) =>
		composer
			// expose ctx.dialog on every update
			.derive((ctx) => ({ dialog: control(ctx) }))
			// route dialog button presses; pass through everything else
			.use(async (ctx, next) => {
				const data = ctx.callbackQuery?.data;
				if (data === undefined || !cd.filter(data)) return next();
				const payload = cd.unpack(data);
				if (!payload) return next();
				// clear the loading spinner; harmless if onClick answers again below
				const answer = () => ctx.answerCallbackQuery().catch(() => {});
				// stale-press guard: ignore presses whose window isn't the live stack top
				// (e.g. a double-tap on an old keyboard before the edit landed).
				const key = ctx.chat?.id?.toString();
				const state = key === undefined ? undefined : await storage.get(key);
				if (!state || state.stack[state.stack.length - 1] !== payload.w) {
					await answer();
					return;
				}
				const window = def[payload.w];
				if (window) {
					const view = await window(ctx as DialogContext);
					const btn = findButton(view, payload.b);
					if (btn?.onClick) await btn.onClick(ctx as DialogContext);
				}
				await answer();
			});
	return plugin;
}
