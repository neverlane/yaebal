import assert from "node:assert/strict";
import test from "node:test";
import { installTestClock } from "@yaebal/test";
import {
	CronJobExistsError,
	CronJobNotFoundError,
	CronStoppedError,
	CronTimeoutError,
} from "./errors.js";
import { Cron } from "./scheduler.js";

/** yields until the next real macrotask, letting any pending microtasks (an un-awaited dispatch,
 * a task body scheduled via `Promise.resolve().then(...)`) run first — independent of whichever
 * clock (real or virtual) is currently active, since `installTestClock` never overrides
 * `setImmediate`. */
function flushMicrotasks(): Promise<void> {
	return new Promise((resolve) => setImmediate(resolve));
}

test("job() rejects a duplicate name", { timeout: 5000 }, () => {
	const scheduler = new Cron();
	scheduler.job("a", 1000, () => {});
	assert.throws(() => scheduler.job("a", 1000, () => {}), CronJobExistsError);
});

test("job() rejects a non-positive interval", { timeout: 5000 }, () => {
	const scheduler = new Cron();
	assert.throws(() => scheduler.job("a", 0, () => {}), RangeError);
});

test("job() rejects an unrecognized tz eagerly, at registration", { timeout: 5000 }, () => {
	const scheduler = new Cron();
	assert.throws(() => scheduler.job("a", 1000, () => {}, { tz: "Not/AZone" }), RangeError);
});

test("Cron construction rejects an unrecognized global tz eagerly", { timeout: 5000 }, () => {
	assert.throws(() => new Cron({ tz: "Not/AZone" }), RangeError);
});

test('trigger() runs a job immediately and reports "ran"', { timeout: 5000 }, async () => {
	const seen: number[] = [];
	const scheduler = new Cron().job("tick", 60_000, (ctx) => {
		seen.push(ctx.run);
	});

	const outcome = await scheduler.trigger("tick");
	assert.equal(outcome, "ran");
	assert.deepEqual(seen, [1]);

	const state = scheduler.state("tick");
	assert.equal(state?.runs, 1);
	assert.equal(state?.failures, 0);
	assert.equal(state?.running, false);
});

test("trigger() on an unknown job throws CronJobNotFoundError", { timeout: 5000 }, async () => {
	const scheduler = new Cron();
	await assert.rejects(() => scheduler.trigger("missing" as never), CronJobNotFoundError);
});

test('overlap "skip" drops a run that arrives while the previous one is still going', {
	timeout: 5000,
}, async () => {
	let releaseFirst: (() => void) | undefined;
	const scheduler = new Cron().job(
		"slow",
		60_000,
		() => new Promise<void>((resolve) => (releaseFirst = resolve)),
		{ overlap: "skip" },
	);

	const first = scheduler.trigger("slow");
	const second = await scheduler.trigger("slow"); // arrives while `first` is still running
	assert.equal(second, "skipped");

	releaseFirst?.();
	assert.equal(await first, "ran");

	const state = scheduler.state("slow");
	assert.equal(state?.runs, 1);
});

test('overlap "wait" queues exactly one run after the current one finishes', {
	timeout: 5000,
}, async () => {
	const order: string[] = [];
	const resolvers: Array<() => void> = [];
	const scheduler = new Cron().job(
		"queued",
		60_000,
		(ctx) => {
			order.push(`start:${ctx.run}`);
			return new Promise<void>((resolve) => resolvers.push(() => resolve()));
		},
		{ overlap: "wait" },
	);

	const first = scheduler.trigger("queued");
	await flushMicrotasks(); // let the first task body actually run and register its resolver
	const second = scheduler.trigger("queued"); // queued behind the first
	const third = scheduler.trigger("queued"); // collapses into the single already-queued run

	resolvers[0]?.();
	order.push("end:1");
	await flushMicrotasks(); // let the queued run start
	resolvers[1]?.();
	order.push("end:2");

	assert.deepEqual(await Promise.all([first, second, third]), ["ran", "ran", "ran"]);
	assert.deepEqual(order, ["start:1", "end:1", "start:2", "end:2"]);
	assert.equal(scheduler.state("queued")?.runs, 2);
});

