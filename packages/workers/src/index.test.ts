import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
	createPool,
	type Pool,
	PoolClosedError,
	type PoolEvents,
	QueueFullError,
	TaskTimeoutError,
	UnknownTaskError,
	WorkerCrashError,
} from "./index.js";
import type { TestTasks } from "./test-worker.js";

const workerFile = new URL("./test-worker.js", import.meta.url);
const crashFile = new URL("./crash-worker.js", import.meta.url);
const silentFile = new URL("./silent-worker.js", import.meta.url);

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function waitEvent<E extends keyof PoolEvents>(
	pool: Pool<TestTasks>,
	event: E,
): Promise<PoolEvents[E]> {
	return new Promise((resolve) => {
		const off = pool.on(event, (info) => {
			off();
			resolve(info);
		});
	});
}

// ---------------------------------------------------------------------------
// type-level checks (compile-time only)
// ---------------------------------------------------------------------------

function expectPoolTypes(pool: Pool<TestTasks>) {
	const add = pool.run("add", [1, 2]);
	const echo = pool.run("echo", { a: 1 }, { timeout: 100 });
	const boom = pool.run("boom");
	const slow = pool.run("slow", 10, { signal: new AbortController().signal });

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
	// @ts-expect-error positional transfer list was replaced by { transfer }
	void pool.run("echo", { a: 1 }, []);

	type TwoArgTasks = { two: (a: string, b: string) => string };
	// @ts-expect-error tasks take at most one argument — pass a tuple or an object
	void createPool<TwoArgTasks>(workerFile);
}

void expectPoolTypes;

// ---------------------------------------------------------------------------
// happy path
// ---------------------------------------------------------------------------

test("runs registered tasks and returns results", async () => {
	const pool = createPool<TestTasks>(workerFile, { size: 2 });

	try {
		assert.equal(await pool.run("add", [2, 3]), 5);
		assert.deepEqual(await pool.run("echo", { a: 1 }), { a: 1 });
	} finally {
		await pool.destroy();
	}
});

test("ready() resolves once every worker registered; worker:ready fires per worker", async () => {
	const pool = createPool<TestTasks>(workerFile, { size: 2 });
	const seen: number[] = [];
	pool.on("worker:ready", ({ worker }) => seen.push(worker));

	try {
		await pool.ready();
		assert.deepEqual([...seen].sort(), [0, 1]);
		assert.equal(pool.stats().ready, 2);
	} finally {
		await pool.destroy();
	}
});

test("spreads concurrent tasks across distinct workers", async () => {
	const pool = createPool<TestTasks>(workerFile, { size: 2 });

	try {
		await pool.ready();
		const [a, b] = await Promise.all([pool.run("slowId", 150), pool.run("slowId", 150)]);
		assert.notEqual(a, b);
	} finally {
		await pool.destroy();
	}
});

test("queues past busy workers and rejects with QueueFullError above maxQueue", async () => {
	const pool = createPool<TestTasks>(workerFile, { size: 1, maxQueue: 1 });

	try {
		await pool.ready();
		const first = pool.run("slow", 150);
		await sleep(20); // let the first task reach the worker
		const second = pool.run("slow", 10);
		await assert.rejects(() => pool.run("slow", 10), QueueFullError);

		assert.equal(await first, 150);
		assert.equal(await second, 10);
		assert.equal(pool.stats().completed, 2);
		// QueueFullError is a refused admission, not a failed task
		assert.equal(pool.stats().failed, 0);
	} finally {
		await pool.destroy();
	}
});

// ---------------------------------------------------------------------------
// errors
// ---------------------------------------------------------------------------

test("task errors cross the thread with name, message and stack", async () => {
	const pool = createPool<TestTasks>(workerFile, { size: 1 });

	try {
		await assert.rejects(
			() => pool.run("boom"),
			(error: Error) => {
				assert.equal(error.message, "kaboom");
				assert.ok(error.stack?.includes("test-worker"));
				return true;
			},
		);
		await assert.rejects(
			() => pool.run("typedBoom"),
			(error: Error) => {
				assert.equal(error.name, "RangeError");
				assert.equal(error.message, "out of range");
				return true;
			},
		);
	} finally {
		await pool.destroy();
	}
});

test("unknown task names reject with UnknownTaskError before and after ready", async () => {
	const pool = createPool(workerFile, { size: 1 });

	try {
		// before ready the name set is unknown — the worker answers with the marker
		await assert.rejects(() => pool.run("missing"), UnknownTaskError);
		// after ready the pool fails fast without a round-trip
		await assert.rejects(() => pool.run("missing"), UnknownTaskError);
		await assert.rejects(() => pool.run("missing"), /registered: add,/);
	} finally {
		await pool.destroy();
	}
});

