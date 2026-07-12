import {
	CronExpressionError,
	CronJobExistsError,
	CronJobNotFoundError,
	CronStoppedError,
	CronTimeoutError,
} from "./errors.js";
import { type CronSchedule, parseCron } from "./parser.js";
import { validateTimeZone } from "./timezone.js";

export type Awaitable<T> = T | Promise<T>;
export type MaybePromise<T> = T | Promise<T>;

/** just under the 32-bit signed setTimeout ceiling; longer waits are re-armed in chunks. */
const MAX_TIMER_CHUNK_MS = 2_147_483_000;

export interface CronRunContext {
	name: string;
	/** 1-based counter for this job's scheduled/manual occurrences — does *not* advance across
	 * retries of the same occurrence (see `attempt`). */
	run: number;
	/** 1-based attempt-within-this-occurrence counter; `2` on the first retry, and so on. */
	attempt: number;
	scheduledFor: number;
	/** start of *this* attempt — a retried run gets a fresh `startedAt` each time. */
	startedAt: number;
	/** aborts when `timeoutMs` elapses, or when `stop()`'s drain window elapses. cooperative —
	 * pass it into your own async calls to actually cancel work. */
	signal: AbortSignal;
}

export type CronTask = (ctx: CronRunContext) => Awaitable<unknown>;

/**
 * a minimal, structurally-typed key-value store — deliberately shaped to match
 * `@yaebal/sklad`'s `StorageAdapter<T>` (the ecosystem-standard hook also used by
 * session/scenes/i18n/media-cache) without depending on the package. any sklad adapter
 * (`MemoryStorage`, `redisStorage`, `sqliteStorage`, `kvStorage`, `fileStorage`, …) satisfies
 * this structurally; every method may be sync or async.
 */
export interface CronStoreAdapter<T> {
	get(key: string): MaybePromise<T | undefined>;
	set(key: string, value: T): MaybePromise<unknown>;
	delete?(key: string): MaybePromise<unknown>;
}

export interface CronJobOptions {
	/** IANA zone this job's schedule is evaluated in. defaults to the scheduler's `tz`, then
	 * `"UTC"`. ignored for millisecond-interval schedules. */
	tz?: string;
	/** what to do when the previous run of this job is still in flight: `"skip"` (default) drops
	 * the new run, `"wait"` queues exactly one run to fire right after the current one finishes
	 * (extra due-while-queued fires collapse into that same run), `"allow"` fires concurrently. */
	overlap?: "skip" | "wait" | "allow";
	/** fire once immediately when the scheduler starts, in addition to the normal schedule. */
	runOnStart?: boolean;
	/** on `start()`, if a `store` is configured and this schedule had an occurrence due between
	 * the last recorded run and now, fire once to catch up before arming normally. */
	catchUp?: boolean;
	/** abort `ctx.signal` (cooperative) after this many ms and fail the run — the scheduler
	 * always stops waiting on it either way, so a run can never wedge the schedule. */
	timeoutMs?: number;
	/** extra attempts after a failed (or timed-out) run, before giving up. defaults to 0. */
	retries?: number;
	/** delay before each retry — a fixed number of ms, or a function of the attempt number (the
	 * attempt that just failed; `1` on the first retry). defaults to 0 (retry immediately). */
	retryDelayMs?: number | ((attempt: number) => number);
	/** random extra delay, 0..`jitterMs`, added to each scheduled fire — spreads out jobs that
	 * would otherwise all fire at the same instant. does not affect `state().nextRunAt`, which
	 * always reports the unjittered target. */
	jitterMs?: number;
	/** called after a run exhausts its retries. never blocks the scheduler. */
	onError?: (error: unknown, ctx: CronRunContext) => unknown;
}

export interface CronJobDefinition extends CronJobOptions {
	/** a 5- or 6-field cron expression / `@alias`, or a fixed interval in milliseconds. */
	schedule: string | number;
	task: CronTask;
}

