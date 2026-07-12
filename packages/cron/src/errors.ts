/** thrown by `parseCron` for a malformed 5/6-field expression, an unrecognized `@alias`, or a
 * schedule that can never match (e.g. `0 0 31 2 *`) — and for an unrecognized IANA `tz` name. */
export class CronExpressionError extends Error {
	readonly expression: string;

	constructor(expression: string, reason: string) {
		super(`cron: invalid expression "${expression}": ${reason}`);
		this.name = "CronExpressionError";
		this.expression = expression;
	}
}

/** thrown by `trigger()`/`state()`/`remove()`/… for a job name that was never registered. */
export class CronJobNotFoundError extends Error {
	readonly job: string;

	constructor(name: string) {
		super(`cron: job "${name}" was not found`);
		this.name = "CronJobNotFoundError";
		this.job = name;
	}
}

/** thrown by `job()` when a name is registered twice on the same scheduler. */
export class CronJobExistsError extends Error {
	readonly job: string;

	constructor(name: string) {
		super(`cron: job "${name}" is already registered`);
		this.name = "CronJobExistsError";
		this.job = name;
	}
}

/** the error a run fails with when it's still going past its `timeoutMs`. `ctx.signal` aborts
 * with this same error, so a cooperative task's catch block sees a typed reason. */
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

/** the reason `ctx.signal` aborts an in-flight run when `stop()`'s drain window elapses (or
 * immediately, for a non-graceful `stop()`). cooperative, like a timeout — pass `ctx.signal`
 * into your own calls to actually cancel work. */
export class CronStoppedError extends Error {
	readonly job: string;

	constructor(name: string) {
		super(`cron: scheduler stopped while job "${name}" was still running`);
		this.name = "CronStoppedError";
		this.job = name;
	}
}
