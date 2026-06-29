import type { Api, BotPlugin } from "@yaebal/core";

export interface ThrottleOptions {
	/** minimum ms between outgoing calls. defaults to 34 (~30/sec, telegram's global cap). */
	minIntervalMs?: number;
}

/**
 * reserve the next call slot: no earlier than `now`, and never closer than
 * `interval` to the previous slot. pure — exported for testing.
 */
export function reserve(now: number, next: number, interval: number): { at: number; next: number } {
	const at = Math.max(now, next);

	return { at, next: at + interval };
}

function isApi(value: Api | ThrottleOptions | undefined): value is Api {
	return typeof (value as Api | undefined)?.before === "function";
}

/**
 * space out outgoing api calls by at least `minIntervalMs` (hooks `api.before`).
 * calls past the cap are delayed, not dropped, so nothing is lost — they just
 * queue up behind the rate limit.
 */
function installThrottle(api: Api, options: ThrottleOptions = {}): void {
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

/** create an installable bot plugin: `bot.install(throttle())`. */
export function throttle(options?: ThrottleOptions): BotPlugin;
/** install throttling on a bot's API directly: `throttle(bot.api)`. */
export function throttle(api: Api, options?: ThrottleOptions): void;
export function throttle(
	apiOrOptions?: Api | ThrottleOptions,
	options: ThrottleOptions = {},
): BotPlugin | void {
	if (isApi(apiOrOptions)) return installThrottle(apiOrOptions, options);

	const pluginOptions = apiOrOptions ?? {};

	return (bot) => {
		installThrottle(bot.api, pluginOptions);
		return bot;
	};
}
