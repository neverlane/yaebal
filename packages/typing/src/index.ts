import type { Context, Plugin } from "@yaebal/core";
import type { SendChatActionParams } from "@yaebal/types";

/** the chat action telegram shows while it's set — `"typing"`, `"upload_photo"`, … */
export type ChatAction = SendChatActionParams["action"];

/** telegram clears a chat action ~5s after the last `sendChatAction` call. */
const DEFAULT_INTERVAL_MS = 4000;

export interface TypingOptions {
	/** chat action to display while `fn` runs. defaults to `"typing"`. */
	action?: ChatAction;
	/** how often to re-send the action, in ms, so it survives telegram's ~5s expiry. defaults to 4000. */
	intervalMs?: number;
	/** observe a failed `sendChatAction` call. swallowed either way — never aborts `fn`. */
	onError?: (error: unknown) => unknown;
}

export interface TypingControl {
	/** send a chat action once — the plain "is typing…" indicator. defaults to `"typing"`. */
	typing(action?: ChatAction): Promise<boolean>;
	/**
	 * show `action` (default `"typing"`) for as long as `fn` is pending: sent immediately,
	 * re-sent on `intervalMs` so it doesn't expire mid-flight, and cleared the instant `fn`
	 * settles (resolves or rejects). handy for long LLM/API calls:
	 * `ctx.typing(() => llm.complete(prompt))`.
	 */
	typing<T>(fn: () => Promise<T>, options?: TypingOptions): Promise<T>;
}

/**
 * installs `ctx.typing()` — see {@link TypingControl}. `defaults` seed every keep-alive
 * call's options (`action`, `intervalMs`, `onError`), overridable per call.
 */
export function typing(defaults: TypingOptions = {}): Plugin<Context, TypingControl> {
	return (composer) =>
		composer.derive((ctx) => {
			const sendAction = (action: ChatAction): Promise<boolean> => {
				const chatId = ctx.chat?.id;
				if (chatId === undefined) {
					return Promise.reject(new Error("typing(): no chat in this update"));
				}

				return ctx.api.call<boolean>("sendChatAction", {
					chat_id: chatId,
					action,
					...ctx.routing(),
				});
			};

			function ctxTyping(action?: ChatAction): Promise<boolean>;
			function ctxTyping<T>(fn: () => Promise<T>, options?: TypingOptions): Promise<T>;
			function ctxTyping<T>(
				actionOrFn?: ChatAction | (() => Promise<T>),
				options: TypingOptions = {},
			): Promise<boolean> | Promise<T> {
				if (typeof actionOrFn !== "function") return sendAction(actionOrFn ?? "typing");

				// no chat to show an indicator in — the operation itself still matters, run it plain.
				if (ctx.chat?.id === undefined) return actionOrFn();

				const opts = { ...defaults, ...options };
				const action = opts.action ?? "typing";
				const intervalMs = opts.intervalMs ?? DEFAULT_INTERVAL_MS;

				const ping = (): void => {
					sendAction(action).catch((error) => opts.onError?.(error));
				};
				ping();
				const timer = setInterval(ping, intervalMs);

				return actionOrFn().finally(() => clearInterval(timer));
			}

			const control: TypingControl = { typing: ctxTyping };
			return control;
		});
}
