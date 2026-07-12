export type DropReason = "backpressure" | "retries-exhausted";

export interface BatchedOptions<T> {
	/** flush once this many items are buffered. defaults to `20`. */
	size?: number;
	/** also flush this long after the first buffered item, even if `size` isn't reached — without
	 * this a low-traffic sink can hold events in memory for hours (and lose them to a crash). set
	 * `0` to disable the timer and flush purely by size (or manual `flush()`). defaults to `5000`. */
	intervalMs?: number;
	/** retry a failed send this many times, with exponential backoff, before giving up on that
	 * batch. defaults to `3`. */
	maxRetries?: number;
	/** base backoff delay in ms between retries (doubles each attempt: 1x, 2x, 4x, …). defaults to `500`. */
	retryDelayMs?: number;
	/** hard cap on items buffered at once (across size + any batch still retrying) — beyond this,
	 * new items are dropped instead of buffered without limit. defaults to `10_000`. */
	maxBuffered?: number;
	/** called for items dropped by `maxBuffered` backpressure, or a batch whose send kept failing
	 * past `maxRetries`. without this, both failure modes are silent — wire it to `onError`-style
	 * observability, same as `AnalyticsOptions.onError`. */
	onDrop?: (items: T[], reason: DropReason) => unknown;
}

export interface Batched<T> {
	/** buffer one item — flushes automatically once `size` items are buffered or `intervalMs`
	 * elapses, whichever comes first. */
	push(item: T): void;
	/** drain the buffer now (including anything mid-retry from an earlier automatic flush) —
	 * call before shutdown so a partial batch isn't left behind. */
	flush(): Promise<void>;
}

/**
 * a generic batch-with-retry-and-backpressure wrapper around any `send(batch)` function — the
 * piece every buffering `AnalyticsAdapter` (`clickhouseAdapter`, `httpAdapter`) shares, written
 * once instead of re-implemented (and re-bugged) per adapter. unlike a naive "clear the buffer,
 * then send" batcher, a failed `send` here re-queues its batch for retry instead of losing it —
 * see `clickhouseAdapter`'s docs for the data-loss bug this replaces.
 */
export function batched<T>(
	send: (batch: T[]) => Promise<unknown>,
	options: BatchedOptions<T> = {},
): Batched<T> {
	const size = Math.max(1, options.size ?? 20);
	const intervalMs = options.intervalMs ?? 5000;
	const maxRetries = options.maxRetries ?? 3;
	const retryDelayMs = options.retryDelayMs ?? 500;
	const maxBuffered = options.maxBuffered ?? 10_000;
	const onDrop = options.onDrop;

	let buffer: T[] = [];
	let timer: ReturnType<typeof setTimeout> | undefined;
	// the in-flight send-with-retry chain, if any — serializes drains so a slow retry can't be
	// raced past by a later, faster-succeeding batch (which would send events out of order).
	let sending: Promise<void> = Promise.resolve();

	function disarmTimer(): void {
		if (timer) clearTimeout(timer);
		timer = undefined;
	}

	async function sendWithRetry(batch: T[]): Promise<void> {
		for (let attempt = 0; ; attempt++) {
			try {
				await send(batch);
				return;
			} catch {
				if (attempt >= maxRetries) {
					onDrop?.(batch, "retries-exhausted");
					return;
				}
				await new Promise((resolve) => setTimeout(resolve, retryDelayMs * 2 ** attempt));
			}
		}
	}

	function drain(): Promise<void> {
		disarmTimer();
		if (buffer.length === 0) return sending;

		const batch = buffer;
		buffer = [];
		sending = sending.then(() => sendWithRetry(batch));
		return sending;
	}

	function push(item: T): void {
		if (buffer.length >= maxBuffered) {
			onDrop?.([item], "backpressure");
			return;
		}

		const wasEmpty = buffer.length === 0;
		buffer.push(item);

		if (wasEmpty && intervalMs > 0) {
			timer = setTimeout(() => void drain(), intervalMs);
			timer.unref?.();
		}

		if (buffer.length >= size) void drain();
	}

	return { push, flush: () => drain() };
}