test('overlap "allow" runs concurrently instead of skipping or queueing', {
	timeout: 5000,
}, async () => {
	let concurrent = 0;
	let maxConcurrent = 0;
	const resolvers: Array<() => void> = [];
	const scheduler = new Cron().job(
		"parallel",
		60_000,
		() => {
			concurrent++;
			maxConcurrent = Math.max(maxConcurrent, concurrent);
			return new Promise<void>((resolve) =>
				resolvers.push(() => {
					concurrent--;
					resolve();
				}),
			);
		},
		{ overlap: "allow" },
	);

	const first = scheduler.trigger("parallel");
	const second = scheduler.trigger("parallel");
	await flushMicrotasks();

	assert.equal(maxConcurrent, 2);
	assert.equal(scheduler.state("parallel")?.activeRuns, 2);

	for (const resolve of resolvers) resolve();
	assert.deepEqual(await Promise.all([first, second]), ["ran", "ran"]);
	assert.equal(scheduler.state("parallel")?.runs, 2);
});

test("a failing task increments failures, records lastError/lastFailureAt, and calls onError", {
	timeout: 5000,
}, async () => {
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
	assert.equal(typeof state?.lastFailureAt, "number");
});

test("a success after a failure clears lastError but keeps the historical failure count", {
	timeout: 5000,
}, async () => {
	let shouldFail = true;
	const scheduler = new Cron().job("flaky", 60_000, () => {
		if (shouldFail) throw new Error("nope");
	});

	await scheduler.trigger("flaky");
	assert.ok(scheduler.state("flaky")?.lastError);

	shouldFail = false;
	await scheduler.trigger("flaky");
	assert.equal(scheduler.state("flaky")?.lastError, undefined);
	assert.equal(scheduler.state("flaky")?.failures, 1);
});

// bug fix: `timeoutMs` used to have no effect on the scheduler — a task that ignored `ctx.signal`
// blocked forever, `running` never cleared, and the job was dead until process restart.
test("timeoutMs stops the scheduler waiting on an uncooperative task that ignores ctx.signal", {
	timeout: 5000,
}, async () => {
	let aborted = false;
	let releaseHang: (() => void) | undefined;
	const scheduler = new Cron().job(
		"hang",
		60_000,
		(ctx) =>
			new Promise<void>((resolve) => {
				ctx.signal.addEventListener("abort", () => {
					aborted = true;
				});
				releaseHang = resolve; // the task itself never resolves on its own
			}),
		{ timeoutMs: 10 },
	);

	const clock = installTestClock();
	try {
		const triggered = scheduler.trigger("hang");
		await flushMicrotasks();
		await clock.advance(10);

		const outcome = await triggered; // must settle even though the task promise never does
		assert.equal(outcome, "ran");
		assert.equal(aborted, true);

		const state = scheduler.state("hang");
		assert.equal(state?.running, false); // never stuck "running" forever
		assert.equal(state?.activeRuns, 0);
		assert.equal(state?.failures, 1);
		assert.ok(state?.lastError instanceof CronTimeoutError);
	} finally {
		releaseHang?.();
		clock.restore();
	}
});

test("a task that finishes after its timeout doesn't retroactively flip the run back to success", {
	timeout: 5000,
}, async () => {
	let releaseHang: (() => void) | undefined;
	const events: string[] = [];
	const scheduler = new Cron().job(
		"late",
		60_000,
		() => new Promise<void>((resolve) => (releaseHang = resolve)),
		{ timeoutMs: 10, onError: () => events.push("onError") },
	);

	const clock = installTestClock();
	try {
		const triggered = scheduler.trigger("late");
		await flushMicrotasks();
		await clock.advance(10);
		await triggered;
		assert.equal(scheduler.state("late")?.failures, 1);

		releaseHang?.(); // the abandoned task resolves late — must not surface as an unhandled rejection
		await flushMicrotasks();
		assert.equal(scheduler.state("late")?.failures, 1); // unchanged — the run was already finalized
		assert.deepEqual(events, ["onError"]);
	} finally {
		clock.restore();
	}
});

