# @yaebal/cron

typed cron jobs: declarative schedules (5-field cron expressions, `@aliases`, or a plain
millisecond interval), overlap control, cooperative timeouts and graceful shutdown. `@yaebal/broadcast`
is close but purpose-built for mass messaging — `cron` is a generic scheduler for periodic tasks;
close over `bot.api` in your task to send anything.

## install

```sh
pnpm add @yaebal/cron
```

## usage

```ts
import { cron } from "@yaebal/cron";

bot.install(
	cron({
		jobs: {
			digest: {
				schedule: "0 9 * * *", // every day at 09:00 UTC
				task: async () => {
					await bot.api.sendMessage({ chat_id: adminId, text: "good morning" });
				},
			},
			heartbeat: {
				schedule: 30_000, // every 30s
				task: () => probe.ping(),
			},
		},
	}),
);
```

jobs arm on `bot.onStart` and drain on `bot.onStop` — `await bot.stop()` won't resolve until any
in-flight run finishes (see [behavior](#behavior)). for webhook/serverless deployments, where
`onStart`/`onStop` never fire, use `createCron()` and call `start()`/`stop()` yourself:

```ts
import { createCron } from "@yaebal/cron";

const jobs = createCron()
	.job("cleanup", "*/15 * * * *", () => cleanupExpiredSessions())
	.job("digest", "0 9 * * *", sendDailyDigest, { timeoutMs: 60_000 });

jobs.start();
// ...
await jobs.stop();
```

chained `.job()` calls accumulate valid names, so `jobs.trigger("cleanup")` and
`jobs.state("digest")` are typo-checked at compile time.

## behavior

- **schedule** is either a 5-field cron expression (`minute hour day-of-month month day-of-week`,
  always UTC — there is no timezone field) with the usual `*`, `,`, `-`, `/` syntax, one of the
  `@yearly`/`@monthly`/`@weekly`/`@daily`/`@hourly`/`@midnight`/`@annually` aliases, or a plain
  number of milliseconds for a fixed interval.
- **overlap** decides what happens when a job's previous run is still going when it's due again:
  `"skip"` (default) drops the new run and emits a `run_skipped` event; `"wait"` queues exactly one
  run to fire right after the current one finishes (extra due-while-queued fires collapse into that
  same queued run).
- **timeoutMs** aborts `ctx.signal` after the given time — cooperative, so pass it into your own
  `fetch`/api calls to actually cancel work. either way the scheduler stops waiting and re-arms.
- **graceful shutdown**: `stop()` clears every timer immediately (no new runs start) and by default
  waits for in-flight runs to finish, up to `drainTimeoutMs` (30s). pass `{ graceful: false }` to
  return immediately instead.
- **runOnStart** fires a job once as soon as the scheduler starts, in addition to its normal
  schedule.
- `onEvent` observes `scheduled` / `run_started` / `run_completed` / `run_failed` / `run_skipped` /
  `run_timeout` for logs and metrics.

## options

```ts
cron({
	jobs: {
		/* name → { schedule, task, overlap?, runOnStart?, timeoutMs?, onError? } */
	},
	onEvent: (event) => metrics.count(event.type),
	graceful: true,
	drainTimeoutMs: 30_000,
});
```

## testing

`Cron` doesn't touch `ctx`, so plain `node:test` is enough — no `@yaebal/test` actors needed:

```ts
import { createCron } from "@yaebal/cron";

const jobs = createCron().job("digest", 60_000, sendDigest);
await jobs.trigger("digest"); // run it once, right now, bypassing the schedule
```

---

part of [**yaebal**](https://github.com/neverlane/yaebal) — a type-safe, runtime-agnostic Telegram Bot API framework. MIT.
