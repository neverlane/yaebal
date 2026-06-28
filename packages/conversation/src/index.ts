import type { Context, Plugin } from "@yaebal/core";

/**
 * @yaebal/conversation — write multi-step dialogs as a straight line:
 *
 *   const greet = createConversation("greet", async (cv, ctx) => {
 *     await ctx.send("what's your name?");
 * 
 *     const answer = await cv.wait();
 *     await answer.send(`hi ${answer.text}`);
 *   });
 *   bot.install(conversation([greet]));
 *   bot.command("greet", (ctx) => ctx.conversation.enter("greet"));
 *
 * it's a COROUTINE, not a replay engine (grammY-style): the builder runs once,
 * detached, and `cv.wait()` resolves with the next update for that chat. while a
 * conversation is active it OWNS the chat's updates (they don't reach other
 * handlers). state is in-memory, lost on restart — like `prompt`/`scenes`.
 */

export interface Conversation {
	/** resolve with the next update's context for this chat. */
	wait(): Promise<Context>;
	/** the most recent context (the entering update, then each waited one). */
	readonly ctx: Context;
}

export type ConversationBuilder = (cv: Conversation, ctx: Context) => void | Promise<void>;

export interface ConversationDef {
	name: string;
	builder: ConversationBuilder;
}

export function createConversation(name: string, builder: ConversationBuilder): ConversationDef {
	return { name, builder };
}

export interface ConversationControl {
	/** start a registered conversation for this chat. */
	enter(name: string): void;
	/** whether a conversation is currently running for this chat. */
	active(): boolean;
	/** abandon the active conversation (its coroutine is left parked). */
	leave(): void;
}

export interface ConversationOptions {
	/** conversation key for an update. default: per-chat (`ctx.chat.id`). */
	getKey?: (ctx: Context) => string | undefined;
	/** called if a conversation builder throws. */
	onError?: (error: unknown, ctx: Context) => void;
}

interface Live {
	queue: Context[];
	waiter?: (ctx: Context) => void;
	current: Context;
}

export function conversation(
	defs: ConversationDef[],
	options: ConversationOptions = {},
): Plugin<Context, { conversation: ConversationControl }> {
	const registry = new Map(defs.map((d) => [d.name, d]));
	const sessions = new Map<string, Live>();
	const getKey = options.getKey ?? ((ctx: Context) => ctx.chat?.id?.toString());

	const start = (key: string, def: ConversationDef, enterCtx: Context) => {
		const live: Live = { queue: [], current: enterCtx };
		sessions.set(key, live);

		const cv: Conversation = {
			wait: () =>
				new Promise<Context>((resolve) => {
					const queued = live.queue.shift();

					if (queued) {
						live.current = queued;
						resolve(queued);
					} else {
						live.waiter = resolve;
					}
				}),
			get ctx() {
				return live.current;
			},
		};

		Promise.resolve(def.builder(cv, enterCtx))
			.catch((error) => options.onError?.(error, live.current))
			.finally(() => {
				if (sessions.get(key) === live) sessions.delete(key);
			});
	};

	const plugin: Plugin<Context, { conversation: ConversationControl }> = (composer) =>
		composer
			.derive((ctx) => {
				const key = getKey(ctx);
				const control: ConversationControl = {
					enter: (name) => {
						if (key === undefined) return;

						const def = registry.get(name);
						if (!def) throw new Error(`conversation "${name}" is not registered`);

						start(key, def, ctx);
					},

					active: () => key !== undefined && sessions.has(key),
					leave: () => {
						if (key !== undefined) sessions.delete(key);
					},
				};

				return { conversation: control };
			})
			.use(async (ctx, next) => {
				const key = getKey(ctx);
				if (key !== undefined) {
					const live = sessions.get(key);

					if (live) {
						if (live.waiter) {
							const resolve = live.waiter;

							live.waiter = undefined;
							live.current = ctx;

							resolve(ctx);
						} else {
							live.queue.push(ctx);
						}

						return; // owned by the active conversation
					}
				}
				await next();
			});
	
	return plugin;
}
