import type { Transferable } from "node:worker_threads";

/**
 * a task function: at most one (structured-clonable) argument in, a result out. need several
 * values? pass a tuple or an object — one argument keeps the wire format obvious.
 */
export type TaskFn = (arg: never) => unknown;

/** the task map shared between `register()` (worker side) and `createPool()` (main side). */
export type TaskDefinitions = Record<string, TaskFn>;

/** fallback task map when no `Tasks` type is supplied — everything is `unknown`. */
export type AnyTasks = Record<string, (arg?: unknown) => unknown>;

export type Awaitable<T> = T | Promise<T>;
export type TaskName<Tasks> = Extract<keyof Tasks, string>;

export type TaskArg<Fn> = Fn extends (...args: infer Args extends unknown[]) => unknown
	? Args extends []
		? undefined
		: Args[0]
	: never;

export type TaskResult<Fn> = Fn extends (...args: never[]) => infer Result
	? Awaited<Result>
	: never;

/** second argument every task handler receives. */
export interface TaskContext {
	/**
	 * fires when the main thread aborts or times out this task. settle (reject) promptly and the
	 * worker survives; ignore it and the worker is terminated after the pool's `killTimeout`.
	 */
	signal: AbortSignal;
}

/** the implementation map `register()` takes: per task, `(arg, { signal }) => result`. */
export type TaskHandlers<Tasks extends TaskDefinitions = AnyTasks> = {
	[Name in TaskName<Tasks>]: (
		arg: TaskArg<Tasks[Name]>,
		context: TaskContext,
	) => Awaitable<TaskResult<Tasks[Name]>>;
};

/** per-call options for `pool.run()`. */
export interface RunOptions {
	/** transferables inside `arg` that should move (zero-copy) to the worker instead of being cloned. */
	transfer?: readonly Transferable[];
	/** aborts the task: dequeued if still waiting, cancelled (then killed) if already running. */
	signal?: AbortSignal;
	/** execution timeout in ms for this call, overriding the pool-level `timeout`. */
	timeout?: number;
}

export type RunArgs<Fn> =
	undefined extends TaskArg<Fn>
		? [arg?: TaskArg<Fn>, options?: RunOptions]
		: [arg: TaskArg<Fn>, options?: RunOptions];
