import type { Bot, BotPlugin, Context } from "@yaebal/core";

export type Awaitable<T> = T | Promise<T>;

const ALIASES: Record<string, string> = {
	"@yearly": "0 0 1 1 *",
	"@annually": "0 0 1 1 *",
	"@monthly": "0 0 1 * *",
	"@weekly": "0 0 * * 0",
	"@daily": "0 0 * * *",
	"@midnight": "0 0 * * *",
	"@hourly": "0 * * * *",
};

/** ~4 years of minutes — bounds the search for a schedule that (almost) never matches. */
const MAX_NEXT_ITERATIONS = 4 * 366 * 24 * 60;
/** just under the 32-bit signed setTimeout ceiling; longer waits are re-armed in chunks. */
const MAX_TIMER_CHUNK_MS = 2_147_483_000;

export class CronExpressionError extends Error {
	readonly expression: string;

	constructor(expression: string, reason: string) {
		super(`cron: invalid expression "${expression}": ${reason}`);
		this.name = "CronExpressionError";
		this.expression = expression;
	}
}

export class CronJobNotFoundError extends Error {
	readonly job: string;

	constructor(name: string) {
		super(`cron: job "${name}" was not found`);
		this.name = "CronJobNotFoundError";
		this.job = name;
	}
}

export class CronTimeoutError extends Error {
	readonly job: string;
	readonly timeoutMs: number;

	constructor(name: string, timeoutMs: number) {
		super(`cron: job "${name}" exceeded its ${timeoutMs}ms timeout`);
		this.name = "CronTimeoutError";
		this.job = name;
		this.timeoutMs = timeoutMs;
	}
}

export interface CronSchedule {
	readonly expression: string;
	/** first matching minute strictly after `from`, in UTC. */
	next(from: Date): Date;
	matches(date: Date): boolean;
}

/**
 * parse a 5-field cron expression (minute hour day-of-month month day-of-week) or one of the
 * `@hourly`/`@daily`/`@weekly`/`@monthly`/`@yearly`/`@midnight`/`@annually` aliases. always UTC —
 * there is no timezone field. exported as a pure function so schedules are unit-testable on their
 * own, without a running scheduler.
 */
export function parseCron(expression: string): CronSchedule {
	const trimmed = expression.trim();
	const normalized = ALIASES[trimmed] ?? trimmed;
	const fields = normalized.split(/\s+/);

	if (fields.length !== 5) {
		throw new CronExpressionError(
			expression,
			"expected 5 fields (minute hour day-of-month month day-of-week) or an @alias",
		);
	}

	const [minuteField, hourField, domField, monthField, dowField] = fields as [
		string,
		string,
		string,
		string,
		string,
	];

	const minutes = parseField(expression, minuteField, 0, 59);
	const hours = parseField(expression, hourField, 0, 23);
	const daysOfMonth = parseField(expression, domField, 1, 31);
	const months = parseField(expression, monthField, 1, 12);
	const daysOfWeek = parseField(expression, dowField, 0, 7);
	const domIsWildcard = domField === "*";
	const dowIsWildcard = dowField === "*";

	function matches(date: Date): boolean {
		if (!minutes.has(date.getUTCMinutes())) return false;
		if (!hours.has(date.getUTCHours())) return false;
		if (!months.has(date.getUTCMonth() + 1)) return false;

		const dow = date.getUTCDay();
		const domMatch = daysOfMonth.has(date.getUTCDate());
		const dowMatch = daysOfWeek.has(dow) || (dow === 0 && daysOfWeek.has(7));

		// POSIX cron quirk: when both day-of-month and day-of-week are restricted, either
		// one matching is enough. when only one is restricted, that one alone decides.
		if (domIsWildcard && dowIsWildcard) return true;
		if (domIsWildcard) return dowMatch;
		if (dowIsWildcard) return domMatch;
		return domMatch || dowMatch;
	}

	function next(from: Date): Date {
		const candidate = new Date(from.getTime());
		candidate.setUTCSeconds(0, 0);
		candidate.setUTCMinutes(candidate.getUTCMinutes() + 1);

		for (let i = 0; i < MAX_NEXT_ITERATIONS; i++) {
			if (matches(candidate)) return candidate;
			candidate.setUTCMinutes(candidate.getUTCMinutes() + 1);
		}

		throw new CronExpressionError(expression, "no matching run found within 4 years");
	}

	return { expression: trimmed, next, matches };
}

