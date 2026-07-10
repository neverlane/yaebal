import assert from "node:assert/strict";
import test from "node:test";
import { createPool, PoolClosedError } from "./index.js";
import { tasks } from "./plugin.js";
import type { TestTasks } from "./test-worker.js";

const workerFile = new URL("./test-worker.js", import.meta.url);

/** minimal structural stand-in for a Bot: decorate + onStop is all the plugin touches. */
function fakeBot() {
	const stopHandlers: Array<() => Promise<void>> = [];
	const decorated: object[] = [];
	const bot = {
		decorate(value: object) {
			decorated.push(value);
			return bot;
		},
		onStop(handler: () => Promise<void>) {
			stopHandlers.push(handler);
			return bot;
		},
	};
	return { bot, stopHandlers, decorated };
}

test("tasks() decorates the context with the pool and closes it on bot stop", async () => {
	const pool = createPool<TestTasks>(workerFile, { size: 1 });
	const { bot, stopHandlers, decorated } = fakeBot();

	(tasks(pool) as unknown as (c: typeof bot) => typeof bot)(bot);

	assert.deepEqual(decorated, [{ tasks: pool }]);
	assert.equal(await pool.run("add", [1, 2]), 3);

	assert.equal(stopHandlers.length, 1);
	await stopHandlers[0]?.();
	await assert.rejects(() => pool.run("add", [1, 1]), PoolClosedError);
});

test("tasks() honors key and onStop: false", async () => {
	const pool = createPool<TestTasks>(workerFile, { size: 1 });
	const { bot, stopHandlers, decorated } = fakeBot();

	try {
		(tasks(pool, { key: "workers", onStop: false }) as unknown as (c: typeof bot) => typeof bot)(
			bot,
		);

		assert.deepEqual(decorated, [{ workers: pool }]);
		assert.equal(stopHandlers.length, 0, "onStop: false must not hook the lifecycle");
	} finally {
		await pool.destroy();
	}
});

test("tasks() on a composer without onStop leaves the lifecycle alone", async () => {
	const pool = createPool<TestTasks>(workerFile, { size: 1 });
	const decorated: object[] = [];
	const composer = {
		decorate(value: object) {
			decorated.push(value);
			return composer;
		},
	};

	try {
		(tasks(pool) as unknown as (c: typeof composer) => typeof composer)(composer);
		assert.deepEqual(decorated, [{ tasks: pool }]);
	} finally {
		await pool.destroy();
	}
});
