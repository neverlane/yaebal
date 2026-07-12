import assert from "node:assert/strict";
import test from "node:test";
import { installTestClock } from "@yaebal/test";
import { batched } from "./batched.js";

/** poll a real (tiny) interval until `condition()` is true — used for the retry tests below
 * instead of a virtual clock: a retry chain (push → drain → sendWithRetry → catch → reschedule)
 * crosses several microtask hops between each `setTimeout`, and `installTestClock`'s `advance()`
 * only fires timers already registered at call time — a virtual-clock `advance()` can race past a
 * retry's next timer before its own catch handler has had a chance to register it. real short
 * delays sidestep that race entirely. */
async function waitUntil(condition: () => boolean, timeoutMs = 2000): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	while (!condition()) {
		if (Date.now() > deadline) throw new Error("waitUntil: condition never became true");
		await new Promise((resolve) => setTimeout(resolve, 5));
	}
}

test("flushes once `size` items are buffered", async () => {
	const sent: number[][] = [];
	const buffer = batched<number>(async (batch) => void sent.push(batch), {
		size: 3,
		intervalMs: 0,
	});

	buffer.push(1);
	buffer.push(2);
	assert.equal(sent.length, 0, "not flushed yet — below size");
	buffer.push(3);
	await Promise.resolve();
	await Promise.resolve();

	assert.deepEqual(sent, [[1, 2, 3]]);
});

test("flush() drains a partial batch below `size`", async () => {
	const sent: number[][] = [];
	const buffer = batched<number>(async (batch) => void sent.push(batch), {
		size: 10,
		intervalMs: 0,
	});

	buffer.push(1);
	buffer.push(2);
	await buffer.flush();

	assert.deepEqual(sent, [[1, 2]]);
});

test("a batch that fails is retried, NOT dropped — the clickhouseAdapter data-loss regression", {
	timeout: 5000,
}, async () => {
	let attempts = 0;
	const sent: number[][] = [];
	const buffer = batched<number>(
		async (batch) => {
			attempts++;
			if (attempts < 3) throw new Error("transient failure");
			sent.push(batch);
		},
		{ size: 2, intervalMs: 0, maxRetries: 5, retryDelayMs: 5 },
	);

	buffer.push(1);
	buffer.push(2); // triggers the first (failing) send attempt

	await waitUntil(() => sent.length > 0);

	assert.equal(attempts, 3, "retried until it succeeded");
	assert.deepEqual(sent, [[1, 2]], "the original batch was eventually delivered — nothing lost");
});

test("a batch that exhausts maxRetries is dropped via onDrop, not retried forever", {
	timeout: 5000,
}, async () => {
	const dropped: Array<{ items: number[]; reason: string }> = [];
	const buffer = batched<number>(
		async () => {
			throw new Error("permanent failure");
		},
		{
			size: 2,
			intervalMs: 0,
			maxRetries: 2,
			retryDelayMs: 5,
			onDrop: (items, reason) => dropped.push({ items, reason }),
		},
	);

	buffer.push(1);
	buffer.push(2);

	await waitUntil(() => dropped.length > 0);

	assert.deepEqual(dropped[0]?.items, [1, 2]);
	assert.equal(dropped[0]?.reason, "retries-exhausted");
});

test("maxBuffered backpressure drops new items instead of buffering unboundedly", async () => {
	const dropped: Array<{ items: number[]; reason: string }> = [];
	// never resolves — buffer never drains on its own, so pushes past maxBuffered must drop
	const buffer = batched<number>(() => new Promise(() => {}), {
		size: 1000,
		intervalMs: 0,
		maxBuffered: 3,
		onDrop: (items, reason) => dropped.push({ items, reason }),
	});

	buffer.push(1);
	buffer.push(2);
	buffer.push(3);
	buffer.push(4); // over the cap

	assert.equal(dropped.length, 1);
	assert.deepEqual(dropped[0]?.items, [4]);
	assert.equal(dropped[0]?.reason, "backpressure");
});

test("intervalMs flushes a low-traffic buffer even under `size`", async () => {
	const clock = installTestClock();
	try {
		const sent: number[][] = [];
		batched<number>(async (batch) => void sent.push(batch), { size: 100, intervalMs: 500 }).push(1);

		await clock.advance(499);
		assert.equal(sent.length, 0);
		await clock.advance(2);
		assert.deepEqual(sent, [[1]]);
	} finally {
		clock.restore();
	}
});

test("batches are sent in order even when a batch is mid-retry", { timeout: 5000 }, async () => {
	const order: number[][] = [];
	let firstBatchAttempts = 0;
	const buffer = batched<number>(
		async (batch) => {
			if (batch[0] === 1) {
				firstBatchAttempts++;
				if (firstBatchAttempts < 2) throw new Error("transient");
			}
			order.push(batch);
		},
		{ size: 1, intervalMs: 0, maxRetries: 3, retryDelayMs: 5 },
	);

	buffer.push(1); // fails once, then retries
	buffer.push(2); // must not overtake batch [1]

	await waitUntil(() => order.length >= 2);

	assert.deepEqual(order, [[1], [2]]);
});
