# @yaebal/throttle

priority outbound scheduler for Telegram Bot API calls. `throttle` enforces Telegram-shaped buckets, supports per-method limits, priority queueing, shared storage, abort/cancel, metrics, and `retry_after` feedback from `@yaebal/again`.

## install

```sh
pnpm add @yaebal/throttle
```

## usage

```ts
import { throttle } from "@yaebal/throttle";

const limiter = throttle(bot.api, {
	globalPerSec: 30,
	perChatPerSec: 1,
	perGroupPerMin: 20,
	perMethod: {
		sendVideo: { privateChat: { limit: 1, windowMs: 5_000 }, priority: -5 },
		answerCallbackQuery: { privateChat: false, group: false, priority: 20 },
	},
});

console.log(limiter.metrics.pending);
```

installable plugin form:

```ts
const transport = throttle({ globalPerSec: 30 });

const bot = new Bot(token).install(transport);
transport.handle.metrics.acquired;
```

the old compatibility mode still works:

```ts
throttle(bot.api, { minIntervalMs: 100 });
```

## buckets

every request can acquire multiple buckets atomically:

- `global` caps the whole bot, default `30/s`.
- `private:<chat_id>` caps one private chat, default `1/s`.
- `group:<chat_id>` caps one group or supergroup, default `20/min`.
- `method:<method>:...` isolated method buckets are created for `perMethod` limit overrides.

control-plane methods such as `getMe`, `getUpdates`, `getWebhookInfo`, `logOut`, and `close` are excluded by default.

## priority and cancellation

```ts
import { withThrottle } from "@yaebal/throttle";

await bot.api.sendMessage(
	withThrottle({ chat_id, text: "urgent" }, { priority: 100 }),
);

const controller = new AbortController();
const queued = bot.api.sendMessage(
	withThrottle({ chat_id, text: "cancel me" }, { signal: controller.signal }),
);

controller.abort();
await queued;
```

you can also cancel queued work from the handle:

```ts
limiter.cancel({ method: "sendMessage" });
limiter.cancel({ bucket: `private:${chatId}` });
```

## shared storage

the built-in `memoryThrottleStorage()` is process-local. for multi-process or multi-region bots, pass a storage adapter whose `take(buckets, now)` atomically checks and records all buckets.

```ts
import type { ThrottleStorage } from "@yaebal/throttle";

const redisStorage: ThrottleStorage = {
	async take(buckets, now) {
		// check all bucket windows in Redis, record all hits only when every bucket fits
		return { ok: true, waitMs: 0 };
	},
	async freeze(bucketKey, until) {
		// store a retry_after freeze shared by every worker
	},
};

throttle(bot.api, { storage: redisStorage });
```

## metrics and retry_after learning

`throttle` exposes live metrics and emits events for queueing, acquisition, rejection, cancellation and learned flood-waits.

```ts
const limiter = throttle(bot.api, {
	onEvent: (event) => console.log(event.type),
});

limiter.metrics.pending;
limiter.metrics.totalWaitMs;
```

when telegram returns `429` with `response_parameters.retry_after`, `@yaebal/core` stores it on `TelegramError.parameters.retry_after`. `throttle` observes that error and freezes the affected buckets, while `@yaebal/again` performs the awaited retry.

---

part of [**yaebal**](https://github.com/neverlane/yaebal) - a type-safe, runtime-agnostic Telegram Bot API framework. MIT.
