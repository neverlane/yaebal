import assert from "node:assert/strict";
import test from "node:test";
import { createPool } from "./index.js";

const workerFile = new URL("./test-worker.js", import.meta.url);

test("runs registered tasks on a worker and returns the result", async () => {
	const pool = createPool(workerFile, { size: 2 });
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
	const pool = createPool(workerFile, { size: 4 });
	try {
		const out = await Promise.all(
			Array.from({ length: 20 }, (_, i) => pool.run<number>("add", [i, 1])),
		);
		assert.deepEqual(
			out,
			Array.from({ length: 20 }, (_, i) => i + 1),
		);
	} finally {
		await pool.destroy();
	}
});

test("rejects after destroy", async () => {
	const pool = createPool(workerFile, { size: 1 });
	await pool.destroy();
	await assert.rejects(() => pool.run("add", [1, 1]), /destroyed/);
});
