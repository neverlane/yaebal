import { type Api, type BotPlugin, type ErrorAction, TelegramError } from "@yaebal/core";

export type RetryReason = "retry_after" | "rate_limit_backoff" | "internal";

export interface RetryDecision extends ErrorAction {
	/** why the request is retryable. */
	reason: RetryReason;
	/** Telegram-provided wait, in milliseconds, when present. */
	retryAfterMs?: number;
}

export interface AutoRetryEvent {
	method: string;
	error: TelegramError;
	attempt: number;
	nextAttempt: number;
	delayMs: number;
	reason: RetryReason;
	retryAfterMs?: number;
	params: Record<string, unknown> | undefined;
}

export interface AutoRetryOptions {
	/** max retries after the first attempt. defaults to 3. */
	maxRetries?: number;
	/** cap on a single wait, in ms. defaults to 30_000. */
	maxDelayMs?: number;
	/** base for exponential backoff, in ms. attempt 1 waits 2 * base. defaults to 1_000. */
	baseDelayMs?: number;
	/** add this many ms to Telegram-provided retry_after waits. defaults to 0. */
	retryAfterPaddingMs?: number;
	/** randomize delays by up to this fraction (0.2 = ±20%), or provide a custom function. defaults to 0. */
	jitter?: number | ((delayMs: number, attempt: number, error: TelegramError) => number);
	/** also retry transient 5xx server errors. defaults to true. */
	retryOnInternal?: boolean;
	/** observe every scheduled retry. useful for metrics/logging. */
	onRetry?: (event: AutoRetryEvent) => unknown | Promise<unknown>;
}

/**
 * decide whether a failed call should be retried, and after how long.
 * pure (no I/O) — exported so the policy is unit-testable on its own.
 */
export function decideRetry(
	error: unknown,
	attempt: number,
	options: AutoRetryOptions = {},
): RetryDecision | undefined {
	const maxRetries = options.maxRetries ?? 3;
	const maxDelayMs = options.maxDelayMs ?? 30_000;
	const baseDelayMs = options.baseDelayMs ?? 1_000;
	const retryAfterPaddingMs = options.retryAfterPaddingMs ?? 0;
	const retryOnInternal = options.retryOnInternal ?? true;

	if (attempt > maxRetries) return undefined;
	if (!(error instanceof TelegramError)) return undefined;

	// 429: respect Telegram's structured response_parameters.retry_after.
	if (error.code === 429) {
		const retryAfterMs = getRetryAfterMs(error);
		const delayMs = retryAfterMs ?? 2 ** attempt * baseDelayMs;
		const capped = Math.min(delayMs + (retryAfterMs === undefined ? 0 : retryAfterPaddingMs), maxDelayMs);

		return {
			retry: true,
			delayMs: applyJitter(capped, attempt, error, options.jitter),
			reason: retryAfterMs === undefined ? "rate_limit_backoff" : "retry_after",
			retryAfterMs,
		};
	}

	// 5xx: transient server-side failure.
	if (retryOnInternal && error.code >= 500) {
		const delayMs = Math.min(2 ** attempt * baseDelayMs, maxDelayMs);

		return {
			retry: true,
			delayMs: applyJitter(delayMs, attempt, error, options.jitter),
			reason: "internal",
		};
	}

	return undefined;
}

function isApi(value: Api | AutoRetryOptions | undefined): value is Api {
	return typeof (value as Api | undefined)?.onError === "function";
}

function installAutoRetry(api: Api, options: AutoRetryOptions = {}): void {
	api.onError(async (method, error, attempt, params) => {
		const decision = decideRetry(error, attempt, options);

		if (decision && error instanceof TelegramError) {
			await options.onRetry?.({
				method,
				error,
				attempt,
				nextAttempt: attempt + 1,
				delayMs: decision.delayMs ?? 0,
				reason: decision.reason,
				retryAfterMs: decision.retryAfterMs,
				params,
			});
		}

		return decision;
	});
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

function getRetryAfterMs(error: TelegramError): number | undefined {
	const retryAfter = error.parameters?.retry_after;
	if (typeof retryAfter !== "number" || !Number.isFinite(retryAfter) || retryAfter < 0) {
		return undefined;
	}

	return retryAfter * 1000;
}

function applyJitter(
	delayMs: number,
	attempt: number,
	error: TelegramError,
	jitter: AutoRetryOptions["jitter"],
): number {
	if (typeof jitter === "function") return Math.max(0, jitter(delayMs, attempt, error));
	if (typeof jitter !== "number" || jitter <= 0) return delayMs;

	const spread = delayMs * jitter;
	const min = delayMs - spread;
	const max = delayMs + spread;

	return Math.max(0, Math.round(min + Math.random() * (max - min)));
}