test("retries: a task that fails then succeeds is retried up to `retries` times", {
	timeout: 5000,
}, async () => {
	let attempts = 0;
	const scheduler = new Cron().job(
		"retrying",
		60_000,
		(ctx) => {
			attempts++;
			assert.equal(ctx.attempt, attempts);
			if (attempts < 3) throw new Error(`fail ${attempts}`);
		},
		{ retries: 2 },
	);

	const outcome = await scheduler.trigger("retrying");
	assert.equal(outcome, "ran");
	assert.equal(attempts, 3);

	const state = scheduler.state("retrying");
	assert.equal(state?.failures, 0); // eventual success — not counted as a failure
	assert.equal(state?.runs, 1); // one occurrence, three attempts
});

test("retries: exhausting every attempt counts as exactly one failure and calls onError once", {
	timeout: 5000,
}, async () => {
	let attempts = 0;
	const errors: unknown[] = [];
	const scheduler = new Cron().job(
		"doomed",
		60_000,
		() => {
			attempts++;
			throw new Error("nope");
		},
		{ retries: 2, onError: (error) => errors.push(error) },
	);

	await scheduler.trigger("doomed");
	assert.equal(attempts, 3); // 1 initial + 2 retries
	assert.equal(errors.length, 1);

	const state = scheduler.state("doomed");
	assert.equal(state?.failures, 1);
	assert.equal(state?.runs, 1);
});

test("retryDelayMs backs off between attempts, using the failed attempt number", {
	timeout: 5000,
}, async () => {
	const clock = installTestClock();
	try {
		let attempts = 0;
		const delays: number[] = [];
		const scheduler = new Cron().job(
			"backoff",
			60_000,
			() => {
				attempts++;
				if (attempts < 3) throw new Error("nope");
			},
			{
				retries: 2,
				retryDelayMs: (attempt) => {
					delays.push(attempt);
					return attempt * 100;
				},
			},
		);

		const triggered = scheduler.trigger("backoff");
		await flushMicrotasks();
		await clock.advance(100); // delay before retry of attempt 1
		await flushMicrotasks();
		await clock.advance(200); // delay before retry of attempt 2
		await triggered;

		assert.equal(attempts, 3);
		assert.deepEqual(delays, [1, 2]);
	} finally {
		clock.restore();
	}
});

test("start() arms an interval job and fires it repeatedly", { timeout: 5000 }, async () => {
	const clock = installTestClock();
	try {
		let runs = 0;
		const scheduler = new Cron().job("heartbeat", 1000, () => {
			runs++;
		});

		scheduler.start();
		// advance one tick at a time, flushing microtasks between each: `clock.advance()` only
		// awaits one microtask tick per fired timer, which isn't enough for the rearm chain
		// (task -> finally -> #safeArm -> #arm -> a fresh setTimeout) to land before the loop
		// re-checks for due timers — a single `advance(3500)` would only ever fire once.
		for (let i = 0; i < 3; i++) {
			await clock.advance(1000);
			await flushMicrotasks();
		}
		assert.equal(runs, 3);

		await scheduler.stop({ graceful: false });
	} finally {
		clock.restore();
	}
});

test("start() fires a cron-expression job on its own timer, not just interval jobs", {
	timeout: 5000,
}, async () => {
	const clock = installTestClock(Date.UTC(2026, 0, 1, 11, 59, 0));
	try {
		let runs = 0;
		const scheduler = new Cron().job("noon", "0 12 * * *", () => {
			runs++;
		});

		scheduler.start();
		await clock.advance(59_000);
		assert.equal(runs, 0);

		await clock.advance(1_000); // now exactly 12:00:00
		assert.equal(runs, 1);

		await scheduler.stop({ graceful: false });
	} finally {
		clock.restore();
	}
});

// bug fix: `runOnStart` used to re-arm anchored on its own fire time, silently skipping the job's
// first genuinely scheduled tick.
test("runOnStart fires once immediately without stealing the next scheduled tick", {
	timeout: 5000,
}, async () => {
	const clock = installTestClock();
	try {
		let runs = 0;
		const scheduler = new Cron().job(
			"boot",
			1000,
			() => {
				runs++;
			},
			{ runOnStart: true },
		);

		scheduler.start();
		await flushMicrotasks(); // let the runOnStart fire complete
		assert.equal(runs, 1);

		await clock.advance(999);
		assert.equal(runs, 1); // the scheduled tick hasn't arrived yet

		await clock.advance(2);
		assert.equal(runs, 2); // the first scheduled tick still fires at its original t+1000 mark

		await scheduler.stop({ graceful: false });
	} finally {
		clock.restore();
	}
});

