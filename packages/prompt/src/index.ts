import {
	COMMAND_UPDATES,
	type Context,
	type FormatResult,
	type Message,
	type Plugin,
} from "@yaebal/core";

export interface PromptControl {
	/** send `question`, then run `handler` on the next message in this chat. */
	prompt(
		question: string | FormatResult,
		handler: PromptHandler,
		extra?: Record<string, unknown>,
	): Promise<Message>;
}

/** handles the message that answers a prompt. may call `ctx.prompt` again to chain. */
export type PromptHandler = (ctx: Context & PromptControl) => unknown | Promise<unknown>;

export interface PromptOptions {
	/**
	 * prompt key for an update. defaults to per user per chat (`"<chat>:<user>"`), so in a group
	 * only the member who was asked can answer; pass `(ctx) => ctx.chat?.id.toString()` for the
	 * old shared per-chat behavior.
	 */
	getKey?: (ctx: Context) => string | undefined;
}

/** `"<chat>:<user>"` — the asked member's answer, not whoever in the group types next. */
const perChatUser = (ctx: Context): string | undefined => {
	const chat = ctx.chat?.id;
	if (chat === undefined) return undefined;
	const from = ctx.from?.id;
	return from === undefined ? String(chat) : `${chat}:${from}`;
};

/**
 * prompt plugin: `ctx.prompt(question, handler)` sends a question and runs the
 * handler on the next message — no suspended promise, so it is safe under the
 * sequential update loop. pending handlers are in-memory (lost on restart).
 *
 * the answering message is consumed, so a user typing `/menu` instead of an
 * answer has it eaten by the pending handler — check for an escape in the handler
 * if that matters.
 */
export function prompt(options: PromptOptions = {}): Plugin<Context, PromptControl> {
	const pending = new Map<string, PromptHandler>();
	const getKey = options.getKey ?? perChatUser;

	const plugin: Plugin<Context, PromptControl> = (composer) =>
		composer
			.derive((ctx) => ({
				prompt: (
					question: string | FormatResult,
					handler: PromptHandler,
					extra: Record<string, unknown> = {},
				) => {
					const key = getKey(ctx);

					// armed only once the question is out — a failed send must not eat the user's
					// next message as the answer to a question they never saw
					return ctx.send(question, extra).then((sent) => {
						if (key !== undefined) pending.set(key, handler);
						return sent;
					});
				},
			}))
			.use(async (ctx, next) => {
				const key = getKey(ctx);

				// fresh messages only: an edit of some older message is not an answer
				if (key !== undefined && COMMAND_UPDATES.has(ctx.updateType)) {
					const handler = pending.get(key);

					if (handler) {
						pending.delete(key);
						await handler(ctx);

						return; // consumed
					}
				}
				await next();
			});

	return plugin;
}
