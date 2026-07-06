import { parentPort, type Transferable, Worker } from "node:worker_threads";

/**
 * @yaebal/workers — a small worker_threads pool. keep the bot on the main event
 * loop (already concurrent via @yaebal/runner) and offload only the CPU-heavy
 * bits to threads:
 *
 *   // tasks.ts (runs in a worker)
 *   import { register } from "@yaebal/workers";
 *   type Tasks = { resize: (buf: Buffer) => Promise<Buffer> };
 *   register<Tasks>({ resize: (buf) => sharp(buf).resize(100).toBuffer() });
 *
 *   // bot
 *   const pool = createPool<Tasks>(new URL("./tasks.js", import.meta.url), { size: 4 });
 *   bot.on("message:photo", async (ctx) => {
 *     const thumb = await pool.run("resize", await ctx.download());
 *     await ctx.sendPhoto(media.buffer(thumb));
 *   });
 */

interface Request {
	id: number;
	name: string;
	arg: unknown;
}

interface Response {
	id: number;
	ok: boolean;
	result?: unknown;
	error?: string;
}

type Awaitable<T> = T | Promise<T>;
type TaskFn = (...args: never[]) => unknown;
type AnyTasks = Record<string, (arg?: unknown) => unknown>;
type TaskName<Tasks> = Extract<keyof Tasks, string>;
type TaskArg<Fn> = Fn extends (...args: infer Args) => unknown
	? Args extends []
		? undefined
		: Args[0]
	: never;
type TaskResult<Fn> = Fn extends (...args: never[]) => infer Result ? Awaited<Result> : never;
type RunArgs<Fn> =
	undefined extends TaskArg<Fn>
		? [arg?: TaskArg<Fn>, transfer?: readonly Transferable[]]
		: [arg: TaskArg<Fn>, transfer?: readonly Transferable[]];

export type TaskDefinitions = Record<string, TaskFn>;
export type TaskHandlers<Tasks extends TaskDefinitions = AnyTasks> = {
	[Name in TaskName<Tasks>]: (arg: TaskArg<Tasks[Name]>) => Awaitable<TaskResult<Tasks[Name]>>;
};

/** call inside a worker file: handle each task the pool sends and reply with the result. */
export function register<Tasks extends TaskDefinitions = AnyTasks>(
	handlers: TaskHandlers<Tasks>,
): void {
	if (!parentPort) throw new Error("register() must be called inside a worker thread");

	const port = parentPort;
	const handlersByName = handlers as Record<string, (arg: unknown) => Awaitable<unknown>>;

	port.on("message", async (msg: Request) => {
		try {
			const fn = handlersByName[msg.name];
			if (!fn) throw new Error(`unknown task: ${msg.name}`);

			const result = await fn(msg.arg);
			port.postMessage({ id: msg.id, ok: true, result } satisfies Response);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			port.postMessage({ id: msg.id, ok: false, error: message } satisfies Response);
		}
	});
}

export interface PoolOptions {
	/** number of worker threads. defaults to 1. */
	size?: number;
}

export interface Pool<Tasks extends TaskDefinitions = AnyTasks> {
	/** run a registered task on the next worker (round-robin). */
	run<Name extends TaskName<Tasks>>(
		name: Name,
		...args: RunArgs<Tasks[Name]>
	): Promise<TaskResult<Tasks[Name]>>;
	/** terminate all workers and reject anything still in flight. */
	destroy(): Promise<void>;
	/** number of worker threads. */
	readonly size: number;
}

interface Pending {
	resolve: (value: unknown) => void;
	reject: (error: unknown) => void;
	worker: Worker;
}

/** create a pool of `size` workers from `workerFile` (a built .js path or file URL). */
export function createPool<Tasks extends TaskDefinitions = AnyTasks>(
	workerFile: string | URL,
	options: PoolOptions = {},
): Pool<Tasks> {
	const size = Math.max(1, options.size ?? 1);
	const workers: Worker[] = [];
	const inflight = new Map<number, Pending>();

	let seq = 0;
	let next = 0;
	let destroyed = false;

	const failWorker = (worker: Worker, error: unknown) => {
		for (const [id, p] of inflight) {
			if (p.worker === worker) {
				inflight.delete(id);
				p.reject(error);
			}
		}
	};

	const spawn = (slot: number): Worker => {
		const worker = new Worker(workerFile);

		worker.on("message", (msg: Response) => {
			const pending = inflight.get(msg.id);
			if (!pending) return;

			inflight.delete(msg.id);

			if (msg.ok) pending.resolve(msg.result);
			else pending.reject(new Error(msg.error ?? "task failed"));
		});

		worker.on("error", (error) => {
			failWorker(worker, error);
			if (!destroyed) workers[slot] = spawn(slot);
		});

		worker.on("exit", (code) => {
			if (destroyed) return;

			failWorker(worker, new Error(`worker exited (code ${code})`));
			workers[slot] = spawn(slot);
		});

		return worker;
	};

	for (let i = 0; i < size; i++) workers.push(spawn(i));

	return {
		size,
		run<Name extends TaskName<Tasks>>(
			name: Name,
			...args: RunArgs<Tasks[Name]>
		): Promise<TaskResult<Tasks[Name]>> {
			if (destroyed) return Promise.reject(new Error("pool is destroyed"));

			const [arg, transfer] = args;
			const worker = workers[next];
			next = (next + 1) % workers.length;

			if (!worker) return Promise.reject(new Error("no worker available"));

			const id = seq++;

			return new Promise<TaskResult<Tasks[Name]>>((resolve, reject) => {
				inflight.set(id, { resolve: resolve as (v: unknown) => void, reject, worker });

				worker.postMessage({ id, name, arg } satisfies Request, transfer ?? []);
			});
		},
		async destroy(): Promise<void> {
			destroyed = true;

			for (const [id, p] of inflight) {
				inflight.delete(id);
				p.reject(new Error("pool is destroyed"));
			}

			await Promise.all(workers.map((w) => w.terminate()));
		},
	};
}
