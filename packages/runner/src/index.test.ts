import assert from "node:assert/strict";
import test from "node:test";
import { chatKey, createScheduler, run } from "./index.js";

const tick = () => new Promise<void>((r) => setTimeout(r, 0));

function deferred() {
	let resolve!: () => void;

	const promise = new Promise<void>((r) => {
		resolve = r;
	});

	return { promise, resolve };
}

test("scheduler: same key runs in order, never overlapping", async () => {
	const s = createScheduler(5);
	const log: string[] = [];
	const a1 = deferred();
	const a2 = deferred();

	s.submit("A", async () => {
		log.push("a1-start");
		await a1.promise;

		log.push("a1-end");
	});

	s.submit("A", async () => {
		log.push("a2-start");
		await a2.promise;

		log.push("a2-end");
	});

	await tick();
	assert.deepEqual(log, ["a1-start"]); // a2 waits for a1 (same key)

	a1.resolve();
	await tick();
	assert.deepEqual(log, ["a1-start", "a1-end", "a2-start"]);

	a2.resolve();
	await s.idle();
	assert.deepEqual(log, ["a1-start", "a1-end", "a2-start", "a2-end"]);
});

test("scheduler and runner reject concurrency values that would stall or violate the cap", () => {
	for (const concurrency of [0, -1, NaN, Infinity, 1.5]) {
		assert.throws(() => createScheduler(concurrency), RangeError);
		assert.throws(
			() =>
				run(
					{
						api: {
							async getUpdates() {
								return [];
							},
						},
						async handleUpdate() {},
					},
					{ concurrency },
				),
			RangeError,
		);
	}
});

test("chatKey: guest messages, generation stops and anonymous poll votes stay ordered", () => {
	assert.equal(chatKey({ update_id: 1, guest_message: { chat: { id: 7 } } } as never), 7);
	assert.equal(
		chatKey({ update_id: 2, stopped_message_generation: { chat: { id: 8 } } } as never),
		8,
	);
	assert.equal(chatKey({ update_id: 3, poll_answer: { voter_chat: { id: 9 } } } as never), 9);
});

test("scheduler: different keys run concurrently up to the limit", async () => {
	const s = createScheduler(2);
	const started: string[] = [];
	const gates = [deferred(), deferred(), deferred()];

	for (let i = 0; i < 3; i++) {
		s.submit(`k${i}`, async () => {
			started.push(`k${i}`);
			await gates[i]?.promise;
		});
	}

	await tick();
	assert.deepEqual(started, ["k0", "k1"]); // 3rd is blocked by the concurrency cap

	gates[0]?.resolve();
	await tick();
	assert.deepEqual(started, ["k0", "k1", "k2"]); // freed slot lets k2 start

	gates[1]?.resolve();
	gates[2]?.resolve();
	await s.idle();
});

test("scheduler: whenBelow gates backpressure", async () => {
	const s = createScheduler(10);
	const g = deferred();

	for (let i = 0; i < 3; i++) s.submit(undefined, async () => await g.promise);
	assert.equal(s.size(), 3);

	let below = false;
	void s.whenBelow(2).then(() => {
		below = true;
	});

	await tick();
	assert.equal(below, false);

	g.resolve();

	await s.idle();
	await tick();

	assert.equal(below, true);
});

test("chatKey: pulls chat id from common update shapes", () => {
	assert.equal(chatKey({ update_id: 1, message: { chat: { id: 7 } } } as never), 7);

	assert.equal(
		chatKey({ update_id: 2, callback_query: { message: { chat: { id: 9 } } } } as never),
		9,
	);

	assert.equal(chatKey({ update_id: 3, callback_query: { from: { id: 5 } } } as never), 5);
	assert.equal(chatKey({ update_id: 4 } as never), undefined);
});

