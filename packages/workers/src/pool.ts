import { availableParallelism } from "node:os";
import { type Transferable, Worker, type WorkerOptions } from "node:worker_threads";
import {
	PoolClosedError,
	QueueFullError,
	TaskTimeoutError,
	UnknownTaskError,
	WorkerCrashError,
} from "./errors.js";
import { type ErrMessage, isPoolMessage, type OkMessage, type RunMessage } from "./protocol.js";
import type {
	AnyTasks,
	RunArgs,
	RunOptions,
	TaskDefinitions,
	TaskName,
	TaskResult,
} from "./types.js";

/** options forwarded to each `new Worker()` the pool spawns. */
export interface PoolWorkerOptions {
	/** value exposed in the worker as `workerData` (structured-cloned once at spawn). */
	workerData?: unknown;
	/** v8 memory limits per worker — a worker that exceeds them crashes alone and is respawned. */
	resourceLimits?: WorkerOptions["resourceLimits"];
	env?: WorkerOptions["env"];
	execArgv?: string[];
	argv?: unknown[];
	name?: string;
}

export interface PoolOptions {
	/** worker threads to spawn: an integer ≥ 1, or "auto" (`availableParallelism() - 1`, min 1). @default 1 */
	size?: number | "auto";
	/** tasks a single worker runs at once — keep 1 for CPU-bound work, raise for I/O-ish tasks. @default 1 */
	concurrency?: number;
	/** max tasks waiting for a worker before run() rejects with QueueFullError. @default Infinity */
	maxQueue?: number;
	/** default execution timeout in ms per task, measured from dispatch. overridable per run(). @default none */
	timeout?: number;
	/** grace period in ms after an abort/timeout for the task to settle before its worker is killed. @default 500 */
	killTimeout?: number;
	/** consecutive times a worker may die without ever signalling ready before its slot is declared dead. @default 5 */
	maxRestarts?: number;
	/** respawn delay in ms after the n-th consecutive crash (n starts at 1). @default 0, then 200·2ⁿ capped at 10s */
	backoff?: (consecutiveCrashes: number) => number;
	/** options passed through to each `new Worker()`. */
	worker?: PoolWorkerOptions;
}

export interface PoolStats {
	/** worker threads the pool was created with. */
	size: number;
	/** workers alive and ready to take tasks. */
	ready: number;
	/** workers currently running at least one task. */
	busy: number;
	/** slots that ran out of restarts and were abandoned. */
	dead: number;
	/** tasks waiting for a free worker. */
	queued: number;
	/** tasks currently running. */
	running: number;
	/** tasks resolved successfully over the pool's lifetime. */
	completed: number;
	/** admitted tasks that rejected (task errors, timeouts, aborts, crashes) over the pool's lifetime. */
	failed: number;
	/** workers respawned after a crash or kill. */
	restarts: number;
}

export interface PoolEvents {
	"worker:ready": { worker: number };
	"worker:crash": {
		worker: number;
		error: unknown;
		code: number | null;
		/** consecutive deaths of this slot without reaching ready. */
		consecutive: number;
		willRespawn: boolean;
		/** backoff delay before the respawn, in ms. */
		delay: number;
	};
}

export interface CloseOptions {
	/** ms to wait for queued + running tasks to finish before force-destroying. @default wait forever */
	timeout?: number;
}

export interface Pool<Tasks extends TaskDefinitions = AnyTasks> {
	/** run a registered task on the least-busy ready worker; queues when all are busy. */
	run<Name extends TaskName<Tasks>>(
		name: Name,
		...args: RunArgs<Tasks[Name]>
	): Promise<TaskResult<Tasks[Name]>>;
	/** resolves once every worker signalled ready; rejects if the pool dies (or is destroyed) first. */
	ready(): Promise<void>;
	/** stop accepting tasks, let queued + running ones finish, then terminate the workers. */
	close(options?: CloseOptions): Promise<void>;
	/** terminate all workers immediately and reject everything queued or in flight. */
	destroy(): Promise<void>;
	/** a point-in-time snapshot of queue depth, worker states and lifetime counters. */
	stats(): PoolStats;
	/** subscribe to pool events; returns an unsubscribe function. */
	on<E extends keyof PoolEvents>(event: E, listener: (info: PoolEvents[E]) => void): () => void;
	/** number of worker threads. */
	readonly size: number;
	/** `await using pool = createPool(…)` — destroys the pool when the scope exits. */
	[Symbol.asyncDispose](): Promise<void>;
}

