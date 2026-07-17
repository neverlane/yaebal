---
name: yaebal-test-bot
description: Use when writing tests for a yaebal bot — @yaebal/test actors, api-call assertions, failure injection, and the virtual clock.
---

# testing a yaebal bot with @yaebal/test

`createTestEnv(bot)` wraps any `Composer`/`Bot`, intercepts **every** outgoing api call (no real
HTTP, ever), and hands you virtual users and chats that send real update shapes. works with
`node:test`, vitest, or any runner. install as a dev dependency: `pnpm add -D @yaebal/test`.

## canonical test

```typescript
import { test } from "node:test";
import assert from "node:assert/strict";
import { createTestEnv } from "@yaebal/test";
import { bot } from "../src/bot.js";

test("replies to /start", { timeout: 5_000 }, async () => {
	const env = createTestEnv(bot);
	const user = env.createUser({ firstName: "linia" });

	await user.sendCommand("start");

	assert.equal(env.lastApiCall("sendMessage")?.params?.text, "welcome!");
});
```

## driving the bot

```typescript
const group = env.createChat({ type: "group", title: "devs" });

await user.sendMessage("hello");
await user.in(group).sendCommand("help");
await user.sendPhoto({ caption: "look" });

// inline buttons: grab the bot's message, click by label
const bubble = env.lastBotMessage({ withReplyMarkup: true });
if (bubble) await user.on(bubble).clickByText("Next »");
await user.click("vote:up", bubble); // or by raw callback_data
```

## asserting what the bot did

```typescript
env.lastApiCall("sendMessage");   // most recent call to a method: { method, params, result }
env.callsTo("editMessageText");   // every call to a method, in order
env.apiCalls;                     // everything recorded
env.clearApiCalls();              // reset between phases of one test
```

## failure injection

```typescript
import { apiError } from "@yaebal/test";

// first call fails with a real TelegramError shape, later calls use auto-stubs again
env.onApi("sendMessage", apiError(429, "Too Many Requests", { retry_after: 1 }), { times: 1 });
env.onApi("getMe", { id: 7, is_bot: true, first_name: "MyBot", username: "my_bot" });
```

## virtual clock — never sleep in tests

```typescript
const env = createTestEnv(bot);
env.useFakeTimers();                    // arm before the code schedules its timer

await user.sendCommand("start");        // handler sets a 1h timeout internally
await env.advanceTime(60 * 60 * 1000);  // fires instantly

env.shutdown();                         // ALWAYS in teardown — restores real Date.now/timers
```

## rules

- never hit real Telegram in CI. `createTestEnv` guarantees this for dispatched updates —
  but do **not** call `bot.start()` inside a test: bot-level startup (`getMe`, `onStart`
  hooks) goes to the real network. drive the bot through actors instead.
- always pass `{ timeout }` to `test()` — a parked wait or nav bug otherwise hangs the whole
  suite forever.
- prefer `node:test` + `node:assert/strict` unless the project already uses another runner.
- `createTestEnv(bot, { strictApi: true })` throws on unstubbed methods;
  `{ strictDispatch: true }` throws when no handler consumed an update — both catch silent bugs.
- for update shapes the actors don't cover, build raw updates (`createUpdate`,
  `messageUpdate`, …) and `await env.dispatch(update)`.
- webhook handlers are testable too: `webhookRequest(update, { secretToken })` builds the POST
  for a `webhookCallback(bot, ...)` handler.

## learn more

- https://yaebal.mom/docs/plugins/test/