export interface CronJobState {
	name: string;
	paused: boolean;
	nextRunAt?: number;
	lastRunAt?: number;
	lastDurationMs?: number;
	/** set only while the most recent completed run failed; cleared on the next success. */
	lastError?: unknown;
	lastFailureAt?: number;
	running: boolean;
	/** concurrently in-flight attempts — always 0 or 1 unless `overlap: "allow"`. */
	activeRuns: number;
	runs: number;
	failures: number;
}

export type CronEvent =
	| { type: "scheduled"; name: string; nextRunAt: number; at: number }
	| {
			type: "run_started";
			name: string;
			run: number;
			attempt: number;
			scheduledFor: number;
			at: number;
	  }
	| {
			type: "run_completed";
			name: string;
			run: number;
			attempt: number;
			durationMs: number;
			at: number;
	  }
	| { type: "run_failed"; name: string; run: number; attempt: number; error: unknown; at: number }
	| {
			type: "run_retry";
			name: string;
			run: number;
			attempt: number;
			error: unknown;
			delayMs: number;
			at: number;
	  }
	| { type: "run_skipped"; name: string; reason: "overlap" | "lock"; at: number }
	| { type: "run_timeout"; name: string; run: number; attempt: number; at: number }
	| { type: "store_error"; name: string; operation: "get" | "set"; error: unknown; at: number }
	| { type: "schedule_error"; name: string; error: unknown; at: number };

export interface CronClientOptions {
	jobs?: Record<string, CronJobDefinition>;
	/** default IANA zone for every job's schedule; a job's own `tz` overrides it. `"UTC"` when
	 * unset — matches every prior version of this plugin, which was UTC-only. */
	tz?: string;
	/** metrics/event hook. never awaited, never throws into the scheduler. */
	onEvent?: (event: CronEvent) => unknown;
	/** injected clock for schedule math and tests. */
	now?: () => number;
	/** wait for in-flight runs on `stop()`. defaults to true. */
	graceful?: boolean;
	/** cap on graceful drain, in ms. defaults to 30_000. */
	drainTimeoutMs?: number;
	/** persists each job's `lastRunAt`, enabling `catchUp`. any `@yaebal/sklad` adapter (or
	 * anything shaped like one) works — see {@link CronStoreAdapter}. */
	store?: CronStoreAdapter<{ lastRunAt: number }>;
	/** distributed-lock hook for multi-instance deployments: return `false` to skip this fire
	 * (another instance owns it), `true` to proceed with no release step, or a release function
	 * to call once the run finishes. thrown/rejected lock attempts are treated as `false` — a
	 * broken lock must never wedge the schedule. */
	acquireLock?: (name: string) => Promise<boolean | (() => void)>;
	/** don't keep the process alive for pending timers — useful for a standalone `createCron()`
	 * scheduler running alongside other work. defaults to false (Node's normal timer behavior). */
	unref?: boolean;
}

export interface CronStopOptions {
	graceful?: boolean;
	drainTimeoutMs?: number;
}

interface JobEntry {
	name: string;
	schedule: CronSchedule | number;
	task: CronTask;
	tz: string;
	overlap: "skip" | "wait" | "allow";
	runOnStart: boolean;
	catchUp: boolean;
	timeoutMs: number | undefined;
	retries: number;
	retryDelayMs: number | ((attempt: number) => number) | undefined;
	jitterMs: number;
	onError: ((error: unknown, ctx: CronRunContext) => unknown) | undefined;

	timer: ReturnType<typeof setTimeout> | undefined;
	nextRunAt: number | undefined;
	lastRunAt: number | undefined;
	lastDurationMs: number | undefined;
	lastError: unknown;
	lastFailureAt: number | undefined;
	paused: boolean;
	activeRuns: number;
	pending: boolean;
	waiters: Array<(outcome: "ran" | "skipped") => void>;
	runs: number;
	failures: number;
	run: number;
}

interface NormalizedOptions {
	tz: string;
	onEvent: ((event: CronEvent) => unknown) | undefined;
	now: () => number;
	graceful: boolean;
	drainTimeoutMs: number;
	store: CronStoreAdapter<{ lastRunAt: number }> | undefined;
	acquireLock: ((name: string) => Promise<boolean | (() => void)>) | undefined;
	unref: boolean;
}

