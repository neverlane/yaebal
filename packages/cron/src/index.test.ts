import assert from "node:assert/strict";
import test from "node:test";
import {
	Cron,
	CronExpressionError,
	CronJobNotFoundError,
	createCron,
	cron,
	parseCron,
} from "./index.js";

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

test("parseCron matches minute/hour/day-of-week fields", () => {
	const schedule = parseCron("30 9 * * 1-5");

	assert.equal(schedule.matches(new Date("2026-07-13T09:30:00Z")), true); // Monday
	assert.equal(schedule.matches(new Date("2026-07-11T09:30:00Z")), false); // Saturday
	assert.equal(schedule.matches(new Date("2026-07-13T09:31:00Z")), false);
});

test("parseCron supports steps and lists", () => {
	const schedule = parseCron("*/15 * * * *");
	assert.deepEqual(
		[0, 15, 30, 45].map((m) => schedule.matches(new Date(Date.UTC(2026, 0, 1, 0, m)))),
		[true, true, true, true],
	);
	assert.equal(schedule.matches(new Date(Date.UTC(2026, 0, 1, 0, 10))), false);

	const list = parseCron("0,10,20 * * * *");
	assert.equal(list.matches(new Date(Date.UTC(2026, 0, 1, 0, 10))), true);
	assert.equal(list.matches(new Date(Date.UTC(2026, 0, 1, 0, 15))), false);
});

test("parseCron day-of-month/day-of-week combine with OR when both are restricted", () => {
	// the 1st of the month, OR any Monday.
	const schedule = parseCron("0 0 1 * 1");
	assert.equal(schedule.matches(new Date("2026-07-01T00:00:00Z")), true); // 1st, a Wednesday
	assert.equal(schedule.matches(new Date("2026-07-13T00:00:00Z")), true); // a Monday, not the 1st
	assert.equal(schedule.matches(new Date("2026-07-14T00:00:00Z")), false); // neither
});

test("parseCron resolves @aliases", () => {
	assert.equal(parseCron("@daily").matches(new Date("2026-01-01T00:00:00Z")), true);
	assert.equal(parseCron("@hourly").matches(new Date("2026-01-01T05:00:00Z")), true);
	assert.equal(parseCron("@hourly").matches(new Date("2026-01-01T05:01:00Z")), false);
});

test("parseCron.next finds the next matching minute strictly after `from`", () => {
	const schedule = parseCron("0 * * * *"); // top of every hour
	const next = schedule.next(new Date("2026-01-01T10:00:00Z"));
	assert.equal(next.toISOString(), "2026-01-01T11:00:00.000Z");
});

test("parseCron rejects malformed expressions", () => {
	assert.throws(() => parseCron("* * *"), CronExpressionError);
	assert.throws(() => parseCron("60 * * * *"), CronExpressionError);
	assert.throws(() => parseCron("abc * * * *"), CronExpressionError);
});

test("job() rejects a duplicate name", () => {
	const scheduler = new Cron();
	scheduler.job("a", 1000, () => {});
	assert.throws(() => scheduler.job("a", 1000, () => {}), /already registered/);
});

test("job() rejects a non-positive interval", () => {
	const scheduler = new Cron();
	assert.throws(() => scheduler.job("a", 0, () => {}), RangeError);
});

test("trigger() runs a job immediately and updates its state", async () => {
	const seen: number[] = [];
	const scheduler = new Cron().job("tick", 60_000, (ctx) => {
		seen.push(ctx.run);
	});

	await scheduler.trigger("tick");
	assert.deepEqual(seen, [1]);

	const state = scheduler.state("tick");
	assert.equal(state?.runs, 1);
	assert.equal(state?.failures, 0);
	assert.equal(state?.running, false);
});

test("trigger() on an unknown job throws CronJobNotFoundError", async () => {
	const scheduler = new Cron();
	await assert.rejects(() => scheduler.trigger("missing" as never), CronJobNotFoundError);
});

test("overlap 'skip' drops a run that arrives while the previous one is still going", async () => {
	let inFlight = 0;
	let maxConcurrent = 0;

	const scheduler = new Cron().job(
		"slow",
		60_000,
		async () => {
			inFlight++;
			maxConcurrent = Math.max(maxConcurrent, inFlight);
			await sleep(30);
			inFlight--;
		},
		{ overlap: "skip" },
	);

	const first = scheduler.trigger("slow");
	await sleep(5);
	await scheduler.trigger("slow"); // arrives while `first` is still running — skipped
	await first;

	assert.equal(maxConcurrent, 1);
	const state = scheduler.state("slow");
	assert.equal(state?.runs, 1);
});