// bug fix: a manual `trigger()` used to re-arm the *next* occurrence anchored on its own fire
// time, pushing the real scheduled tick back by a full interval instead of leaving it alone.
test("a manual trigger() does not disturb the job's own schedule", { timeout: 5000 }, async () => {
	const clock = installTestClock();
	try {
		let runs = 0;
		const scheduler = new Cron().job("iv", 1000, () => {
			runs++;
		});

		scheduler.start(); // arms nextRunAt = now + 1000
		await scheduler.trigger("iv"); // manual run — must not touch the pending timer
		assert.equal(runs, 1);

		await clock.advance(999);
		assert.equal(runs, 1); // not pulled forward by the manual trigger

		await clock.advance(2);
		assert.equal(runs, 2); // and not pushed back by it either — fires at the original t+1000

		await scheduler.stop({ graceful: false });
	} finally {
		clock.restore();
	}
});

test("stop() is graceful by default: it waits for an in-flight run to finish", {
	timeout: 5000,
}, async () => {
	let releaseRun: (() => void) | undefined;
	const scheduler = new Cron({ drainTimeoutMs: 500 }).job(
		"draining",
		60_000,
		() => new Promise<void>((resolve) => (releaseRun = resolve)),
	);

	const triggered = scheduler.trigger("draining");
	await flushMicrotasks();

	let stopResolved = false;
	const stopped = scheduler.stop().then(() => {
		stopResolved = true;
	});

	await flushMicrotasks();
	assert.equal(stopResolved, false); // still draining

	releaseRun?.();
	await triggered;
	await stopped;
	assert.equal(stopResolved, true);
});

test("stop({ graceful: false }) returns immediately and aborts ctx.signal with a CronStoppedError", {
	timeout: 5000,
}, async () => {
	let abortReason: unknown;
	let releaseRun: (() => void) | undefined;
	const scheduler = new Cron().job("abandoned", 60_000, (ctx) => {
		ctx.signal.addEventListener("abort", () => {
			abortReason = ctx.signal.reason;
		});
		return new Promise<void>((resolve) => (releaseRun = resolve));
	});

	const triggered = scheduler.trigger("abandoned");
	await flushMicrotasks();

	await scheduler.stop({ graceful: false });
	assert.ok(abortReason instanceof CronStoppedError);

	releaseRun?.(); // the abandoned task still resolves eventually — must not go unhandled
	await triggered;
});

test("stop() does not arm new runs after it resolves", { timeout: 5000 }, async () => {
	const clock = installTestClock();
	try {
		let runs = 0;
		const scheduler = new Cron().job("stopped", 1000, () => {
			runs++;
		});

		scheduler.start();
		for (let i = 0; i < 2; i++) {
			await clock.advance(1000);
			await flushMicrotasks(); // let the rearm chain land before the next advance
		}
		const runsAtStop = runs;
		assert.ok(runsAtStop >= 2);

		await scheduler.stop({ graceful: false });
		await clock.advance(5000);
		await flushMicrotasks();
		assert.equal(runs, runsAtStop);
	} finally {
		clock.restore();
	}
});