function isReboot(schedule: CronSchedule | number): boolean {
	return typeof schedule !== "number" && schedule.isReboot;
}

/** declarative, typed cron scheduler. tasks are plain functions — close over `bot.api` to reach
 * Telegram. */
export class Cron<Jobs extends string = never> {
	readonly #options: NormalizedOptions;
	readonly #jobs = new Map<string, JobEntry>();
	readonly #inFlight = new Set<Promise<unknown>>();
	readonly #storeWrites = new Set<Promise<unknown>>();
	/** maps each in-flight attempt's controller to its job name, so `stop()` can attribute the
	 * `CronStoppedError` it aborts with to the job that was still running. */
	readonly #activeControllers = new Map<AbortController, string>();
	#running = false;

	constructor(options: CronClientOptions = {}) {
		this.#options = normalizeOptions(options);

		for (const [name, def] of Object.entries(options.jobs ?? {})) {
			this.job(name, def.schedule, def.task, def);
		}
	}

	get names(): Jobs[] {
		return [...this.#jobs.keys()] as Jobs[];
	}

	get running(): boolean {
		return this.#running;
	}

	/** register a job. chained calls accumulate valid `trigger()`/`state()` names. */
	job<const Name extends string>(
		name: Name,
		schedule: string | number,
		task: CronTask,
		options: CronJobOptions = {},
	): Cron<Jobs | Name> {
		if (this.#jobs.has(name)) throw new CronJobExistsError(name);

		const tz = options.tz ?? this.#options.tz;
		validateTimeZone(tz);

		const entry: JobEntry = {
			name,
			schedule: normalizeSchedule(name, schedule),
			task,
			tz,
			overlap: options.overlap ?? "skip",
			runOnStart: options.runOnStart ?? false,
			catchUp: options.catchUp ?? false,
			timeoutMs: options.timeoutMs,
			retries: Math.max(0, options.retries ?? 0),
			retryDelayMs: options.retryDelayMs,
			jitterMs: Math.max(0, options.jitterMs ?? 0),
			onError: options.onError,
			timer: undefined,
			nextRunAt: undefined,
			lastRunAt: undefined,
			lastDurationMs: undefined,
			lastError: undefined,
			lastFailureAt: undefined,
			paused: false,
			activeRuns: 0,
			pending: false,
			waiters: [],
			runs: 0,
			failures: 0,
			run: 0,
		};

		this.#jobs.set(name, entry);

		if (this.#running) this.#startJob(entry);

		return this as unknown as Cron<Jobs | Name>;
	}

	/** arm every registered job. idempotent. */
	start(): this {
		if (this.#running) return this;
		this.#running = true;

		for (const job of this.#jobs.values()) this.#startJob(job);

		return this;
	}

	/** disarm every job. by default waits for in-flight runs (and pending store writes) to
	 * finish, then aborts anything still going; `{ graceful: false }` aborts immediately. */
	async stop(options: CronStopOptions = {}): Promise<void> {
		this.#running = false;

		for (const job of this.#jobs.values()) {
			if (job.timer) clearTimeout(job.timer);
			job.timer = undefined;
		}

		const graceful = options.graceful ?? this.#options.graceful;
		const drainTimeoutMs = Math.max(0, options.drainTimeoutMs ?? this.#options.drainTimeoutMs);

		if (graceful) {
			// a re-snapshotting loop, not a single `Promise.allSettled` on a frozen list: an
			// `overlap: "wait"` run that's queued behind the one currently in flight only gets
			// added to `#inFlight` inside *that* run's `finally` — after a one-shot snapshot
			// taken here would already have stopped watching. re-checking on every settle is what
			// makes the queued run actually finish inside the drain window instead of leaking
			// into the background after `stop()` has already resolved.
			const deadline = this.#options.now() + drainTimeoutMs;
			while (this.#inFlight.size > 0 || this.#storeWrites.size > 0) {
				const remaining = deadline - this.#options.now();
				if (remaining <= 0) break;
				await raceWithTimeout([...this.#inFlight, ...this.#storeWrites], remaining);
			}
		}

		for (const job of this.#jobs.values()) {
			for (const resolve of job.waiters) resolve("skipped");
			job.waiters = [];
			job.pending = false;
		}

		for (const [controller, jobName] of this.#activeControllers) {
			controller.abort(new CronStoppedError(jobName));
		}
	}

	/** run a job immediately, respecting its overlap policy. reports `"skipped"` if it was
	 * dropped (busy under `overlap: "skip"`, or denied by `acquireLock`) instead of throwing.
	 * never disturbs the job's own schedule — the next scheduled tick still fires on time. */
	async trigger(name: Jobs): Promise<"ran" | "skipped"> {
		const job = this.#requireJob(name);
		return this.#fire(job, this.#options.now(), false);
	}

	/** unregister a job and clear its timer. any run queued behind it (via `overlap: "wait"`)
	 * resolves as `"skipped"`. returns `false` if the name wasn't registered. */
	remove(name: Jobs): boolean {
		const job = this.#jobs.get(name);
		if (!job) return false;

		if (job.timer) clearTimeout(job.timer);
		this.#jobs.delete(name);

		if (job.pending || job.waiters.length > 0) {
			job.pending = false;
			const waiters = job.waiters;
			job.waiters = [];
			for (const resolve of waiters) resolve("skipped");
		}

		return true;
	}

	/** stop a job's automatic schedule without unregistering it. `trigger()` still works. */
	pause(name: Jobs): void {
		const job = this.#requireJob(name);
		job.paused = true;
		if (job.timer) clearTimeout(job.timer);
		job.timer = undefined;
		job.nextRunAt = undefined;
	}

	/** re-arm a job paused via `pause()`. */
	resume(name: Jobs): void {
		const job = this.#requireJob(name);
		job.paused = false;
		this.#safeArm(job);
	}

	/** replace a job's schedule in place, keeping its task and options. re-arms immediately
	 * (unless paused or the scheduler isn't running). */
	reschedule(name: Jobs, schedule: string | number): void {
		const job = this.#requireJob(name);
		job.schedule = normalizeSchedule(name, schedule);
		if (job.timer) clearTimeout(job.timer);
		job.timer = undefined;
		job.nextRunAt = undefined;
		this.#safeArm(job);
	}

	/** preview the next `count` fire times, without arming or disturbing anything. `@reboot`
	 * jobs (which never fire on a timer) return an empty array. */
	nextRuns(name: Jobs, count: number): Date[] {
		const job = this.#requireJob(name);
		const results: Date[] = [];
		if (count <= 0) return results;

		if (typeof job.schedule === "number") {
			const interval = job.schedule;
			let next = this.#computeNext(job, this.#options.now());
			for (let i = 0; i < count; i++) {
				results.push(new Date(next));
				next += interval;
			}
			return results;
		}

		if (job.schedule.isReboot) return results;

		let cursor = new Date(this.#options.now());
		for (let i = 0; i < count; i++) {
			cursor = job.schedule.next(cursor, job.tz);
			results.push(cursor);
		}
		return results;
	}

	state(name: Jobs): CronJobState | undefined {
		const job = this.#jobs.get(name);
		return job && snapshot(job);
	}

	states(): CronJobState[] {
		return [...this.#jobs.values()].map(snapshot);
	}

	#startJob(job: JobEntry): void {
		if (job.paused) return;

		if (isReboot(job.schedule) || job.runOnStart) {
			void this.#fire(job, this.#options.now(), false);
		} else if (job.catchUp && this.#options.store) {
			void this.#catchUp(job);
		}

		if (!isReboot(job.schedule)) this.#safeArm(job);
	}

	async #catchUp(job: JobEntry): Promise<void> {
		const store = this.#options.store;
		if (!store) return;

		let record: { lastRunAt: number } | undefined;
		try {
			record = await store.get(job.name);
		} catch (error) {
			this.#emit({
				type: "store_error",
				name: job.name,
				operation: "get",
				error,
				at: this.#options.now(),
			});
			return;
		}
		if (!record) return;

		let missedAt: number;
		try {
			// deliberately *not* `#computeNext`: that anchors an interval schedule on the live
			// `job.nextRunAt`, which `#safeArm` (called synchronously right after this async
			// function's first `await`, i.e. strictly before this line runs) has by now already
			// set to `now + interval` — anchoring on it here would silently compute "next after
			// the tick we just armed" instead of "next after the last recorded run", and a catch-up
			// that's already due would never fire. this is a one-off computation from history, with
			// no live anchor to respect.
			missedAt =
				typeof job.schedule === "number"
					? record.lastRunAt + job.schedule
					: job.schedule.next(new Date(record.lastRunAt), job.tz).getTime();
		} catch {
			return; // an unsatisfiable-within-4-years schedule just skips catch-up; #safeArm reports it
		}

		if (missedAt <= this.#options.now()) void this.#fire(job, missedAt, false);
	}

	/** `#arm`, but never lets a schedule-search failure (e.g. a 4-year search bound) escape as
	 * an unhandled rejection or a synchronous throw out of an async caller — it's reported as a
	 * `schedule_error` event instead. the job simply stays unarmed until `reschedule()`. */
	#safeArm(job: JobEntry): void {
		try {
			this.#arm(job);
		} catch (error) {
			this.#emit({ type: "schedule_error", name: job.name, error, at: this.#options.now() });
		}
	}

	#arm(job: JobEntry): void {
		// the third check guards a job removed (and possibly re-registered under the same name)
		// while a run was still in flight: that run's `finally` closes over the *old* `JobEntry`
		// object directly, not a fresh map lookup, so without this it would re-arm a timer for a
		// job that no longer exists (or steal the schedule of its same-named replacement).
		if (!this.#running || job.paused || isReboot(job.schedule) || this.#jobs.get(job.name) !== job)
			return;

		const nextRunAt = this.#computeNext(job, this.#options.now());
		job.nextRunAt = nextRunAt;
		this.#emit({ type: "scheduled", name: job.name, nextRunAt, at: this.#options.now() });
		this.#scheduleTimer(job, nextRunAt);
	}

	#scheduleTimer(job: JobEntry, dueAt: number): void {
		if (job.timer) clearTimeout(job.timer);

		const jitter = job.jitterMs > 0 ? Math.floor(Math.random() * job.jitterMs) : 0;
		const delay = Math.min(Math.max(0, dueAt - this.#options.now()) + jitter, MAX_TIMER_CHUNK_MS);

		job.timer = setTimeout(() => {
			job.timer = undefined;
			if (!this.#running || job.paused) return;
			if (this.#options.now() >= dueAt) void this.#fire(job, dueAt, true);
			else this.#scheduleTimer(job, dueAt);
		}, delay);

		if (this.#options.unref) unrefTimer(job.timer);
	}

	#computeNext(job: JobEntry, from: number): number {
		if (typeof job.schedule === "number") {
			const interval = job.schedule;
			let next = (job.nextRunAt ?? from) + interval;
			while (next <= from) next += interval;
			return next;
		}

		return job.schedule.next(new Date(from), job.tz).getTime();
	}

	/**
	 * admit and run one occurrence, respecting overlap/lock policy. `fromSchedule` distinguishes
	 * a timer-driven fire (which re-arms the job for its next tick) from a manual `trigger()`,
	 * `runOnStart`, or catch-up fire (which never touches the schedule). rearming happens
	 * immediately for a fire that's skipped or queued (so the timer never goes dark), and on
	 * completion for one that actually runs (so `next()` is computed from "now" rather than
	 * bursting through every tick a slow run passed through).
	 */
	async #fire(
		job: JobEntry,
		scheduledFor: number,
		fromSchedule: boolean,
	): Promise<"ran" | "skipped"> {
		if (job.overlap !== "allow" && job.activeRuns > 0) {
			if (job.overlap === "wait") {
				job.pending = true;
				if (fromSchedule) this.#safeArm(job);
				return new Promise<"ran" | "skipped">((resolve) => job.waiters.push(resolve));
			}

			this.#emit({
				type: "run_skipped",
				name: job.name,
				reason: "overlap",
				at: this.#options.now(),
			});
			if (fromSchedule) this.#safeArm(job);
			return "skipped";
		}

		let release: (() => void) | undefined;
		const acquireLock = this.#options.acquireLock;
		if (acquireLock) {
			let acquired: boolean | (() => void);
			try {
				acquired = await acquireLock(job.name);
			} catch {
				acquired = false; // a broken lock hook must never wedge the schedule
			}
			if (acquired === false) {
				this.#emit({
					type: "run_skipped",
					name: job.name,
					reason: "lock",
					at: this.#options.now(),
				});
				if (fromSchedule) this.#safeArm(job);
				return "skipped";
			}
			if (typeof acquired === "function") release = acquired;
		}

		job.activeRuns++;
		const run = ++job.run;

		const runPromise = this.#runWithRetries(job, run, scheduledFor).finally(() => {
			job.activeRuns--;
			if (release) {
				try {
					release();
				} catch {
					// a broken lock release must not affect scheduling either.
				}
			}
			this.#persistLastRunAt(job);

			if (job.pending) {
				job.pending = false;
				const waiters = job.waiters;
				job.waiters = [];
				void this.#fire(job, this.#options.now(), false).then((outcome) => {
					for (const resolve of waiters) resolve(outcome);
				});
			} else if (fromSchedule) {
				this.#safeArm(job);
			}
		});

		this.#inFlight.add(runPromise);
		runPromise.finally(() => this.#inFlight.delete(runPromise));

		await runPromise;
		return "ran";
	}

	async #runWithRetries(job: JobEntry, run: number, scheduledFor: number): Promise<void> {
		const maxAttempts = 1 + job.retries;

		for (let attempt = 1; attempt <= maxAttempts; attempt++) {
			const startedAt = this.#options.now();
			const controller = new AbortController();
			this.#activeControllers.set(controller, job.name);
			const timeoutMs = job.timeoutMs;
			let timer: ReturnType<typeof setTimeout> | undefined;

			const ctx: CronRunContext = {
				name: job.name,
				run,
				attempt,
				scheduledFor,
				startedAt,
				signal: controller.signal,
			};
			this.#emit({
				type: "run_started",
				name: job.name,
				run,
				attempt,
				scheduledFor,
				at: startedAt,
			});

