# @yaebal/broadcast

typed broadcast jobs for yaebal bots: queue many deliveries, keep progress in storage,
retry transient failures, skip blocked users, pause/resume/cancel jobs and listen to events.

## install

```sh
pnpm add @yaebal/broadcast
```

## fast path

```ts
import { Bot } from "@yaebal/core";
import { broadcast } from "@yaebal/broadcast";

const bot = new Bot(process.env.BOT_TOKEN!);

const result = await broadcast(bot.api, subscriberIds, "hello everyone", {
	rateLimit: { limit: 25, windowMs: 1_000 },
	retry: { attempts: 5, fixedDelayMs: 1_000 },
	extra: { disable_notification: true },
	onError: (chatId, error) => {
		console.error("delivery failed", chatId, error);
	},
});

console.log(result.sent, "sent", result.skipped, "skipped", result.failed, "failed");
```

## typed jobs

```ts
import { Broadcast, MemoryBroadcastStorage } from "@yaebal/broadcast";

const storage = new MemoryBroadcastStorage();

const broadcaster = new Broadcast(bot.api, {
	storage,
	concurrency: 5,
	rateLimit: { limit: 25, windowMs: 1_000 },
	onEvent: (event) => console.log(event.type),
}).type("digest", (chatId: number, text: string) =>
	bot.api.sendMessage({ chat_id: chatId, text }),
);

const job = await broadcaster.start("digest", [
	[1001, "weekly digest"],
	[1002, "weekly digest"],
]);

const result = await job.wait();
```

`type()` accumulates valid job names and tuple arguments through the chain. `start("digest", ...)`
will only accept the arguments of the registered `digest` handler.

## controls

```ts
await job.pause();
await job.resume();
await job.cancel();

const snapshot = await job.snapshot();
const jobs = await broadcaster.listJobs();
const failed = await broadcaster.listDeliveries(job.id, { status: "failed" });
```

## storage

`MemoryBroadcastStorage` is useful for tests, examples and single-process bots. production bots can
implement `BroadcastStorage` on top of redis, postgres, sqlite or any queue/database. the only hard
requirement for multi-worker delivery is an atomic `claim(workerId, now, leaseMs)` implementation.

## behavior

- default rate limit is `25` deliveries per second.
- default retry budget is `5` attempts with bounded backoff.
- telegram `403` errors are treated as skipped recipients by default.
- telegram `429` errors honor `response_parameters.retry_after`.
- jobs expose `sent`, `failed`, `skipped`, `retried`, `total` and terminal `status`.
- events cover job creation, delivery start/sent/retry/skip/fail, rate-limit waits and storage errors.

---

part of [**yaebal**](https://github.com/neverlane/yaebal) — a type-safe, runtime-agnostic Telegram Bot API framework. MIT.