test("unclonable argument rejects that task only, the worker survives", async () => {
	const pool = createPool<TestTasks>(workerFile, { size: 1 });

	try {
		await pool.ready();
		const poisoned = { a: 1, fn: () => {} } as unknown as { a: number };
		await assert.rejects(() => pool.run("echo", poisoned), /clone/i);
		assert.equal(await pool.run("add", [1, 1]), 2);
	} finally {
		await pool.destroy();
	}
});

test("unclonable result rejects", async () => {
	const pool = createPool<TestTasks>(workerFile, { size: 1 });

	try {
		await assert.rejects(() => pool.run("unclonableResult"), /clone/i);
		assert.equal(await pool.run("add", [1, 1]), 2);
	} finally {
		await pool.destroy();
	}
});

test("register() throws on the main thread and on a second call in the worker", async () => {
	const { register } = await import("./index.js");
	assert.throws(() => register({ x: () => 0 }), /inside a worker thread/);

	const pool = createPool<TestTasks>(workerFile, { size: 1 });
	try {
		assert.equal(await pool.run("registerAgainThrows"), true);
	} finally {
		await pool.destroy();
	}
});

// ---------------------------------------------------------------------------
// timeout + abort
// ---------------------------------------------------------------------------

test("a hung task times out, its worker is killed and respawned", async () => {
	const pool = createPool<TestTasks>(workerFile, { size: 1, killTimeout: 100 });

	try {
		await pool.ready();
		const before = await pool.run("threadId");

		const respawned = waitEvent(pool, "worker:ready");
		await assert.rejects(() => pool.run("hang", undefined, { timeout: 50 }), TaskTimeoutError);
		await respawned;

		const after = await pool.run("threadId");
		assert.notEqual(before, after);
		assert.ok(pool.stats().restarts >= 1);
	} finally {
		await pool.destroy();
	}
});

test("aborting a queued task dequeues it without touching the worker", async () => {
	const pool = createPool<TestTasks>(workerFile, { size: 1 });

	try {
		await pool.ready();
		const first = pool.run("slow", 150);
		await sleep(20);

		const controller = new AbortController();
		const reason = new Error("nope");
		const queued = pool.run("slow", 10, { signal: controller.signal });
		controller.abort(reason);

		await assert.rejects(
			() => queued,
			(error: unknown) => error === reason,
		);
		assert.equal(await first, 150);
		assert.equal(pool.stats().queued, 0);
		assert.equal(pool.stats().restarts, 0);
	} finally {
		await pool.destroy();
	}
});

test("cooperative abort settles in the worker and keeps it alive", async () => {
	const pool = createPool<TestTasks>(workerFile, { size: 1, killTimeout: 5_000 });

	try {
		await pool.ready();
		const before = await pool.run("threadId");

		const controller = new AbortController();
		const running = pool.run("obedient", 10_000, { signal: controller.signal });
		await sleep(50); // make sure it reached the worker
		controller.abort();
		await assert.rejects(
			() => running,
			(error: Error) => error.name === "AbortError",
		);

		await sleep(100); // give the worker time to answer the abort
		const after = await pool.run("threadId");
		assert.equal(before, after);
		assert.equal(pool.stats().restarts, 0);
	} finally {
		await pool.destroy();
	}
});

test("pre-aborted signal rejects immediately", async () => {
	const pool = createPool<TestTasks>(workerFile, { size: 1 });

	try {
		const controller = new AbortController();
		controller.abort();
		await assert.rejects(
			() => pool.run("add", [1, 1], { signal: controller.signal }),
			(error: Error) => error.name === "AbortError",
		);
	} finally {
		await pool.destroy();
	}
});

// ---------------------------------------------------------------------------
// crash recovery
// ---------------------------------------------------------------------------

test("a worker crash mid-task rejects with WorkerCrashError and respawns the worker", async () => {
	const pool = createPool<TestTasks>(workerFile, { size: 1 });
	const crashes: PoolEvents["worker:crash"][] = [];
	pool.on("worker:crash", (info) => crashes.push(info));

	try {
		await pool.ready();
		const respawned = waitEvent(pool, "worker:ready");

		await assert.rejects(
			() => pool.run("die", 7),
			(error: WorkerCrashError) => {
				assert.ok(error instanceof WorkerCrashError);
				assert.equal(error.code, 7);
				return true;
			},
		);

		await respawned;
		assert.equal(await pool.run("add", [2, 2]), 4);
		assert.equal(crashes.length, 1);
		assert.equal(crashes[0]?.willRespawn, true);
		assert.ok(pool.stats().restarts >= 1);
	} finally {
		await pool.destroy();
	}
});