			const taskPromise = Promise.resolve().then(() => job.task(ctx));
			taskPromise.catch(() => {}); // a run we've given up racing against must never surface as unhandled

			let failed = false;
			let error: unknown;
			try {
				if (timeoutMs !== undefined) {
					await Promise.race([
						taskPromise,
						new Promise<never>((_, reject) => {
							timer = setTimeout(() => {
								const timeoutError = new CronTimeoutError(job.name, timeoutMs);
								controller.abort(timeoutError);
								this.#emit({
									type: "run_timeout",
									name: job.name,
									run,
									attempt,
									at: this.#options.now(),
								});
								reject(timeoutError);
							}, timeoutMs);
						}),
					]);
				} else {
					await taskPromise;
				}
			} catch (caught) {
				failed = true;
				error = caught;
			} finally {
				if (timer) clearTimeout(timer);
				this.#activeControllers.delete(controller);
			}

			const durationMs = this.#options.now() - startedAt;

			if (!failed) {
				job.lastError = undefined;
				job.lastRunAt = startedAt;
				job.lastDurationMs = durationMs;
				job.runs++;
				this.#emit({
					type: "run_completed",
					name: job.name,
					run,
					attempt,
					durationMs,
					at: this.#options.now(),
				});
				return;
			}

			this.#emit({
				type: "run_failed",
				name: job.name,
				run,
				attempt,
				error,
				at: this.#options.now(),
			});

			if (attempt < maxAttempts) {
				const delay =
					typeof job.retryDelayMs === "function"
						? Math.max(0, job.retryDelayMs(attempt))
						: (job.retryDelayMs ?? 0);
				this.#emit({
					type: "run_retry",
					name: job.name,
					run,
					attempt,
					error,
					delayMs: delay,
					at: this.#options.now(),
				});
				if (delay > 0) await sleep(delay);
				continue;
			}

			job.failures++;
			job.lastError = error;
			job.lastFailureAt = this.#options.now();
			job.lastRunAt = startedAt;
			job.lastDurationMs = durationMs;
			job.runs++;
			await safeCall(job.onError, error, ctx);
			return;
		}
	}

	#persistLastRunAt(job: JobEntry): void {
		const store = this.#options.store;
		if (!store || job.lastRunAt === undefined) return;

		const write = Promise.resolve(store.set(job.name, { lastRunAt: job.lastRunAt })).catch(
			(error) => {
				this.#emit({
					type: "store_error",
					name: job.name,
					operation: "set",
					error,
					at: this.#options.now(),
				});
			},
		);
		this.#storeWrites.add(write);
		write.finally(() => this.#storeWrites.delete(write));
	}

	#requireJob(name: string): JobEntry {
		const job = this.#jobs.get(name);
		if (!job) throw new CronJobNotFoundError(name);
		return job;
	}

	#emit(event: CronEvent): void {
		try {
			this.#options.onEvent?.(event);
		} catch {
			// observability hooks must never affect scheduling.
		}
	}
}

