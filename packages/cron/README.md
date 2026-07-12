# @yaebal/cron

typed cron jobs: declarative schedules (5/6-field cron expressions, `@aliases`, or a plain
millisecond interval), per-job timezones, retries with backoff, overlap control, cooperative
timeouts, catch-up after downtime, a distributed-lock hook for multi-instance deployments, runtime
job management, and a chat-native admin surface — with graceful shutdown throughout.
`@yaebal/broadcast` is close but purpose-built for mass messaging — `cron` is a generic scheduler
for periodic tasks; close over `bot.api` in your task to send anything.

## install

```sh
pnpm add @yaebal/cron
```

## usage

```ts
import { cron } from "@yaebal/cron";

bot.install(
	cron({
		tz: "Europe/Moscow", // default zone for every job below; UTC if omitted
		jobs: {
			digest: {
				schedule: "0 9 * * *", // every day at 09:00 local
				task: async () => {
					await bot.api.sendMessage({ chat_id: adminId, text: "good morning" });
				},
				retries: 2,
				timeoutMs: 10_000,
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
in-flight run finishes (see [behavior](#behavior)). the plugin also decorates `ctx.cron`, so any
handler can reach `trigger`/`pause`/`resume`/`states`/`nextRuns` without a separate import:

```ts
bot.command("run-digest", async (ctx) => {
	await ctx.reply(`digest: ${await ctx.cron.trigger("digest")}`);
});
```

for webhook/serverless deployments, where `onStart`/`onStop` never fire, use `createCron()` and
call `start()`/`stop()` yourself:

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

## admin surface

`cronAdmin()` gives admins a telegram-native ops panel — no separate dashboard or deploy:

```ts
import { cron, cronAdmin } from "@yaebal/cron";

bot
	.install(cron({ jobs: { digest: { schedule: "0 9 * * *", task: sendDailyDigest } } }))
	.install(cronAdmin({ isAdmin: (ctx) => ctx.from?.id === adminId }));
```

- `/cron` — every job's state: paused/running, run/failure counts, next and last run, last error
- `/cron run <name>` — trigger a job immediately, respecting its overlap policy
- `/cron pause <name>` / `/cron resume <name>` — stop/restart its automatic schedule
- `/cron next <name>` — preview its next 3 scheduled fire times

pass `command: "jobs"` to rename it. gated via `Composer.filter` (not `guard`) — a rejected
`isAdmin` check continues the *outer* chain instead of halting it, so installing this doesn't gate
any handler registered elsewhere on the same composer.

## behavior

- **schedule** is a 5-field cron expression (`minute hour day-of-month month day-of-week`), a
  6-field one with a leading seconds field, one of the
  `@yearly`/`@monthly`/`@weekly`/`@daily`/`@hourly`/`@midnight`/`@annually`/`@reboot` aliases, or a
  plain number of milliseconds for a fixed interval. the usual `*`, `,`, `-`, `/` syntax is
  supported, plus `JAN`–`DEC`/`SUN`–`SAT` names in the month/day-of-week fields. an expression that
  can never match (`0 0 31 2 *` — February never has 31 days) is rejected at registration, not
  discovered later. `@reboot` fires once when the scheduler starts and never arms a timer.
- **tz** — set globally (`cron({ tz: "Europe/Moscow" })`) or per job (`{ tz: "America/New_York" }`,
  overriding the global default); UTC when neither is set. resolved per-instant via `Intl`
  (DST-correct: a skipped spring-forward hour is simply never matched, a repeated fall-back hour
  fires once), no timezone database bundled. millisecond intervals ignore `tz` — they're anchored
  on absolute time, not wall-clock fields.
- **overlap** decides what happens when a job's previous run is still going when it's due again:
  `"skip"` (default) drops the new run and emits a `run_skipped` event; `"wait"` queues exactly one
  run to fire right after the current one finishes (extra due-while-queued fires collapse into that
  same queued run); `"allow"` fires concurrently.
- **timeoutMs** races the task against a timer and aborts `ctx.signal` (cooperative — pass it into
  your own `fetch`/api calls to actually cancel work) — either way the scheduler stops waiting,
  fails the run, and re-arms; a task that never resolves can never wedge the schedule.
- **retries**/**retryDelayMs** re-run a failed (or timed-out) attempt up to `retries` more times,
  waiting `retryDelayMs` (a fixed number or a function of the attempt number) between them. only
  the final attempt counts toward `failures` and calls `onError`; `ctx.attempt` tells the task which
  try it's on.
- **jitterMs** adds a random 0..`jitterMs` delay on top of each scheduled fire, to spread out jobs
  that would otherwise all wake up at the same instant.
- **catchUp** + **store**: with a `store` configured (any `@yaebal/sklad` adapter, or anything
  shaped like one — see [persistence](#persistence)), a job with `catchUp: true` fires once at
  `start()` if its schedule had an occurrence due between the last recorded run and now.
- **acquireLock** is a distributed-lock hook for multi-instance deployments: return `false` to skip
  a fire (another instance owns it), `true` to proceed with no release step, or a release function
  to call once the run finishes. no backend is bundled — wire it to Redis, Postgres advisory locks,
  or whatever your fleet already has.
- **graceful shutdown**: `stop()` clears every timer immediately (no new runs start) and by default
  waits for in-flight runs — and any queued `overlap: "wait"` follow-up they spawn — to finish, up
  to `drainTimeoutMs` (30s), then aborts `ctx.signal` on anything still going. pass
  `{ graceful: false }` to abort and return immediately instead.
- **runOnStart** fires a job once as soon as the scheduler starts, in addition to its normal
  schedule — without disturbing that schedule's first real tick.
- **runtime management**: `remove(name)`, `pause(name)`/`resume(name)`, `reschedule(name, schedule)`,
  and `nextRuns(name, count)` (preview upcoming fire times without arming anything).
- `onEvent` observes `scheduled` / `run_started` / `run_completed` / `run_failed` / `run_retry` /
  `run_skipped` (`reason: "overlap" | "lock"`) / `run_timeout` / `store_error` / `schedule_error`
  for logs and metrics — every event carries `at` (timestamp) and, where relevant, `run`/`attempt`.

## persistence

`store` only needs `get`/`set` (`delete` is optional) and may be sync or async — the same shape as
`@yaebal/sklad`'s `StorageAdapter<T>`, so any of its adapters (`MemoryStorage`, `redisStorage`,
`sqliteStorage`, `kvStorage`, `fileStorage`) work without an explicit dependency on the package:

```ts
import { fileStorage } from "@yaebal/sklad/file";

