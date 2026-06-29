import { type Api, type BotPlugin, type ErrorAction, TelegramError } from "@yaebal/core";

export interface AutoRetryOptions {
	/** max retries after the first attempt. defaults to 3. */
	maxRetries?: number;
	/** cap on a single wait, in ms. defaults to 30_000. */
	maxDelayMs?: number;
	/** also retry transient 5xx server errors. defaults to true. */
	retryOnInternal?: boolean;
}

/**
 * decide whether a failed call should be retried, and after how long.
 * pure (no I/O) — exported so the policy is unit-testable on its own.
 */
export function decideRetry(
	error: unknown,
	attempt: number,
	options: AutoRetryOptions = {},
): ErrorAction | undefined {
	const maxRetries = options.maxRetries ?? 3;
	const maxDelayMs = options.maxDelayMs ?? 30_000;
	const retryOnInternal = options.retryOnInternal ?? true;

	if (attempt > maxRetries) return undefined;
	if (!(error instanceof TelegramError)) return undefined;

	// 429: respect telegram's "retry after N", else exponential backoff.
	if (error.code === 429) {
		const retryAfter = parseRetryAfter(error.message);
		const seconds = retryAfter ?? 2 ** attempt;

		return { retry: true, delayMs: Math.min(seconds * 1000, maxDelayMs) };
	}

	// 5xx: transient server-side failure.
	if (retryOnInternal && error.code >= 500) {
		return { retry: true, delayMs: Math.min(2 ** attempt * 1000, maxDelayMs) };
	}
	
	return undefined;
}

function isApi(value: Api | AutoRetryOptions | undefined): value is Api {
	return typeof (value as Api | undefined)?.onError === "function";
}

function installAutoRetry(api: Api, options: AutoRetryOptions = {}): void {
	api.onError((_method, error, attempt) => decideRetry(error, attempt, options));
}

/** create an installable bot plugin: `bot.install(autoRetry())`. */
export function autoRetry(options?: AutoRetryOptions): BotPlugin;
/** install auto-retry on a bot's API directly: `autoRetry(bot.api)`. */
export function autoRetry(api: Api, options?: AutoRetryOptions): void;
export function autoRetry(
	apiOrOptions?: Api | AutoRetryOptions,
	options: AutoRetryOptions = {},
): BotPlugin | void {
	if (isApi(apiOrOptions)) return installAutoRetry(apiOrOptions, options);

	const pluginOptions = apiOrOptions ?? {};

	return (bot) => {
		installAutoRetry(bot.api, pluginOptions);
		return bot;
	};
}

function parseRetryAfter(message: string): number | undefined {
	const m = message.match(/retry after (\d+)/i);
	
	return m ? Number(m[1]) : undefined;
}