test("fork-bomb regression: a broken worker file respawns linearly, then the pool goes dead", async () => {
	const log = join(mkdtempSync(join(tmpdir(), "yaebal-workers-")), "spawns.log");
	writeFileSync(log, "");

	const pool = createPool(crashFile, {
		size: 1,
		maxRestarts: 2,
		backoff: () => 5,
		worker: { workerData: { log } },
	});
	const crashes: PoolEvents["worker:crash"][] = [];
	pool.on("worker:crash", (info) => crashes.push(info));

	const spawns = () => readFileSync(log, "utf8").split("\n").filter(Boolean).length;

	try {
		await assert.rejects(() => pool.ready(), WorkerCrashError);
		await sleep(150);

		// exactly initial + maxRestarts spawns — one replacement per death, never two
		assert.equal(spawns(), 3);
		assert.equal(crashes.length, 3);
		assert.equal(crashes.at(-1)?.willRespawn, false);

		await assert.rejects(() => pool.run("anything"), WorkerCrashError);
		assert.equal(pool.stats().dead, 1);

		await sleep(100);
		assert.equal(spawns(), 3, "no respawns after the slot was declared dead");
	} finally {
		await pool.destroy();
	}
});

test("a worker that never registers exhausts restarts instead of hanging", async () => {
	const pool = createPool(silentFile, { size: 1, maxRestarts: 1, backoff: () => 1 });

	try {
		await assert.rejects(() => pool.ready(), WorkerCrashError);
		await assert.rejects(() => pool.run("anything"), WorkerCrashError);
	} finally {
		await pool.destroy();
	}
});

// ---------------------------------------------------------------------------
// shutdown
// ---------------------------------------------------------------------------

test("destroy rejects queued and running tasks and is idempotent", async () => {
	const pool = createPool<TestTasks>(workerFile, { size: 1 });

	await pool.ready();
	const running = pool.run("slow", 500);
	await sleep(20);
	const queued = pool.run("slow", 10);

	// attach expectations before destroy so the rejections are never unhandled
	const runningRejects = assert.rejects(() => running, PoolClosedError);
	const queuedRejects = assert.rejects(() => queued, PoolClosedError);
	await pool.destroy();
	await runningRejects;
	await queuedRejects;
	await assert.rejects(() => pool.run("add", [1, 1]), PoolClosedError);
	await pool.destroy(); // second call resolves quietly
});

test("close() drains queued and running tasks before terminating", async () => {
	const pool = createPool<TestTasks>(workerFile, { size: 1 });

	await pool.ready();
	const running = pool.run("slow", 100);
	await sleep(20);
	const queued = pool.run("slow", 10);

	const closed = pool.close();
	await assert.rejects(() => pool.run("add", [1, 1]), PoolClosedError);

	await closed;
	assert.equal(await running, 100);
	assert.equal(await queued, 10);
	assert.equal(pool.stats().completed, 2);
});

test("close({ timeout }) force-destroys when draining stalls", async () => {
	const pool = createPool<TestTasks>(workerFile, { size: 1 });

	await pool.ready();
	const stuck = pool.run("hang");
	await sleep(20);

	const stuckRejects = assert.rejects(() => stuck, PoolClosedError);
	await pool.close({ timeout: 50 });
	await stuckRejects;
});

test("await using destroys the pool at scope exit", async () => {
	let leaked: Pool<TestTasks> | undefined;
	{
		await using pool = createPool<TestTasks>(workerFile, { size: 1 });
		assert.equal(await pool.run("add", [1, 2]), 3);
		leaked = pool;
	}
	await assert.rejects(() => leaked.run("add", [1, 1]), PoolClosedError);
});

// ---------------------------------------------------------------------------
// transfers + options validation
// ---------------------------------------------------------------------------

test("move() transfers results back without breaking values", async () => {
	const pool = createPool<TestTasks>(workerFile, { size: 1 });

	try {
		const bytes = await pool.run("moveBack", 64);
		assert.equal(bytes.length, 64);
		assert.equal(bytes[0], 7);
	} finally {
		await pool.destroy();
	}
});

test("transferables move the argument to the worker", async () => {
	const pool = createPool<TestTasks>(workerFile, { size: 1 });

	try {
		const payload = { a: 5 };
		const buffer = new Uint8Array(8).buffer;
		const poisoned = Object.assign(payload, { buf: buffer }) as unknown as { a: number };
		assert.deepEqual(await pool.run("echo", poisoned, { transfer: [buffer] }), {
			a: 5,
			buf: new ArrayBuffer(8),
		});
	} finally {
		await pool.destroy();
	}
});

test("createPool validates size and run() validates options", async () => {
	assert.throws(() => createPool(workerFile, { size: Number.NaN }), TypeError);
	assert.throws(() => createPool(workerFile, { size: 0 }), TypeError);
	assert.throws(() => createPool(workerFile, { size: 2.5 }), TypeError);

	const auto = createPool<TestTasks>(workerFile, { size: "auto" });
	try {
		assert.ok(auto.size >= 1);
	} finally {
		await auto.destroy();
	}

	const pool = createPool<TestTasks>(workerFile, { size: 1 });
	try {
		await assert.rejects(() => pool.run("echo", { a: 1 }, [] as never), /pass options.*transfer/);
		await assert.rejects(() => pool.run("add", [1, 1], { timeout: -5 }), TypeError);
	} finally {
		await pool.destroy();
	}
});
