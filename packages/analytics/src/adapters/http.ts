import { batched, type DropReason } from "../batched.js";
import type { AnalyticsAdapter, AnalyticsEvent } from "../types.js";

export interface HttpAdapterOptions {
	/** extra headers merged onto every request (e.g. an API key). */
	headers?: Record<string, string>;
	/** shape the outgoing JSON body from a batch of events. defaults to `{ events }`. */
	body?: (batch: AnalyticsEvent[]) => unknown;
	/** injectable for tests; defaults to the global `fetch`. */
	fetch?: typeof fetch;
	/** abort a request that hangs this long. defaults to `10_000`ms. */
	timeoutMs?: number;
	/** flush once this many events are buffered. defaults to `20`. */
	batchSize?: number;
	/** also flush this long after the first buffered event. defaults to `5000`ms. */
	intervalMs?: number;
	/** retry a failed request this many times before giving up on that batch. defaults to `3`. */
	maxRetries?: number;
	/** base backoff delay in ms between retries (doubles each attempt). defaults to `500`. */
	retryDelayMs?: number;
	/** hard cap on buffered-but-unsent events. defaults to `10_000`. */
	maxBuffered?: number;
	/** called for events dropped by backpressure or exhausted retries. */
	onDrop?: (events: AnalyticsEvent[], reason: DropReason) => unknown;
}

/**
 * POST batches of events as JSON to any HTTP collector — umami, a mixpanel-compatible batch
 * import endpoint, a self-hosted collector, anything that accepts `{ events }` (or your own
 * shape via `body`). buffers and retries a failed send the same way `clickhouseAdapter` does, via
 * the same {@link batched} wrapper.
 */
export function httpAdapter(url: string, options: HttpAdapterOptions = {}): AnalyticsAdapter {
	const doFetch = options.fetch ?? fetch;
	const timeoutMs = options.timeoutMs ?? 10_000;
	const buildBody = options.body ?? ((events: AnalyticsEvent[]) => ({ events }));

	const buffer = batched<AnalyticsEvent>(
		async (events) => {
			const res = await doFetch(url, {
				method: "POST",
				headers: { "content-type": "application/json", ...options.headers },
				body: JSON.stringify(buildBody(events)),
				signal: AbortSignal.timeout(timeoutMs),
			});

			if (!res.ok) {
				const detail = await res.text().catch(() => "");
				throw new Error(
					`httpAdapter: ${res.status} ${res.statusText}${detail ? ` — ${detail}` : ""}`,
				);
			}
			await res.body?.cancel();
		},
		{
			size: options.batchSize ?? 20,
			intervalMs: options.intervalMs ?? 5000,
			maxRetries: options.maxRetries ?? 3,
			retryDelayMs: options.retryDelayMs,
			maxBuffered: options.maxBuffered ?? 10_000,
			onDrop: options.onDrop,
		},
	);

	return {
		track(event) {
			buffer.push(event);
		},
		flush: () => buffer.flush(),
	};
}