test("overlap 'wait' queues exactly one run after the current one finishes", async () => {
	const order: string[] = [];

	const scheduler = new Cron().job(
		"queued",
		60_000,
		async (ctx) => {
			order.push(`start:${ctx.run}`);
			await sleep(20);
			order.push(`end:${ctx.run}`);
		},
		{ overlap: "wait" },
	);

	const first = scheduler.trigger("queued");
	await sleep(5);
	const second = scheduler.trigger("queued"); // queued behind the first
	await sleep(5);
	const third = scheduler.trigger("queued"); // collapses into the single already-queued run
	await Promise.all([first, second, third]);

	assert.deepEqual(order, ["start:1", "end:1", "start:2", "end:2"]);
	assert.equal(scheduler.state("queued")?.runs, 2);
});

test("a failing task increments failures and calls onError without throwing", async () => {
	const errors: unknown[] = [];
	const scheduler = new Cron().job(
		"boom",
		60_000,
		() => {
			throw new Error("nope");
		},
		{ onError: (error) => errors.push(error) },
	);

	await scheduler.trigger("boom");

	assert.equal(errors.length, 1);
	assert.equal((errors[0] as Error).message, "nope");
	const state = scheduler.state("boom");
	assert.equal(state?.failures, 1);
	assert.equal((state?.lastError as Error).message, "nope");
});

test("timeoutMs aborts ctx.signal while the scheduler stops waiting", async () => {
	let aborted = false;

	const scheduler = new Cron().job(
		"laggy",
		60_000,
		async (ctx) => {
			await new Promise<void>((resolve) => {
				ctx.signal.addEventListener("abort", () => {
					aborted = true;
					resolve();
				});
			});
		},
		{ timeoutMs: 10 },
	);

	await scheduler.trigger("laggy");
	assert.equal(aborted, true);
});

test("start() arms an interval job and fires it repeatedly", async () => {
	const scheduler = new Cron();
	let runs = 0;
	scheduler.job("heartbeat", 20, () => {
		runs++;
	});

	scheduler.start();
	await sleep(75);
	await scheduler.stop();

	assert.ok(runs >= 2, `expected at least 2 runs, got ${runs}`);
});

test("runOnStart fires once immediately in addition to the normal schedule", async () => {
	const scheduler = new Cron();
	let runs = 0;
	scheduler.job(
		"boot",
		60_000,
		() => {
			runs++;
		},
		{ runOnStart: true },
	);

	scheduler.start();
	await sleep(10);
	await scheduler.stop();

	assert.equal(runs, 1);
});

test("stop() is graceful by default: it waits for an in-flight run to finish", async () => {
	const scheduler = new Cron();
	let finished = false;
	scheduler.job("draining", 20, async () => {
		await sleep(40);
		finished = true;
	});

	scheduler.start();
	await sleep(25); // let the run start
	await scheduler.stop();

	assert.equal(finished, true);
});

test("stop({ graceful: false }) returns immediately without waiting", async () => {
	const scheduler = new Cron();
	let finished = false;
	scheduler.job("abandoned", 20, async () => {
		await sleep(200);
		finished = true;
	});

	scheduler.start();
	await sleep(25);
	await scheduler.stop({ graceful: false });

	assert.equal(finished, false);
});

test("stop() does not arm new runs after it resolves", async () => {
	const scheduler = new Cron();
	let runs = 0;
	scheduler.job("stopped", 15, () => {
		runs++;
	});

	scheduler.start();
	await sleep(20);
	await scheduler.stop();
	const runsAtStop = runs;
	await sleep(60);

	assert.equal(runs, runsAtStop);
});

test("createCron() returns a standalone scheduler with no bot wiring", async () => {
	let ran = false;
	const scheduler = createCron().job("solo", 60_000, () => {
		ran = true;
	});

	await scheduler.trigger("solo");
	assert.equal(ran, true);
});

test("cron() plugin wires bot.onStart/onStop and exposes .handle", async () => {
	const startHandlers: Array<() => unknown> = [];
	const stopHandlers: Array<() => unknown> = [];
	const bot = {
		onStart: (handler: () => unknown) => {
			startHandlers.push(handler);
			return bot;
		},
		onStop: (handler: () => unknown) => {
			stopHandlers.push(handler);
			return bot;
		},
	};

	let runs = 0;
	const plugin = cron({
		jobs: { ping: { schedule: 15, task: () => void runs++ } },
	});

	// biome-ignore lint/suspicious/noExplicitAny: exercising the plugin against a minimal bot stub
	const out = (plugin as any)(bot);
	assert.equal(out, bot);
	assert.equal(plugin.handle.running, false);

	for (const start of startHandlers) start();
	assert.equal(plugin.handle.running, true);

	await sleep(40);
	assert.ok(runs >= 1);

	for (const stop of stopHandlers) await stop();
	assert.equal(plugin.handle.running, false);
});