interface Task {
	id: number;
	name: string;
	arg: unknown;
	transfer: readonly Transferable[] | undefined;
	resolve: (value: unknown) => void;
	reject: (error: unknown) => void;
	timeoutMs: number | undefined;
	state: "queued" | "running" | "done";
	/** promise already settled (abort/timeout) but the worker is still chewing on it. */
	zombie: boolean;
	timer?: NodeJS.Timeout;
	killTimer?: NodeJS.Timeout;
	removeAbort?: () => void;
}

interface Slot {
	readonly index: number;
	worker: Worker;
	ready: boolean;
	everReady: boolean;
	exited: boolean;
	/** we terminated it on purpose (kill after timeout/abort, messageerror) — not a crash. */
	expectTerminate: boolean;
	dead: boolean;
	/** consecutive deaths without reaching ready. */
	crashes: number;
	lastError: unknown;
	running: Map<number, Task>;
	respawnTimer?: NodeJS.Timeout;
}

const defaultBackoff = (consecutiveCrashes: number): number =>
	consecutiveCrashes <= 1 ? 0 : Math.min(100 * 2 ** (consecutiveCrashes - 1), 10_000);

function resolveSize(size: PoolOptions["size"]): number {
	if (size === undefined) return 1;
	if (size === "auto") return Math.max(1, availableParallelism() - 1);
	if (!Number.isInteger(size) || size < 1) {
		throw new TypeError(`createPool: size must be an integer >= 1 or "auto", got ${String(size)}`);
	}
	return size;
}

function positiveInt(value: number | undefined, fallback: number, label: string): number {
	if (value === undefined) return fallback;
	if (value === Number.POSITIVE_INFINITY) return value;
	if (!Number.isInteger(value) || value < 0) {
		throw new TypeError(
			`createPool: ${label} must be a non-negative integer, got ${String(value)}`,
		);
	}
	return value;
}

function normalizeTimeout(value: number | undefined, label: string): number | undefined {
	if (value === undefined || value === Number.POSITIVE_INFINITY) return undefined;
	if (typeof value !== "number" || Number.isNaN(value) || value < 0) {
		throw new TypeError(`${label} must be a non-negative number of ms, got ${String(value)}`);
	}
	return value;
}

