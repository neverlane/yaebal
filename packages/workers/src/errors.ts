/** base class of every error produced by the pool itself — task errors are rethrown as-is. */
export class PoolError extends Error {
	override name = "PoolError";
}

/** run() after close()/destroy(), or a task rejected because the pool shut down under it. */
export class PoolClosedError extends PoolError {
	override name = "PoolClosedError";
}

/** run() while `maxQueue` tasks are already waiting. */
export class QueueFullError extends PoolError {
	override name = "QueueFullError";

	constructor(readonly queued: number) {
		super(`queue is full (${queued} task(s) waiting) — raise maxQueue or add workers`);
	}
}

/** the task ran past its `timeout` — the promise rejects and the worker is asked to stop (then killed). */
export class TaskTimeoutError extends PoolError {
	override name = "TaskTimeoutError";

	constructor(
		readonly taskName: string,
		readonly timeout: number,
	) {
		super(`task "${taskName}" timed out after ${timeout}ms`);
	}
}

/** the task name isn't in the worker's register() map. */
export class UnknownTaskError extends PoolError {
	override name = "UnknownTaskError";

	constructor(
		message: string,
		readonly taskName?: string,
	) {
		super(message);
	}
}

/**
 * the worker died (crashed, was killed after a timeout/abort, or hit resourceLimits) while the
 * task was running — or the whole pool ran out of restarts. `cause` carries the worker's own
 * error when there was one.
 */
export class WorkerCrashError extends PoolError {
	override name = "WorkerCrashError";

	constructor(message: string, options: { code?: number | null; cause?: unknown } = {}) {
		super(message, options.cause === undefined ? undefined : { cause: options.cause });
		this.code = options.code ?? null;
	}

	/** the worker's exit code, when it exited (null if unknown). */
	readonly code: number | null;
}