// bug fix: a queued `overlap: "wait"` run used to fire unconditionally in `finally`, regardless
// of whether `stop()` had already been called — so it could start (and keep running) *after*
// `stop()` had already resolved. the fix is a drain loop that re-snapshots `#inFlight` on every
// settle, so a run spawned mid-drain is still watched instead of leaking into the background.
test('overlap "wait": a run queued right before stop() finishes inside the drain window, not after', {
	timeout: 5000,
}, async () => {
	const order: string[] = [];
	const resolvers: Array<() => void> = [];
	const scheduler = new Cron({ drainTimeoutMs: 5000 }).job(
		"q",
		60_000,
		(ctx) => {
			order.push(`start:${ctx.run}`);
			return new Promise<void>((resolve) =>
				resolvers.push(() => {
					order.push(`end:${ctx.run}`);
					resolve();
				}),
			);
		},
		{ overlap: "wait" },
	);

	const first = scheduler.trigger("q");
	await flushMicrotasks();
	const second = scheduler.trigger("q"); // queues behind the first

	let stopResolved = false;
	const stopped = scheduler.stop().then(() => {
		stopResolved = true;
	});

	resolvers[0]?.(); // let run 1 finish — this is what spawns run 2 (the queued one)
	await flushMicrotasks();
	assert.equal(stopResolved, false); // must still be draining: run 2 just started

	resolvers[1]?.(); // let run 2 finish
	await stopped;

	assert.equal(stopResolved, true);
	assert.deepEqual(order, ["start:1", "end:1", "start:2", "end:2"]);
	assert.deepEqual(await Promise.all([first, second]), ["ran", "ran"]);
});

// bug fix: an unsatisfiable expression used to pass registration and only blow up later — via an
// unhandled rejection (through `runOnStart`) or a synchronous throw mid-`start()` that left
// `#running = true` with the rest of the jobs half-armed.
test("an unsatisfiable schedule is rejected at job() registration, not later", {
	timeout: 5000,
}, () => {
	const scheduler = new Cron();
	assert.throws(() => scheduler.job("feb31", "0 0 31 2 *", () => {}), /can never match/);
});

test("start() never half-arms: a rare-but-valid schedule doesn't throw synchronously", {
	timeout: 5000,
}, () => {
	const scheduler = new Cron().job("a", 1000, () => {}).job("b", "0 0 29 2 *", () => {}); // rare (leap-year), not invalid
	assert.doesNotThrow(() => scheduler.start());
	void scheduler.stop({ graceful: false });
});

test("runOnStart never produces an unhandledRejection, even for a job whose task throws", {
	timeout: 5000,
}, async () => {
	let unhandled: unknown;
	const onUnhandled = (reason: unknown) => {
		unhandled = reason;
	};
	process.on("unhandledRejection", onUnhandled);
	try {
		const scheduler = new Cron().job(
			"boot-throws",
			60_000,
			() => {
				throw new Error("boom");
			},
			{ runOnStart: true },
		);
		scheduler.start();
		await flushMicrotasks();
		await scheduler.stop({ graceful: false });
		assert.equal(unhandled, undefined);
	} finally {
		process.off("unhandledRejection", onUnhandled);
	}
});

test("pause() stops automatic firing without unregistering the job; resume() re-arms it", {
	timeout: 5000,
}, async () => {
	const clock = installTestClock();
	try {
		let runs = 0;
		const scheduler = new Cron().job("pausable", 1000, () => {
			runs++;
		});
		scheduler.start();

		await clock.advance(1000);
		assert.equal(runs, 1);

		scheduler.pause("pausable");
		assert.equal(scheduler.state("pausable")?.paused, true);
		assert.equal(scheduler.state("pausable")?.nextRunAt, undefined);

		await clock.advance(5000);
		assert.equal(runs, 1); // no automatic firing while paused

		await scheduler.trigger("pausable"); // manual trigger still works while paused
		assert.equal(runs, 2);

		scheduler.resume("pausable");
		await clock.advance(1000);
		assert.equal(runs, 3);

		await scheduler.stop({ graceful: false });
	} finally {
		clock.restore();
	}
});

test("remove() unregisters a job and clears its timer — no zombie firing afterward", {
	timeout: 5000,
}, async () => {
	const clock = installTestClock();
	try {
		let runs = 0;
		const scheduler = new Cron().job("removable", 1000, () => {
			runs++;
		});
		scheduler.start();

		assert.equal(scheduler.remove("removable"), true);
		assert.equal(scheduler.remove("removable"), false); // already gone
		assert.deepEqual(scheduler.names, []);

		await clock.advance(5000);
		assert.equal(runs, 0);
	} finally {
		clock.restore();
	}
});

