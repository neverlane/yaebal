import type { Context, Middleware } from "@yaebal/core";

export interface DedupeOptions {
	/**
	 * how many recent `update_id`s to remember (default 4096). telegram redelivers
	 * an update whenever the webhook doesn't answer 200 in time, so under the
	 * `onError: "fail"` / `onTimeout: "fail"` policies the same update can arrive
	 * twice — this drops the repeat before it re-runs your side effects.
	 */
	capacity?: number;
	/** custom identity (default `ctx.update.update_id`). return `undefined` to skip the check. */
	key?: (ctx: Context) => string | number | undefined;
}

/**
 * skip updates already seen, keyed by `update_id`. a bounded FIFO of the last
 * `capacity` ids — an in-memory best-effort guard, not a distributed lock: it
 * dedupes within one process/isolate, which covers telegram's own retries. for
 * multi-instance idempotency, key off `update_id` in your own store.
 *
 *   bot.use(dedupe());
 */
export function dedupe(options: DedupeOptions = {}): Middleware<Context> {
	const capacity = Math.max(1, options.capacity ?? 4096);
	const keyOf = options.key ?? ((ctx: Context) => ctx.update.update_id);
	const seen = new Set<string | number>();
	const order: (string | number)[] = [];

	return (ctx, next) => {
		const id = keyOf(ctx);
		if (id === undefined) return next();

		if (seen.has(id)) return; // duplicate — swallow it
		seen.add(id);
		order.push(id);

		if (order.length > capacity) {
			const evicted = order.shift();
			if (evicted !== undefined) seen.delete(evicted);
		}

		return next();
	};
}
