import type { Context, Middleware } from "@yaebal/core";

/** derive the ordering/identity key for an update. `undefined` opts out. */
export type KeyFn<C> = (ctx: C) => string | number | bigint | undefined | null;

/** default key: the chat the update happened in — the natural per-conversation lane. */
const chatKey = <C extends Context>(ctx: C): number | undefined => ctx.chat?.id;

/**
 * process updates that share a key strictly in order, while unrelated keys stay
 * concurrent. essential under webhooks, where telegram fires updates in
 * parallel (up to `maxConnections`) — without this, two quick messages from the
 * same chat race, and read-modify-write plugins (sessions, scenes,
 * conversations) clobber each other's state.
 *
 * keyed by chat id by default; pass your own `key` (e.g. `ctx.from?.id`) to
 * serialize per user instead. an update whose key is `undefined`/`null` runs
 * immediately, unordered.
 *
 *   bot.use(sequentialize());
 *   bot.use(sequentialize((ctx) => ctx.from?.id));
 *
 * install it before any state plugin. lanes are dropped as they drain, so idle
 * chats cost nothing.
 */
export function sequentialize<C extends Context>(key: KeyFn<C> = chatKey): Middleware<C> {
	// one promise chain (a "lane") per active key; the entry is deleted once its
	// lane drains, so memory tracks live concurrency, not chats seen over time.
	const lanes = new Map<string, Promise<void>>();

	return async (ctx, next) => {
		const raw = key(ctx);
		if (raw === undefined || raw === null) return next();

		const id = String(raw);
		const previous = lanes.get(id) ?? Promise.resolve();

		// our turn ends when `release()` fires (after next() settles); the lane's
		// new tail is "after the previous update, wait for us".
		let release!: () => void;
		const mine = new Promise<void>((resolve) => {
			release = resolve;
		});
		const tail = previous.then(() => mine);
		lanes.set(id, tail);

		await previous;
		try {
			await next();
		} finally {
			release();
			// still the tail ⇒ nobody queued behind us; retire the lane.
			if (lanes.get(id) === tail) lanes.delete(id);
		}
	};
}