function parseField(source: string, field: string, min: number, max: number): Set<number> {
	const values = new Set<number>();

	for (const part of field.split(",")) {
		const [rangePart, stepPart] = part.split("/");
		if (!rangePart) throw new CronExpressionError(source, `invalid field "${field}"`);

		const step = stepPart !== undefined ? toInt(source, stepPart) : 1;
		if (step <= 0) throw new CronExpressionError(source, `invalid step in "${part}"`);

		let start = min;
		let end = max;

		if (rangePart !== "*") {
			const dash = rangePart.indexOf("-");
			if (dash === -1) {
				start = toInt(source, rangePart);
				end = stepPart !== undefined ? max : start;
			} else {
				start = toInt(source, rangePart.slice(0, dash));
				end = toInt(source, rangePart.slice(dash + 1));
			}
		}

		if (start < min || end > max || start > end) {
			throw new CronExpressionError(source, `"${part}" is out of range ${min}-${max}`);
		}

		for (let value = start; value <= end; value += step) values.add(value);
	}

	return values;
}

function toInt(source: string, raw: string): number {
	const value = Number(raw);
	if (!Number.isInteger(value)) throw new CronExpressionError(source, `invalid number "${raw}"`);
	return value;
}

export interface CronRunContext {
	name: string;
	/** 1-based run counter for this job, incremented on every fire (scheduled, manual, runOnStart). */
	run: number;
	scheduledFor: number;
	startedAt: number;
	/** aborts when `timeoutMs` elapses. cooperative — pass it into your own async calls to actually cancel work. */
	signal: AbortSignal;
}

export type CronTask = (ctx: CronRunContext) => Awaitable<unknown>;

export interface CronJobOptions {
	/** what to do when the previous run of this job is still in flight. defaults to "skip". */
	overlap?: "skip" | "wait";
	/** fire once immediately when the scheduler starts, in addition to the normal schedule. */
	runOnStart?: boolean;
	/** abort `ctx.signal` (cooperative) after this many ms. the scheduler stops waiting either way. */
	timeoutMs?: number;
	/** called after a run throws or times out. never blocks the scheduler. */
	onError?: (error: unknown, ctx: CronRunContext) => unknown;
}

export interface CronJobDefinition extends CronJobOptions {
	/** a 5-field cron expression / `@alias`, or a fixed interval in milliseconds. */
	schedule: string | number;
	task: CronTask;
}

export interface CronJobState {
	name: string;
	nextRunAt?: number;
	lastRunAt?: number;
	lastDurationMs?: number;
	lastError?: unknown;
	running: boolean;
	runs: number;
	failures: number;
}

export type CronEvent =
	| { type: "scheduled"; name: string; nextRunAt: number }
	| { type: "run_started"; name: string; scheduledFor: number }
	| { type: "run_completed"; name: string; durationMs: number }
	| { type: "run_failed"; name: string; error: unknown }
	| { type: "run_skipped"; name: string; reason: "overlap" }
	| { type: "run_timeout"; name: string };

export interface CronClientOptions {
	jobs?: Record<string, CronJobDefinition>;
	/** metrics/event hook. never awaited, never throws into the scheduler. */
	onEvent?: (event: CronEvent) => unknown;
	/** injected clock for tests. */
	now?: () => number;
	/** wait for in-flight runs on `stop()`. defaults to true. */
	graceful?: boolean;
	/** cap on graceful drain, in ms. defaults to 30_000. */
	drainTimeoutMs?: number;
}

export interface CronStopOptions {
	graceful?: boolean;
	drainTimeoutMs?: number;
}

interface JobEntry {
	name: string;
	schedule: CronSchedule | number;
	task: CronTask;
	overlap: "skip" | "wait";
	runOnStart: boolean;
	timeoutMs: number | undefined;
	onError: ((error: unknown, ctx: CronRunContext) => unknown) | undefined;
	timer: ReturnType<typeof setTimeout> | undefined;
	nextRunAt: number | undefined;
	lastRunAt: number | undefined;
	lastDurationMs: number | undefined;
	lastError: unknown;
	running: boolean;
	pending: boolean;
	waiters: Array<() => void>;
	runs: number;
	failures: number;
	run: number;
}

