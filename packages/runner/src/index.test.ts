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