test("run: processes a batch, keeps per-chat order, advances offset, drains on stop", async () => {
	const order: number[] = [];
	const offsets: number[] = [];
	let delivered = false;

	const bot = {
		api: {
			async getUpdates(params?: Record<string, unknown>) {
				offsets.push(Number(params?.offset ?? 0));

				if (!delivered) {
					delivered = true;

					return [
						{ update_id: 1, message: { chat: { id: 7 } } },
						{ update_id: 2, message: { chat: { id: 7 } } },
						{ update_id: 3, message: { chat: { id: 8 } } },
					] as never;
				}

				await tick();
				return [] as never;
			},
			// biome-ignore lint/suspicious/noExplicitAny: test mock
		} as any,
		async handleUpdate(u: { update_id: number }) {
			order.push(u.update_id);
		},
	};

	const handle = run(bot, { concurrency: 5, timeout: 0 });

	await tick();
	await tick();

	await handle.stop();

	assert.ok(order.includes(1) && order.includes(2) && order.includes(3));
	assert.ok(order.indexOf(1) < order.indexOf(2), "same chat stays ordered");
	assert.ok(offsets.includes(4), "offset advanced past the batch");
});

test("run: stop() aborts the in-flight long poll instead of waiting it out", async () => {
	let errors = 0;

	const bot = {
		api: {
			getUpdates(_params?: Record<string, unknown>, opts?: { signal?: AbortSignal }) {
				// a real long poll: never resolves on its own, only on abort
				return new Promise((_resolve, reject) => {
					opts?.signal?.addEventListener("abort", () => reject(new Error("aborted")), {
						once: true,
					});
				});
			},
			// biome-ignore lint/suspicious/noExplicitAny: test mock
		} as any,
		async handleUpdate() {},
	};

	const handle = run(bot, { timeout: 600, onError: () => errors++ });

	await tick();
	await handle.stop(); // hangs forever without the abort wiring

	assert.equal(errors, 0, "the stop-triggered abort is not reported as a polling error");
});

test("run: resolves the bot's own account before the first poll", { timeout: 5_000 }, async () => {
	const calls: string[] = [];
	const bot = {
		api: {
			async getUpdates() {
				calls.push("getUpdates");
				await tick();
				return [] as never;
			},
			// biome-ignore lint/suspicious/noExplicitAny: test mock
		} as any,
		async init() {
			calls.push("init");
		},
		async handleUpdate() {},
	};

	const handle = run(bot, { timeout: 0 });
	await tick();
	await handle.stop();

	assert.equal(calls[0], "init");
	assert.equal(calls[1], "getUpdates");
});

test("run: polling errors are logged by default, not swallowed", { timeout: 5_000 }, async (t) => {
	const logged = t.mock.method(console, "error", () => {});
	const bot = {
		api: {
			async getUpdates() {
				throw new Error("409: Conflict");
			},
			// biome-ignore lint/suspicious/noExplicitAny: test mock
		} as any,
		async handleUpdate() {},
	};

	const handle = run(bot);
	await tick();
	await handle.stop();

	assert.equal(logged.mock.callCount(), 1);
	assert.match(String(logged.mock.calls[0]?.arguments[1]), /409/);
});

test("run: a stop during backpressure confirms the handled batch", { timeout: 5_000 }, async () => {
	const polls: Record<string, unknown>[] = [];
	let release!: () => void;
	const blocked = new Promise<void>((resolve) => {
		release = resolve;
	});
	const bot = {
		api: {
			async getUpdates(params: Record<string, unknown>) {
				polls.push(params);
				if (polls.length === 1) return [{ update_id: 5, message: { chat: { id: 1 } } }] as never;
				return [] as never;
			},
			// biome-ignore lint/suspicious/noExplicitAny: test mock
		} as any,
		handleUpdate: () => blocked,
	};

	// concurrency 1: the loop parks in whenBelow() while update 5 is still running
	const handle = run(bot, { concurrency: 1, timeout: 0 });
	await tick();
	const stopping = handle.stop();
	release();
	await stopping;

	assert.equal(polls.length, 2);
	assert.deepEqual(polls[1], { offset: 6, limit: 1, timeout: 0 });
});
