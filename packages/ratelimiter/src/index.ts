import type { Context, Plugin } from "@yaebal/core";

interface Window {
	count: number;
	resetAt: number;
}

export interface RateLimiterOptions {
	/** max updates allowed per window. defaults to 5. */
	limit?: number;
	/** window length in ms. defaults to 1000. */
	windowMs?: number;
	/** called when an update is dropped for exceeding the limit. */
	onLimit?: (ctx: Context) => unknown;
	/** limit key for an update. defaults to per-user (`ctx.from.id`). */
	getKey?: (ctx: Context) => string | undefined;
}

/**
 * decide whether an update is within the limit, returning the updated window.
 * mutates `rec` in place when reusing the window, or allocates a fresh one on
 * reset. exported for testing.
 */
export function decide(
	rec: Window | undefined,
	now: number,
	limit: number,
	windowMs: number,
): { allowed: boolean; window: Window } {
	const window = !rec || now >= rec.resetAt ? { count: 0, resetAt: now + windowMs } : rec;
	window.count += 1;

	return { allowed: window.count <= limit, window };
}

/** drop updates from a key (defaults to per-user) that exceed `limit` per `windowMs`. */
export function ratelimiter(
	options: RateLimiterOptions = {},
): Plugin<Context, Record<never, never>> {
	const limit = options.limit ?? 5;
	const windowMs = options.windowMs ?? 1000;
	const getKey = options.getKey ?? ((ctx: Context) => ctx.from?.id?.toString());

	// ponytail: one entry per distinct key, never evicted — bounded by the number
	// of users the bot ever sees. fine for anti-spam scale; add a sweep if it grows.
	const windows = new Map<string, Window>();

	const plugin: Plugin<Context, Record<never, never>> = (composer) =>
		composer.use(async (ctx, next) => {
			const key = getKey(ctx);
			if (key === undefined) return next();

			const { allowed, window } = decide(windows.get(key), Date.now(), limit, windowMs);
			windows.set(key, window);

			if (!allowed) {
				await options.onLimit?.(ctx);
				return; // dropped
			}

			await next();
		});

	return plugin;
}