test('remove() resolves a run queued behind an in-flight one (via overlap: "wait") as "skipped"', {
	timeout: 5000,
}, async () => {
	let releaseFirst: (() => void) | undefined;
	const scheduler = new Cron().job(
		"q2",
		60_000,
		() => new Promise<void>((resolve) => (releaseFirst = resolve)),
		{ overlap: "wait" },
	);

	const first = scheduler.trigger("q2");
	await flushMicrotasks();
	const second = scheduler.trigger("q2"); // queued

	scheduler.remove("q2");
	assert.equal(await second, "skipped");

	releaseFirst?.();
	assert.equal(await first, "ran");
});

test("reschedule() replaces a job's schedule in place and re-arms immediately", {
	timeout: 5000,
}, async () => {
	const clock = installTestClock();
	try {
		let runs = 0;
		const scheduler = new Cron().job("changeable", 1000, () => {
			runs++;
		});
		scheduler.start();

		scheduler.reschedule("changeable", 5000);
		await clock.advance(1000);
		assert.equal(runs, 0); // the old 1000ms schedule no longer applies

		await clock.advance(4000);
		assert.equal(runs, 1);

		await scheduler.stop({ graceful: false });
	} finally {
		clock.restore();
	}
});

test("nextRuns() previews upcoming fire times for an interval schedule without arming anything", {
	timeout: 5000,
}, () => {
	const now = Date.UTC(2026, 0, 1, 0, 0, 0);
	const scheduler = new Cron({ now: () => now }).job("preview", 1000, () => {});
	const runs = scheduler.nextRuns("preview", 3);
	assert.deepEqual(
		runs.map((d) => d.getTime() - now),
		[1000, 2000, 3000],
	);
	assert.equal(scheduler.state("preview")?.nextRunAt, undefined); // preview only — never arms
});

test("nextRuns() previews upcoming fire times for a cron-expression schedule", {
	timeout: 5000,
}, () => {
	const now = new Date("2026-01-01T00:00:00Z").getTime();
	const scheduler = new Cron({ now: () => now }).job("daily", "0 12 * * *", () => {});
	const runs = scheduler.nextRuns("daily", 2);
	assert.equal(runs[0]?.toISOString(), "2026-01-01T12:00:00.000Z");
	assert.equal(runs[1]?.toISOString(), "2026-01-02T12:00:00.000Z");
});

test("nextRuns() returns an empty array for @reboot", { timeout: 5000 }, () => {
	const scheduler = new Cron().job("boot-preview", "@reboot", () => {});
	assert.deepEqual(scheduler.nextRuns("boot-preview", 3), []);
});

test("@reboot fires once at start() and never arms a timer", { timeout: 5000 }, async () => {
	const clock = installTestClock();
	try {
		let runs = 0;
		const scheduler = new Cron().job("boot-once", "@reboot", () => {
			runs++;
		});

		scheduler.start();
		await flushMicrotasks();
		assert.equal(runs, 1);
		assert.equal(scheduler.state("boot-once")?.nextRunAt, undefined);

		await clock.advance(1_000_000_000);
		assert.equal(runs, 1); // never fires again on its own

		await scheduler.stop({ graceful: false });
	} finally {
		clock.restore();
	}
});

test("catchUp fires a missed run once at start(), using the persisted lastRunAt", {
	timeout: 5000,
}, async () => {
	// a *real* (unvirtualized) clock here would be a latent hazard: a job whose interval anchor
	// never catches up to a frozen `now()` re-arms a *real* timer forever (`now() >= dueAt` can
	// never become true), and if an assertion above `stop()` ever throws, that timer outlives the
	// test. a virtual clock keeps every timer fake, so there's nothing real left dangling either way.
	const t0 = Date.UTC(2026, 0, 1, 0, 0, 0);
	const clock = installTestClock(t0);
	try {
		const store = new Map<string, { lastRunAt: number }>();
		const adapter = {
			get: (key: string) => store.get(key),
			set: (key: string, value: { lastRunAt: number }) => {
				store.set(key, value);
			},
		};
		store.set("catchup-job", { lastRunAt: t0 - 5000 }); // last ran 5s before "now"; interval is 1s

		let runs = 0;
		const scheduler = new Cron({ store: adapter }).job(
			"catchup-job",
			1000,
			() => {
				runs++;
			},
			{ catchUp: true },
		);

		scheduler.start();
		await flushMicrotasks();
		assert.equal(runs, 1); // caught up exactly once, not five times

		await scheduler.stop({ graceful: false });
	} finally {
		clock.restore();
	}
});