interface NormalizedOptions {
	onEvent: ((event: CronEvent) => unknown) | undefined;
	now: () => number;
	graceful: boolean;
	drainTimeoutMs: number;
}

/** declarative, typed cron scheduler. tasks are plain functions — close over `bot.api` to reach Telegram. */
export class Cron<Jobs extends string = never> {
	readonly #options: NormalizedOptions;
	readonly #jobs = new Map<string, JobEntry>();
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
		if (this.#jobs.has(name)) throw new Error(`cron: job "${name}" is already registered`);

		const entry: JobEntry = {
			name,
			schedule:
				typeof schedule === "number" ? normalizeInterval(name, schedule) : parseCron(schedule),
			task,
			overlap: options.overlap ?? "skip",
			runOnStart: options.runOnStart ?? false,
			timeoutMs: options.timeoutMs,
			onError: options.onError,
			timer: undefined,
			nextRunAt: undefined,
			lastRunAt: undefined,
			lastDurationMs: undefined,
			lastError: undefined,
			running: false,
			pending: false,
			waiters: [],
			runs: 0,
			failures: 0,
			run: 0,
		};

		this.#jobs.set(name, entry);

		if (this.#running) {
			if (entry.runOnStart) void this.#fire(entry, this.#options.now(), false);
			this.#arm(entry);
		}

		return this as unknown as Cron<Jobs | Name>;
	}

	/** arm every registered job. idempotent. */
	start(): this {
		if (this.#running) return this;
		this.#running = true;

		for (const job of this.#jobs.values()) {
			if (job.runOnStart) void this.#fire(job, this.#options.now(), false);
			this.#arm(job);
		}

		return this;
	}

	/** disarm every job. by default waits for in-flight runs to finish (see `graceful`). */
	async stop(options: CronStopOptions = {}): Promise<void> {
		this.#running = false;

		for (const job of this.#jobs.values()) {
			if (job.timer) clearTimeout(job.timer);
			job.timer = undefined;
		}

		const graceful = options.graceful ?? this.#options.graceful;
		if (!graceful) return;

		const drainTimeoutMs = options.drainTimeoutMs ?? this.#options.drainTimeoutMs;
		const deadline = this.#options.now() + drainTimeoutMs;

		while ([...this.#jobs.values()].some((job) => job.running) && this.#options.now() < deadline) {
			await sleep(10);
		}
	}

	/** run a job immediately, respecting its overlap policy. does not disturb its schedule. */
	async trigger(name: Jobs): Promise<void> {
		const job = this.#requireJob(name);
		await this.#fire(job, this.#options.now(), false);
	}

	state(name: Jobs): CronJobState | undefined {
		const job = this.#jobs.get(name);
		return job && snapshot(job);
	}

	states(): CronJobState[] {
		return [...this.#jobs.values()].map(snapshot);
	}

	#arm(job: JobEntry): void {
		if (!this.#running) return;

		const nextRunAt = this.#computeNext(job, this.#options.now());
		job.nextRunAt = nextRunAt;
		this.#emit({ type: "scheduled", name: job.name, nextRunAt });
		this.#scheduleTimer(job, nextRunAt);
	}

	#scheduleTimer(job: JobEntry, dueAt: number): void {
		if (job.timer) clearTimeout(job.timer);

		const delay = Math.min(Math.max(0, dueAt - this.#options.now()), MAX_TIMER_CHUNK_MS);
		job.timer = setTimeout(() => {
			job.timer = undefined;
			if (!this.#running) return;
			if (this.#options.now() >= dueAt) void this.#fire(job, dueAt, true);
			else this.#scheduleTimer(job, dueAt);
		}, delay);
	}

	#computeNext(job: JobEntry, from: number): number {
		if (typeof job.schedule === "number") {
			const interval = job.schedule;
			let next = (job.nextRunAt ?? from) + interval;
			while (next <= from) next += interval;
			return next;
		}

		return job.schedule.next(new Date(from)).getTime();
	}

	async #fire(job: JobEntry, scheduledFor: number, rearmOnSkip: boolean): Promise<void> {
		if (job.running) {
			if (job.overlap === "wait") {
				job.pending = true;
				return new Promise<void>((resolve) => {
					job.waiters.push(resolve);
				});
			}

			this.#emit({ type: "run_skipped", name: job.name, reason: "overlap" });
			if (rearmOnSkip) this.#arm(job);
			return;
		}

		job.running = true;
		const run = ++job.run;
		const startedAt = this.#options.now();
		const controller = new AbortController();
		const timeoutMs = job.timeoutMs;
		const timer =
			timeoutMs !== undefined
				? setTimeout(() => {
						controller.abort(new CronTimeoutError(job.name, timeoutMs));
						this.#emit({ type: "run_timeout", name: job.name });
					}, timeoutMs)
				: undefined;

		const ctx: CronRunContext = {
			name: job.name,
			run,
			scheduledFor,
			startedAt,
			signal: controller.signal,
		};
		this.#emit({ type: "run_started", name: job.name, scheduledFor });

		try {
			await job.task(ctx);
			this.#emit({
				type: "run_completed",
				name: job.name,
				durationMs: this.#options.now() - startedAt,
			});
		} catch (error) {
			job.failures++;
			job.lastError = error;
			this.#emit({ type: "run_failed", name: job.name, error });
			await safeCall(job.onError, error, ctx);
		} finally {
			if (timer) clearTimeout(timer);
			job.running = false;
			job.runs++;
			job.lastRunAt = startedAt;
			job.lastDurationMs = this.#options.now() - startedAt;

			if (job.pending) {
				job.pending = false;
				const waiters = job.waiters;
				job.waiters = [];
				void this.#fire(job, this.#options.now(), false).then(() => {
					for (const resolve of waiters) resolve();
				});
			} else if (this.#running) {
				this.#arm(job);
			}
		}
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
		nextRunAt: job.nextRunAt,
		lastRunAt: job.lastRunAt,
		lastDurationMs: job.lastDurationMs,
		lastError: job.lastError,
		running: job.running,
		runs: job.runs,
		failures: job.failures,
	};
}

