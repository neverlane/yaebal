import type { Api } from "@yaebal/core";

export interface ThrottleOptions {
	/** Minimum ms between outgoing calls. Default 34 (~30/sec, Telegram's global cap). */
	minIntervalMs?: number;
}

/**
 * Reserve the next call slot: no earlier than `now`, and never closer than
 * `interval` to the previous slot. Pure — exported for testing.
 */
export function reserve(now: number, next: number, interval: number): { at: number; next: number } {
	const at = Math.max(now, next);
	return { at, next: at + interval };
}

/**
 * Space out outgoing API calls by at least `minIntervalMs` (hooks `api.before`).
 * Calls past the cap are delayed, not dropped, so nothing is lost — they just
 * queue up behind the rate limit.
 */
export function throttle(api: Api, options: ThrottleOptions = {}): void {
	const interval = options.minIntervalMs ?? 34;
	let next = 0;
	api.before(async (): Promise<undefined> => {
		const now = Date.now();
		const slot = reserve(now, next, interval);
		next = slot.next;
		const wait = slot.at - now;
		if (wait > 0) await new Promise((r) => setTimeout(r, wait));
		return undefined; // keep params unchanged
	});
}
