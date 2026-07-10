# @yaebal/workers

a typed `worker_threads` pool for offloading cpu-heavy work (image resizing, hashing, parsing)
off the bot's event loop — with a central queue, per-task timeouts, cooperative aborts,
crash recovery and zero-copy transfers.

most handlers are i/o-bound and already served by [`@yaebal/runner`](../runner/)'s concurrency.
threads help only for genuinely cpu-heavy work. offload _that_ — not the whole bot.

## install

```sh
pnpm add @yaebal/workers
```

## usage

share one `Tasks` type between the worker and the pool — task names, arguments and results
stay fully typed on both sides.

```ts
// tasks.ts — runs inside each worker thread
import { register } from "@yaebal/workers";
import sharp from "sharp";

export type Tasks = {
  resize: (buf: Uint8Array) => Promise<Uint8Array>;
  hash: (s: string) => string;
};

register<Tasks>({
  resize: (buf) => sharp(buf).resize(100).toBuffer(),
  hash: (s) => createHash("sha256").update(s).digest("hex"),
});
```

```ts
// bot.ts — stays on the main event loop
import { media } from "@yaebal/core";
import { files } from "@yaebal/files";
import { createPool } from "@yaebal/workers";
import type { Tasks } from "./tasks.js";

const pool = createPool<Tasks>(new URL("./tasks.js", import.meta.url), { size: 4 });

bot.install(files()).on("message:photo", async (ctx) => {
  const largest = ctx.message.photo.at(-1)!;
  const bytes = await ctx.files.download(largest.file_id);
  const thumb = await pool.run("resize", bytes, { timeout: 5_000 }); // typed: Uint8Array in, Uint8Array out
  await ctx.sendPhoto(media.buffer(thumb));
});

// on shutdown — drain in-flight tasks, then terminate
await pool.close();
```

`pool.run(name, arg?, options?)` sends `arg` to the least-busy ready worker and resolves with
the result. tasks queue centrally and dispatch to whichever worker frees up first — a slow task
never blocks an idle worker.

## bot integration

`@yaebal/workers/plugin` puts the pool on the context and ties its lifecycle to the bot's, so
you never leak a pool on shutdown:

```ts
import { tasks } from "@yaebal/workers/plugin";

const bot = new Bot(token).install(tasks(pool)); // ctx.tasks, closed on bot.stop()

bot.command("thumb", async (ctx) => {
  const bytes = await ctx.files.download(fileId);
  await ctx.sendPhoto(media.buffer(await ctx.tasks.run("resize", bytes)));
});
```

install it on the `Bot` itself so the plugin can hook `onStop`. drivers that own their own loop
(e.g. `@yaebal/runner`) don't fire the bot's stop handlers — install with `tasks(pool, { onStop: false })`
and close the pool yourself.

## timeouts & cancellation

every task handler gets an `AbortSignal` as its second argument. a `timeout` (per call or
pool-wide) or an external `signal` aborts it: settle promptly when the signal fires and the
worker survives; ignore it and the worker is terminated after `killTimeout` (default 500ms) and
respawned. a queued task that's aborted is simply dropped before it ever runs.

```ts
register<Tasks>({
  score: ({ text, rounds }, { signal }) => {
    for (let i = 0; i < rounds; i++) {
      if (signal.aborted) throw new Error("aborted"); // cooperative — the worker keeps living
      // …crunch…
    }
    return result;
  },
});

const controller = new AbortController();
const p = pool.run("score", input, { timeout: 3_000, signal: controller.signal });
```

## transferables & zero-copy

pass `transfer` to move a buffer to the worker instead of copying it, and wrap a result in
`move()` to move it back:

```ts
import { move } from "@yaebal/workers";

// worker side: return the bytes without a copy
register<Tasks>({ resize: (buf) => move(out, [out.buffer]) });

// main side: hand the buffer over (it's detached here afterwards)
const out = await pool.run("resize", bytes, { transfer: [bytes.buffer] });
```

## resilience

- **crash recovery** — a worker that crashes, is killed after a timeout, or trips its
  `resourceLimits` rejects only its in-flight tasks and is respawned with backoff. a worker
  file that can't even start is retried up to `maxRestarts` times, then the slot is declared
  dead (no fork-bomb, no infinite loop).