function normalizeInterval(name: string, ms: number): number {
	if (!Number.isFinite(ms) || ms <= 0) {
		throw new RangeError(`cron: job "${name}" has an invalid interval (${ms}ms) — must be > 0`);
	}
	return ms;
}

function normalizeOptions(options: CronClientOptions): NormalizedOptions {
	return {
		onEvent: options.onEvent,
		now: options.now ?? (() => Date.now()),
		graceful: options.graceful ?? true,
		drainTimeoutMs: Math.max(0, options.drainTimeoutMs ?? 30_000),
	};
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
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

/** create a standalone scheduler, independent of any bot — call `.start()`/`.stop()` yourself. */
export function createCron<Jobs extends string = never>(
	options: CronClientOptions = {},
): Cron<Jobs> {
	return new Cron<Jobs>(options);
}

export interface CronPlugin<Jobs extends string = string> extends BotPlugin {
	readonly handle: Cron<Jobs>;
}

/**
 * create an installable bot plugin: `bot.install(cron({ jobs: { ... } }))`. wires the scheduler to
 * `bot.onStart`/`bot.onStop` — jobs arm once the bot starts polling, and `bot.stop()` won't resolve
 * until in-flight runs drain (see `graceful`/`drainTimeoutMs`). for webhook/serverless deployments,
 * where `bot.onStart`/`onStop` never fire, use {@link createCron} and call `start()`/`stop()` yourself.
 */
export function cron<const J extends Record<string, CronJobDefinition> = Record<never, never>>(
	options: Omit<CronClientOptions, "jobs"> & { jobs?: J } = {},
): CronPlugin<Extract<keyof J, string>> {
	const handle = new Cron<Extract<keyof J, string>>(options as CronClientOptions);

	const install = (bot: Bot<Context>): Bot<Context> => {
		bot.onStart(() => {
			handle.start();
		});
		bot.onStop(() => handle.stop());
		return bot;
	};

	const plugin = install as unknown as CronPlugin<Extract<keyof J, string>>;
	Object.defineProperty(plugin, "handle", { value: handle, enumerable: true });

	return plugin;
}