cron({
	store: fileStorage("./cron-state.json"),
	jobs: {
		digest: { schedule: "0 9 * * *", task: sendDailyDigest, catchUp: true },
	},
});
```

## options

```ts
cron({
	jobs: {
		/* name → { schedule, task, tz?, overlap?, runOnStart?, catchUp?, timeoutMs?,
		            retries?, retryDelayMs?, jitterMs?, onError? } */
	},
	tz: "UTC",
	onEvent: (event) => metrics.count(event.type),
	graceful: true,
	drainTimeoutMs: 30_000,
	store: undefined,
	acquireLock: undefined,
	unref: false,
});
```

## testing

`Cron` doesn't touch `ctx` — `createCron()` + `trigger()` is enough for most job logic, no
`@yaebal/test` actors needed:

```ts
import { createCron } from "@yaebal/cron";

const jobs = createCron().job("digest", 60_000, sendDigest);
await jobs.trigger("digest"); // run it once, right now, bypassing the schedule — resolves "ran"
```

for schedule-driven behavior (`start()`, timers, retries with delays), drive `@yaebal/test`'s
virtual clock instead of real `sleep()`:

```ts
import { installTestClock } from "@yaebal/test";

const clock = installTestClock();
try {
	jobs.start();
	await clock.advance(60_000);
	assert.equal(jobs.state("digest")?.runs, 1);
} finally {
	clock.restore();
}
```

`cronAdmin()` touches `ctx`, so test it through a real bot and `createTestEnv`:

```ts
import { createTestEnv } from "@yaebal/test";

const bot = new Bot(token)
	.install(cron({ jobs: { digest: { schedule: 60_000, task: sendDigest } } }))
	.install(cronAdmin({ isAdmin: () => true }));

const env = createTestEnv(bot);
await env.createUser().sendCommand("cron", "run digest");
```

---

part of [**yaebal**](https://github.com/neverlane/yaebal) — a type-safe, runtime-agnostic Telegram Bot API framework. MIT.
