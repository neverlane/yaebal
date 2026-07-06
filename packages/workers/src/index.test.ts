import assert from "node:assert/strict";
import test from "node:test";
import { createPool, type Pool } from "./index.js";

const workerFile = new URL("./test-worker.js", import.meta.url);

type TestTasks = {
	add: (pair: [number, number]) => number;
	echo: (value: { a: number }) => { a: number };
	boom: () => never;
	slow: (ms: number) => Promise<number>;
};

function expectPoolTypes(pool: Pool<TestTasks>) {
	const add = pool.run("add", [1, 2]);
	const echo = pool.run("echo", { a: 1 });
	const boom = pool.run("boom");
	const slow = pool.run("slow", 10);

	add satisfies Promise<number>;
	echo satisfies Promise<{ a: number }>;
	boom satisfies Promise<never>;
	slow satisfies Promise<number>;

	// @ts-expect-error wrong task name
	void pool.run("missing", undefined);
	// @ts-expect-error wrong arg type
	void pool.run("add", ["x", 1]);
	// @ts-expect-error missing required arg
	void pool.run("slow");
}

void expectPoolTypes;

test("runs registered tasks on a worker and returns the result", async () => {
	const pool = createPool<TestTasks>(workerFile, { size: 2 });

	try {
		assert.equal(await pool.run("add", [2, 3]), 5);
		assert.deepEqual(await pool.run("echo", { a: 1 }), { a: 1 });
	} finally {
		await pool.destroy();
	}
});

test("propagates task errors and unknown task names", async () => {
	const pool = createPool(workerFile, { size: 1 });

	try {
		await assert.rejects(() => pool.run("boom"), /kaboom/);
		await assert.rejects(() => pool.run("missing"), /unknown task/);
	} finally {
		await pool.destroy();
	}
});

test("spreads many concurrent tasks across the pool", async () => {
	const pool = createPool<TestTasks>(workerFile, { size: 4 });

	try {
		const out = await Promise.all(Array.from({ length: 20 }, (_, i) => pool.run("add", [i, 1])));

		assert.deepEqual(
			out,
			Array.from({ length: 20 }, (_, i) => i + 1),
		);
	} finally {
		await pool.destroy();
	}
});

test("rejects after destroy", async () => {
	const pool = createPool<TestTasks>(workerFile, { size: 1 });
	await pool.destroy();

	await assert.rejects(() => pool.run("add", [1, 1]), /destroyed/);
});
