/**
 * @yaebal/workers — a typed worker_threads pool. keep the bot on the main event loop
 * (already concurrent via @yaebal/runner) and offload only the CPU-heavy bits:
 *
 *   // tasks.ts (runs in each worker)
 *   import { register } from "@yaebal/workers";
 *   export type Tasks = { resize: (buf: Uint8Array) => Promise<Uint8Array> };
 *   register<Tasks>({ resize: (buf) => sharp(buf).resize(100).toBuffer() });
 *
 *   // bot
 *   const pool = createPool<Tasks>(new URL("./tasks.js", import.meta.url), { size: 4 });
 *   bot.on("message:photo", async (ctx) => {
 *     const bytes = await ctx.files.download(ctx.message.photo.at(-1)!.file_id);
 *     const thumb = await pool.run("resize", bytes, { timeout: 5_000 });
 *     await ctx.sendPhoto(media.buffer(thumb));
 *   });
 *
 * tasks queue centrally and run on the least-busy ready worker. crashed workers respawn
 * with backoff; hung tasks time out and their worker is recycled. `@yaebal/workers/plugin`
 * wires a pool into the bot as `ctx.tasks` with lifecycle handled for you.
 */

import { isMainThread } from "node:worker_threads";

export {
	PoolClosedError,
	PoolError,
	QueueFullError,
	TaskTimeoutError,
	UnknownTaskError,
	WorkerCrashError,
} from "./errors.js";
export {
	type CloseOptions,
	createPool,
	type Pool,
	type PoolEvents,
	type PoolOptions,
	type PoolStats,
	type PoolWorkerOptions,
} from "./pool.js";
export { move } from "./protocol.js";
export { register } from "./register.js";
export type {
	AnyTasks,
	RunOptions,
	TaskContext,
	TaskDefinitions,
	TaskFn,
	TaskHandlers,
} from "./types.js";

/** true inside a worker thread — guard `register()` in single-file setups. */
export const isWorkerThread = !isMainThread;