- **backpressure** — `maxQueue` bounds the waiting queue; `run()` rejects with `QueueFullError`
  instead of growing memory without limit.
- **observability** — `pool.stats()` reports queue depth, worker states and lifetime counters;
  `pool.on("worker:crash", …)` / `"worker:ready"` surface lifecycle events.
- **startup** — `await pool.ready()` resolves once every worker registered, or rejects if the
  pool can't start, so misconfiguration surfaces immediately rather than on the first request.

## api

| export              | signature                                                                 | description                                         |
|:--------------------|:--------------------------------------------------------------------------|:----------------------------------------------------|
| `createPool`        | `<Tasks>(workerFile: string \| URL, options?: PoolOptions) => Pool<Tasks>`| spawn a pool of workers                             |
| `register`          | `<Tasks>(handlers: TaskHandlers<Tasks>) => void`                          | called inside the worker file to expose tasks       |
| `move`              | `<T>(value: T, transfer: Transferable[]) => T`                           | move a result back to the main thread, no copy      |
| `tasks`             | `(pool, options?) => Plugin`                                              | (`/plugin`) expose the pool as `ctx.tasks`          |
| `isWorkerThread`    | `boolean`                                                                 | guard `register()` in single-file setups            |

### `createPool` options

| option        | type                              | default    | description                                                       |
|:--------------|:----------------------------------|:-----------|:------------------------------------------------------------------|
| `size`        | `number \| "auto"`                | `1`        | worker threads; `"auto"` = `availableParallelism() - 1`           |
| `concurrency` | `number`                          | `1`        | tasks a single worker runs at once (raise for i/o-ish tasks)      |
| `maxQueue`    | `number`                          | `Infinity` | max tasks waiting before `run()` throws `QueueFullError`          |
| `timeout`     | `number` (ms)                     | none       | default per-task execution timeout                                |
| `killTimeout` | `number` (ms)                     | `500`      | grace period for an aborted task to settle before its worker dies |
| `maxRestarts` | `number`                          | `5`        | consecutive crashes-without-ready before a slot is declared dead  |
| `backoff`     | `(consecutiveCrashes) => number`  | exp        | respawn delay per consecutive crash                               |
| `worker`      | `PoolWorkerOptions`               | —          | `workerData` / `resourceLimits` / `env` / `execArgv` per worker   |

### `Pool`

| member    | signature                                                     | description                                          |
|:----------|:--------------------------------------------------------------|:-----------------------------------------------------|
| `run`     | `(name, arg?, options?: RunOptions) => Promise<result>`       | run a task; `arg`/result inferred from `Tasks[name]` |
| `ready`   | `() => Promise<void>`                                         | resolves when all workers registered                 |
| `close`   | `(options?: { timeout?: number }) => Promise<void>`           | drain, then terminate                                |
| `destroy` | `() => Promise<void>`                                         | terminate now; reject everything in flight           |
| `stats`   | `() => PoolStats`                                             | queue depth, worker states, lifetime counters        |
| `on`      | `(event, listener) => () => void`                            | `"worker:ready"` / `"worker:crash"`; returns unsub   |
| `size`    | `number`                                                      | number of worker threads (readonly)                  |

`RunOptions`: `{ transfer?, signal?, timeout? }`. errors thrown in a task cross the thread with
their `name`, `message` and `stack` intact. pool errors are typed: `QueueFullError`,
`TaskTimeoutError`, `UnknownTaskError`, `WorkerCrashError`, `PoolClosedError` (all extend
`PoolError`).

> **built `.js` only.** the worker file must be a built `.js` (or run under a ts loader — workers
> inherit the parent's `--experimental-strip-types`). workers don't share closures with the main
> thread; they only receive the data you pass to `run`. `register()` throws if called outside a
> worker thread — guard with `isWorkerThread` in single-file setups.

`Pool` implements `Symbol.asyncDispose`, so `await using pool = createPool(…)` destroys it at
scope exit.

---

part of [**yaebal**](https://github.com/neverlane/yaebal) — a type-safe, runtime-agnostic Telegram Bot API framework. MIT.
