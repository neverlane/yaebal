# @yaebal/again

awaited auto-retry for Telegram `429` flood-wait errors and transient `5xx` errors. unlike text-parsing retry helpers, `again` reads `TelegramError.parameters.retry_after`, which is copied from Telegram's structured `response_parameters.retry_after` field by `@yaebal/core`.

## install

```sh
pnpm add @yaebal/again
```

## usage

```ts
import { autoRetry } from "@yaebal/again";

bot.install(
	autoRetry({
		maxRetries: 5,
		retryAfterPaddingMs: 250,
		onRetry: (event) => {
			console.log(event.method, event.reason, event.delayMs);
		},
	}),
);
```

direct API-hook form:

```ts
autoRetry(bot.api, { maxRetries: 5 });
```

## behavior

`autoRetry()` registers an `api.onError` hook. when a request fails, core keeps the original promise alive, waits, and re-runs the same API call. `await ctx.reply()` resolves with the successful retry result or rejects with the final error after the retry budget is exhausted.

retry policy:

- `429` with `error.parameters.retry_after` waits exactly that value, plus optional padding.
- `429` without structured `retry_after` falls back to exponential backoff.
- `5xx` uses exponential backoff when `retryOnInternal` is enabled.
- `4xx` client errors are not retried.
- `onRetry` observes every scheduled retry for logs and metrics.

## options

```ts
autoRetry({
	maxRetries: 3,
	maxDelayMs: 30_000,
	baseDelayMs: 1_000,
	retryAfterPaddingMs: 0,
	jitter: 0.2,
	retryOnInternal: true,
	onRetry: (event) => metrics.count(event.reason),
});
```

## testing

```ts
import { againTestPack } from "@yaebal/again/test-pack";
import { apiError, createTestEnv } from "@yaebal/test";

const env = createTestEnv(bot, { packs: [againTestPack({ maxRetries: 2 })] });
env.onApi("sendMessage", apiError(429, "Too Many Requests", { retry_after: 0 }), { times: 1 });
```

## with @yaebal/throttle

use `@yaebal/throttle` before or after `again`. core runs all error hooks, so throttle can learn Telegram's structured `retry_after` feedback even when `again` is the hook that requests the retry.

---

part of [**yaebal**](https://github.com/neverlane/yaebal) - a type-safe, runtime-agnostic Telegram Bot API framework. MIT.
