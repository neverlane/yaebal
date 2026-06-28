import type { Context, FormatResult, Message, Plugin } from "@yaebal/core";

/** handles the message that answers a prompt. may call `ctx.prompt` again to chain. */
export type PromptHandler = (ctx: Context) => unknown | Promise<unknown>;

export interface PromptControl {
	/** send `question`, then run `handler` on the next message in this chat. */
	prompt(
		question: string | FormatResult,
		handler: PromptHandler,
		extra?: Record<string, unknown>,
	): Promise<Message>;
}

export interface PromptOptions {
	/** prompt key for an update. defaults to per-chat (`ctx.chat.id`). */
	getKey?: (ctx: Context) => string | undefined;
}

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
	const getKey = options.getKey ?? ((ctx: Context) => ctx.chat?.id?.toString());

	const plugin: Plugin<Context, PromptControl> = (composer) =>
		composer
			.derive((ctx) => ({
				prompt: (
					question: string | FormatResult,
					handler: PromptHandler,
					extra: Record<string, unknown> = {},
				) => {
					const key = getKey(ctx);
					if (key !== undefined) pending.set(key, handler);

					return ctx.send(question, extra);
				},
			}))
			.use(async (ctx, next) => {
				const key = getKey(ctx);
				
				if (key !== undefined && ctx.message) {
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