function snapshot(job: JobEntry): CronJobState {
	return {
		name: job.name,
		paused: job.paused,
		nextRunAt: job.nextRunAt,
		lastRunAt: job.lastRunAt,
		lastDurationMs: job.lastDurationMs,
		lastError: job.lastError,
		lastFailureAt: job.lastFailureAt,
		running: job.activeRuns > 0,
		activeRuns: job.activeRuns,
		runs: job.runs,
		failures: job.failures,
	};
}

function normalizeSchedule(name: string, schedule: string | number): CronSchedule | number {
	return typeof schedule === "number" ? normalizeInterval(name, schedule) : parseCron(schedule);
}

function normalizeInterval(name: string, ms: number): number {
	if (!Number.isFinite(ms) || ms <= 0) {
		throw new RangeError(`cron: job "${name}" has an invalid interval (${ms}ms) — must be > 0`);
	}
	return ms;
}

function normalizeOptions(options: CronClientOptions): NormalizedOptions {
	const tz = options.tz ?? "UTC";
	validateTimeZone(tz);

	return {
		tz,
		onEvent: options.onEvent,
		now: options.now ?? (() => Date.now()),
		graceful: options.graceful ?? true,
		drainTimeoutMs: Math.max(0, options.drainTimeoutMs ?? 30_000),
		store: options.store,
		acquireLock: options.acquireLock,
		unref: options.unref ?? false,
	};
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
}