/** create a pool of workers from `workerFile` (a built .js path or file URL). */
export function createPool<Tasks extends TaskDefinitions = AnyTasks>(
	workerFile: string | URL,
	options: PoolOptions = {},
): Pool<Tasks> {
	const size = resolveSize(options.size);
	const concurrency = Math.max(1, positiveInt(options.concurrency, 1, "concurrency"));
	const maxQueue = positiveInt(options.maxQueue, Number.POSITIVE_INFINITY, "maxQueue");
	const defaultTimeout = normalizeTimeout(options.timeout, "createPool: timeout");
	const killTimeout = normalizeTimeout(options.killTimeout, "createPool: killTimeout") ?? 500;
	const maxRestarts = positiveInt(options.maxRestarts, 5, "maxRestarts");
	const backoff = options.backoff ?? defaultBackoff;
	const workerOptions = options.worker;

	const slots: Slot[] = [];
	let queue: (Task | undefined)[] = [];
	let head = 0;
	let queuedCount = 0;

	let seq = 0;
	let deadCount = 0;
	let completed = 0;
	let failed = 0;
	let restarts = 0;
	let taskNames: Set<string> | undefined;

	let closing = false;
	let destroyed = false;
	let destroyPromise: Promise<void> | undefined;
	let closePromise: Promise<void> | undefined;
	let closeDone = false;
	let resolveClose: (() => void) | undefined;
	let closeTimer: NodeJS.Timeout | undefined;

	let readySettled = false;
	let resolveReady!: () => void;
	let rejectReadyFn!: (error: unknown) => void;
	const readyPromise = new Promise<void>((resolve, reject) => {
		resolveReady = resolve;
		rejectReadyFn = reject;
	});
	readyPromise.catch(() => {}); // pool failure must not be an unhandled rejection when ready() is never awaited

	const listeners = new Map<keyof PoolEvents, Set<(info: never) => void>>();

	const emit = <E extends keyof PoolEvents>(event: E, info: PoolEvents[E]): void => {
		const set = listeners.get(event);
		if (!set) return;
		for (const listener of [...set]) {
			try {
				(listener as (i: PoolEvents[E]) => void)(info);
			} catch (error) {
				// a broken listener must not corrupt pool internals — surface it out of band
				queueMicrotask(() => {
					throw error;
				});
			}
		}
	};

	const rejectReady = (error: unknown): void => {
		if (readySettled) return;
		readySettled = true;
		rejectReadyFn(error);
	};

	const maybeResolveReady = (): void => {
		if (readySettled) return;
		if (slots.every((slot) => slot.everReady)) {
			readySettled = true;
			resolveReady();
		}
	};

	/** drop timers and abort listeners; the promise itself is settled by the caller. */
	const cleanupTask = (task: Task): void => {
		if (task.timer) clearTimeout(task.timer);
		if (task.killTimer) clearTimeout(task.killTimer);
		task.timer = undefined;
		task.killTimer = undefined;
		task.removeAbort?.();
		task.removeAbort = undefined;
	};

	const rejectTask = (task: Task, error: unknown): void => {
		cleanupTask(task);
		task.state = "done";
		failed++;
		task.reject(error);
	};

	const dequeue = (): Task | undefined => {
		while (head < queue.length) {
			const task = queue[head];
			queue[head] = undefined;
			head++;
			if (head > 1024 && head * 2 >= queue.length) {
				queue = queue.slice(head);
				head = 0;
			}
			if (task && task.state === "queued") return task;
		}
		queue = [];
		head = 0;
		return undefined;
	};

	const pickSlot = (): Slot | undefined => {
		let best: Slot | undefined;
		for (const slot of slots) {
			if (slot.dead || slot.exited || !slot.ready) continue;
			if (slot.running.size >= concurrency) continue;
			if (!best || slot.running.size < best.running.size) best = slot;
			if (best.running.size === 0) break;
		}
		return best;
	};

	const dispatch = (slot: Slot, task: Task): void => {
		task.state = "running";
		slot.running.set(task.id, task);

		try {
			slot.worker.postMessage(
				{ yw: "run", id: task.id, name: task.name, arg: task.arg } satisfies RunMessage,
				(task.transfer ?? []) as Transferable[],
			);
		} catch (error) {
			// unclonable arg — fail this task only, the worker never saw it
			slot.running.delete(task.id);
			rejectTask(task, error);
			return;
		}

		task.arg = undefined; // free the reference — the worker owns the payload now
		if (task.timeoutMs !== undefined) {
			task.timer = setTimeout(() => {
				abortRunning(task, new TaskTimeoutError(task.name, task.timeoutMs ?? 0));
			}, task.timeoutMs);
		}
	};

	const pump = (): void => {
		while (queuedCount > 0) {
			const slot = pickSlot();
			if (!slot) return;
			const task = dequeue();
			if (!task) return;
			queuedCount--;
			dispatch(slot, task);
		}
	};

	/** reject the promise now, ask the worker to stop, kill the worker if it doesn't. */
	const abortRunning = (task: Task, reason: unknown): void => {
		if (task.state !== "running" || task.zombie) return;
		const slot = slots.find((s) => s.running.has(task.id));
		if (!slot) return;

		const worker = slot.worker;
		task.zombie = true;
		cleanupTask(task);
		task.state = "done";
		failed++;
		task.reject(reason);

		try {
			worker.postMessage({ yw: "abort", id: task.id });
		} catch {
			// worker already gone — its exit handler cleans up
		}

		task.killTimer = setTimeout(() => {
			task.killTimer = undefined;
			if (slot.worker === worker && !slot.exited) {
				slot.expectTerminate = true;
				void worker.terminate();
			}
		}, killTimeout);
	};

	const onAbortSignal = (task: Task, reason: unknown): void => {
		if (task.state === "done") return;
		if (task.state === "queued") {
			queuedCount--;
			rejectTask(task, reason);
			return;
		}
		abortRunning(task, reason);
	};

	const reviveError = (msg: ErrMessage): unknown => {
		const { name, message, stack } = msg.error;
		if (msg.code === "UNKNOWN_TASK") return new UnknownTaskError(message);
		const error = new Error(message);
		if (name) error.name = name;
		if (stack) error.stack = stack;
		return error;
	};

	const onMessage = (slot: Slot, worker: Worker, raw: unknown): void => {
		if (slot.worker !== worker || destroyed) return;
		if (!isPoolMessage(raw)) return;

		if (raw.yw === "ready") {
			slot.ready = true;
			slot.everReady = true;
			slot.crashes = 0;
			taskNames ??= new Set((raw as { tasks?: string[] }).tasks ?? []);
			emit("worker:ready", { worker: slot.index });
			maybeResolveReady();
			pump();
			return;
		}

		if (raw.yw !== "ok" && raw.yw !== "err") return;
		const msg = raw as unknown as OkMessage | ErrMessage;
		const task = slot.running.get(msg.id);
		if (!task) return;
		slot.running.delete(msg.id);
		cleanupTask(task);

		if (task.zombie) {
			// worker settled after an abort/timeout — cooperative cancel worked, keep the worker
			pump();
			checkCloseDone();
			return;
		}

		task.state = "done";
		if (msg.yw === "ok") {
			completed++;
			task.resolve(msg.result);
		} else {
			failed++;
			task.reject(reviveError(msg));
		}
		pump();
		checkCloseDone();
	};

	const failAllQueued = (error: unknown): void => {
		for (let task = dequeue(); task !== undefined; task = dequeue()) {
			queuedCount--;
			rejectTask(task, error);
		}
	};

	const onExit = (slot: Slot, worker: Worker, code: number): void => {
		if (destroyed || slot.worker !== worker) return;

		slot.exited = true;
		slot.ready = false;

		const crashError = new WorkerCrashError(
			`worker ${slot.index} exited with code ${code} while ${slot.running.size} task(s) were running`,
			{ code, cause: slot.lastError },
		);
		for (const task of slot.running.values()) {
			cleanupTask(task);
			if (!task.zombie) rejectTask(task, crashError);
		}
		slot.running.clear();

		if (closing) {
			checkCloseDone();
			return;
		}

		if (slot.expectTerminate) {
			// we killed it (hung task / poisoned message) — respawn right away, not a crash
			slot.expectTerminate = false;
			restarts++;
			emit("worker:crash", {
				worker: slot.index,
				error: slot.lastError ?? crashError,
				code,
				consecutive: 0,
				willRespawn: true,
				delay: 0,
			});
			slot.lastError = undefined;
			spawn(slot);
			return;
		}

		slot.crashes += 1; // reset to 0 whenever the worker reaches ready — this counts a consecutive streak
		const willRespawn = slot.crashes <= maxRestarts;
		const delay = willRespawn ? Math.max(0, backoff(slot.crashes)) : 0;

		emit("worker:crash", {
			worker: slot.index,
			error: slot.lastError ?? crashError,
			code,
			consecutive: slot.crashes,
			willRespawn,
			delay,
		});
		slot.lastError = undefined;

		if (!willRespawn) {
			slot.dead = true;
			deadCount++;
			if (deadCount === size) {
				const dead = new WorkerCrashError("all workers are dead — the pool cannot run tasks", {
					code,
					cause: crashError.cause,
				});
				rejectReady(dead);
				failAllQueued(dead);
			}
			return;
		}

		restarts++;
		if (delay === 0) {
			spawn(slot);
		} else {
			slot.respawnTimer = setTimeout(() => {
				slot.respawnTimer = undefined;
				if (!destroyed && !closing) spawn(slot);
			}, delay);
		}
	};

	const spawn = (slot: Slot): void => {
		const worker = new Worker(workerFile, workerOptions as WorkerOptions | undefined);
		slot.worker = worker;
		slot.ready = false;
		slot.exited = false;
		slot.expectTerminate = false;
		slot.lastError = undefined;

		worker.on("message", (raw) => onMessage(slot, worker, raw));
		worker.on("error", (error) => {
			// an uncaught exception terminates the worker; "exit" follows and does the accounting
			if (slot.worker === worker) slot.lastError = error;
		});
		worker.on("messageerror", (error) => {
			// a response we cannot deserialize — we can't tell which task it answers, so recycle the worker
			if (slot.worker !== worker || destroyed) return;
			slot.lastError = error;
			slot.expectTerminate = true;
			void worker.terminate();
		});
		worker.on("exit", (code) => onExit(slot, worker, code));
	};

	const checkCloseDone = (): void => {
		if (!closing || closeDone || destroyed) return;

		if (queuedCount > 0) {
			if (slots.some((slot) => !slot.exited && !slot.dead)) return; // workers alive, keep draining
			failAllQueued(
				new WorkerCrashError("all workers died while the pool was draining", { code: null }),
			);
		}

		const running = slots.reduce((n, slot) => n + slot.running.size, 0);
		if (running > 0) return;

		closeDone = true;
		if (closeTimer) clearTimeout(closeTimer);
		void Promise.all(slots.map((slot) => slot.worker.terminate())).then(() => resolveClose?.());
	};

	const destroyInternal = (reason: PoolClosedError): Promise<void> => {
		if (destroyPromise) return destroyPromise;
		destroyed = true;

		failAllQueued(reason);
		for (const slot of slots) {
			if (slot.respawnTimer) clearTimeout(slot.respawnTimer);
			slot.respawnTimer = undefined;
			for (const task of slot.running.values()) {
				cleanupTask(task);
				if (!task.zombie) rejectTask(task, reason);
			}
			slot.running.clear();
		}
		rejectReady(reason);
		if (closeTimer) clearTimeout(closeTimer);

		destroyPromise = Promise.all(slots.map((slot) => slot.worker.terminate())).then(() => {
			resolveClose?.(); // anyone awaiting close() must not hang
		});
		return destroyPromise;
	};

	for (let index = 0; index < size; index++) {
		const slot: Slot = {
			index,
			worker: undefined as unknown as Worker, // assigned by spawn() on the next line
			ready: false,
			everReady: false,
			exited: false,
			expectTerminate: false,
			dead: false,
			crashes: 0,
			lastError: undefined,
			running: new Map(),
		};
		slots.push(slot);
		spawn(slot);
	}

	const pool: Pool<Tasks> = {
		size,

		run<Name extends TaskName<Tasks>>(
			name: Name,
			...args: RunArgs<Tasks[Name]>
		): Promise<TaskResult<Tasks[Name]>> {
			const [arg, runOptions] = args as [unknown, RunOptions | undefined];

			if (Array.isArray(runOptions)) {
				return Promise.reject(
					new TypeError(
						"run(name, arg, [...transfer]) was removed — pass options: run(name, arg, { transfer: [...] })",
					),
				);
			}
			if (destroyed || closing) {
				return Promise.reject(new PoolClosedError("pool is closed"));
			}
			if (deadCount === size) {
				return Promise.reject(
					new WorkerCrashError("all workers are dead — the pool cannot run tasks", { code: null }),
				);
			}
			if (taskNames && !taskNames.has(name)) {
				const known = [...taskNames].join(", ") || "(none)";
				return Promise.reject(
					new UnknownTaskError(`unknown task "${name}" — registered: ${known}`, name),
				);
			}

			const signal = runOptions?.signal;
			if (signal?.aborted) return Promise.reject(signal.reason);

			let timeoutMs: number | undefined;
			try {
				timeoutMs = normalizeTimeout(runOptions?.timeout, "run: timeout") ?? defaultTimeout;
			} catch (error) {
				return Promise.reject(error);
			}

			if (queuedCount >= maxQueue && !pickSlot()) {
				return Promise.reject(new QueueFullError(queuedCount));
			}

			const id = seq++;
			return new Promise<TaskResult<Tasks[Name]>>((resolve, reject) => {
				const task: Task = {
					id,
					name,
					arg,
					transfer: runOptions?.transfer,
					resolve: resolve as (value: unknown) => void,
					reject,
					timeoutMs,
					state: "queued",
					zombie: false,
				};

				if (signal) {
					const onAbort = () => onAbortSignal(task, signal.reason);
					signal.addEventListener("abort", onAbort, { once: true });
					task.removeAbort = () => signal.removeEventListener("abort", onAbort);
				}

				queue.push(task);
				queuedCount++;
				pump();
			});
		},

		ready(): Promise<void> {
			return readyPromise;
		},

		close(closeOptions?: CloseOptions): Promise<void> {
			if (destroyed) return destroyPromise ?? Promise.resolve();
			if (closePromise) return closePromise;

			closing = true;
			closePromise = new Promise<void>((resolve) => {
				resolveClose = resolve;
			});

			const timeout = normalizeTimeout(closeOptions?.timeout, "close: timeout");
			if (timeout !== undefined) {
				closeTimer = setTimeout(() => {
					void destroyInternal(new PoolClosedError(`close(): drain timed out after ${timeout}ms`));
				}, timeout);
			}

			checkCloseDone();
			return closePromise;
		},

		destroy(): Promise<void> {
			return destroyInternal(new PoolClosedError("pool is destroyed"));
		},

		stats(): PoolStats {
			let ready = 0;
			let busy = 0;
			let running = 0;
			for (const slot of slots) {
				if (slot.ready && !slot.exited && !slot.dead) ready++;
				if (slot.running.size > 0) busy++;
				running += slot.running.size;
			}
			return {
				size,
				ready,
				busy,
				dead: deadCount,
				queued: queuedCount,
				running,
				completed,
				failed,
				restarts,
			};
		},

		on<E extends keyof PoolEvents>(event: E, listener: (info: PoolEvents[E]) => void): () => void {
			let set = listeners.get(event);
			if (!set) {
				set = new Set();
				listeners.set(event, set);
			}
			set.add(listener as (info: never) => void);
			return () => set.delete(listener as (info: never) => void);
		},

		async [Symbol.asyncDispose](): Promise<void> {
			await destroyInternal(new PoolClosedError("pool is destroyed"));
		},
	};

	return pool;
}
