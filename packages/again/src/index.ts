import { type Api, type ErrorAction, TelegramError } from "@yaebal/core";

export interface AutoRetryOptions {
	/** Max retries after the first attempt. Default 3. */
	maxRetries?: number;
	/** Cap on a single wait, in ms. Default 30_000. */
	maxDelayMs?: number;
	/** Also retry transient 5xx server errors. Default true. */
	retryOnInternal?: boolean;
}

/**
 * Decide whether a failed call should be retried, and after how long.
 * Pure (no I/O) — exported so the policy is unit-testable on its own.
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

	// 429: respect Telegram's "retry after N", else exponential backoff.
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

/** Install auto-retry on a bot's API: `autoRetry(bot.api)`. */
export function autoRetry(api: Api, options: AutoRetryOptions = {}): void {
	api.onError((_method, error, attempt) => decideRetry(error, attempt, options));
}

function parseRetryAfter(message: string): number | undefined {
	const m = message.match(/retry after (\d+)/i);
	return m ? Number(m[1]) : undefined;
}