/** waits for any of `promises` to settle, or `ms`, whichever comes first — and, unlike a plain
 * `Promise.race([...promises, sleep(ms)])`, always clears its own timer before returning. a
 * "losing" `sleep()` left running is a real leak, not just test noise: every graceful `stop()`
 * would otherwise arm a real timer for up to the full `drainTimeoutMs` (30s by default) and never
 * clear it once the drain finished some other way. */
function raceWithTimeout(promises: Iterable<Promise<unknown>>, ms: number): Promise<void> {
	return new Promise<void>((resolve) => {
		const timer = setTimeout(resolve, Math.max(0, ms));
		Promise.allSettled(promises).then(() => {
			clearTimeout(timer);
			resolve();
		});
	});
}

async function safeCall<Args extends readonly unknown[]>(
	fn: ((...args: Args) => unknown) | undefined,
	...args: Args
): Promise<void> {
	try {
		await fn?.(...args);
	} catch {
		// user hooks are observational by default.
	}
}

function unrefTimer(timer: ReturnType<typeof setTimeout>): void {
	// `setTimeout` returns a `Timeout` (with `.unref()`) on Node, a plain number in browsers/edge.
	if (typeof timer === "object" && timer !== null && "unref" in timer) {
		(timer as { unref: () => void }).unref();
	}
}

export {
	CronExpressionError,
	CronJobExistsError,
	CronJobNotFoundError,
	CronStoppedError,
	CronTimeoutError,
};