test("catchUp does nothing when there's no persisted record, or nothing was missed", {
	timeout: 5000,
}, async () => {
	const clock = installTestClock();
	try {
		const store = new Map<string, { lastRunAt: number }>();
		const adapter = {
			get: (key: string) => store.get(key),
			set: (key: string, value: { lastRunAt: number }) => {
				store.set(key, value);
			},
		};

		let runs = 0;
		const scheduler = new Cron({ store: adapter }).job(
			"fresh",
			60_000,
			() => {
				runs++;
			},
			{ catchUp: true },
		);
		scheduler.start();
		await flushMicrotasks();
		assert.equal(runs, 0);
		await scheduler.stop({ graceful: false });
	} finally {
		clock.restore();
	}
});

test("a successful run persists lastRunAt to the store", { timeout: 5000 }, async () => {
	const store = new Map<string, { lastRunAt: number }>();
	const adapter = {
		get: (key: string) => store.get(key),
		set: (key: string, value: { lastRunAt: number }) => {
			store.set(key, value);
		},
	};

	const scheduler = new Cron({ store: adapter }).job("persisted", 60_000, () => {});
	await scheduler.trigger("persisted");
	await flushMicrotasks();
	assert.equal(typeof store.get("persisted")?.lastRunAt, "number");
});

test('acquireLock: a denied lock skips the run and emits run_skipped with reason "lock"', {
	timeout: 5000,
}, async () => {
	const events: string[] = [];
	const scheduler = new Cron({
		acquireLock: async () => false,
		onEvent: (e) => {
			if (e.type === "run_skipped") events.push(e.reason);
		},
	}).job("locked", 60_000, () => {});

	const outcome = await scheduler.trigger("locked");
	assert.equal(outcome, "skipped");
	assert.deepEqual(events, ["lock"]);
});

test("acquireLock: a granted lock's release function runs after the fire completes", {
	timeout: 5000,
}, async () => {
	let released = false;
	const scheduler = new Cron({
		acquireLock: async () => () => {
			released = true;
		},
	}).job("locked2", 60_000, () => {});
	await scheduler.trigger("locked2");
	assert.equal(released, true);
});

test("acquireLock: a throwing lock hook is treated as denied, not as a scheduler crash", {
	timeout: 5000,
}, async () => {
	const scheduler = new Cron({
		acquireLock: async () => {
			throw new Error("redis down");
		},
	}).job("locked3", 60_000, () => {});
	const outcome = await scheduler.trigger("locked3");
	assert.equal(outcome, "skipped");
});

test("jitterMs adds a bounded random delay on top of each scheduled fire, never early", {
	timeout: 5000,
}, async () => {
	const clock = installTestClock();
	try {
		let runs = 0;
		const scheduler = new Cron().job(
			"jittery",
			1000,
			() => {
				runs++;
			},
			{ jitterMs: 100 },
		);
		scheduler.start();

		await clock.advance(1000);
		assert.equal(runs, 0); // jitter never fires it early

		await clock.advance(100);
		assert.equal(runs, 1); // but always within [interval, interval + jitterMs]

		await scheduler.stop({ graceful: false });
	} finally {
		clock.restore();
	}
});

test("a job's tz overrides the scheduler's global tz", { timeout: 5000 }, async () => {
	const start = new Date("2026-07-12T00:00:00Z").getTime();
	const clock = installTestClock(start);
	try {
		let runs = 0;
		const scheduler = new Cron({ tz: "UTC" }).job(
			"moscow-9am",
			"0 9 * * *",
			() => {
				runs++;
			},
			{ tz: "Europe/Moscow" },
		);
		scheduler.start();

		// 09:00 Moscow (UTC+3) == 06:00 UTC == 6 hours after start
		await clock.advance(6 * 60 * 60 * 1000 - 1000);
		assert.equal(runs, 0);
		await clock.advance(1000);
		assert.equal(runs, 1);

		await scheduler.stop({ graceful: false });
	} finally {
		clock.restore();
	}
});
