---
name: test-package
description: Use when writing or updating tests for @yaebal/* packages or bots — the actor-driven @yaebal/test 0.2 api (createTestEnv, UserActor, ChatActor, onApi, virtual clock), node:test conventions, and how tests run over compiled lib/.
---

# test a yaebal package or bot

use this skill when writing tests anywhere in the monorepo.

## conventions

- tests live next to source: `packages/<name>/src/index.test.ts`, importing the unit under test
  from `./index.js` (source-relative, `.js` specifier).
- runner is `node:test` + `node:assert/strict`. no vitest/jest in the monorepo.
- tests compile with the package and run over `lib/`: `pnpm build` first, then
  `node --test lib/*.test.js` (unquoted glob — `node --test lib` silently runs zero tests on
  node 25, quoted `**` breaks node 20). root `pnpm test` does build + all package tests.
- to use `@yaebal/test`, add it to `devDependencies` as `workspace:*` **and** add
  `{ "path": "../test" }` to the package's tsconfig `references`.

## the actor api (0.2 — the only api)

the old flat api (`createContext` / `runMiddleware` / `messageContext` / `setResult`) is gone.
full reference: `apps/docs/src/routes/docs/plugins/test/+page.svelte`.

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { Composer, type Context } from "@yaebal/core";
import { createTestEnv } from "@yaebal/test";
import { myPlugin } from "./index.js";

test("replies to /start", async () => {
	const bot = new Composer<Context>()
		.install(myPlugin())
		.command("start", (ctx) => ctx.reply("welcome"));

	const env = createTestEnv(bot);
	const user = env.createUser({ firstName: "Linia" });

	await user.sendCommand("start");
	assert.equal(env.lastApiCall("sendMessage")?.params?.text, "welcome");
});
```

`createTestEnv(bot)` accepts any `Composer` or `Bot`, intercepts every api call (no http), and
auto-stubs results (auto-incrementing `message_id`, stub `getMe`, `true` for
`answerCallbackQuery`).

### driving the bot

- `env.createUser(opts?)` → `UserActor`: `sendMessage`, `sendCommand("start", "payload")`,
  `sendReply`, all media (`sendPhoto`/`sendVideo`/`sendSticker`/…, auto-generated `file_id`s),
  `sendMediaGroup`, `react`, `join`/`leave`, `sendInlineQuery`, `chooseInlineResult`,
  `sendSuccessfulPayment` (runs the real pre-checkout flow and throws if the bot didn't answer ok).
- `env.createChat({ type, title? })` → `ChatActor`; scopes:
  `user.in(group).sendCommand("help")`, `user.on(msg).clickByText("Next »")`,
  `user.on(msg).click("raw:data")`.
- escape hatch for shapes actors don't cover: fixture builders (`messageUpdate`,
  `callbackUpdate`, `pollUpdate`, …, `createUpdate`) + `env.dispatch(update)`.

### asserting

- `env.lastApiCall(method?)`, `env.callsTo(method)`, `env.apiCalls`, `env.clearApiCalls()`.
- `env.lastBotMessage({ withReplyMarkup?, chat?, where? })` — live mirror of the bot's last sent
  message, mutated in place by later `editMessage*` calls; feed it back to
  `user.on(bubble).clickByText(...)`.
- prefer asserting on observable behavior (api calls, storage contents) over plugin internals.

### failures, strictness, time

- `env.onApi("sendMessage", apiError(429, "Too Many Requests", { retry_after: 1 }), { times: 1 })`
  — one-shot error then fall through; the bot sees a real `TelegramError` subclass.
- `createTestEnv(bot, { strictApi: true })` throws on unstubbed methods;
  `{ strictDispatch: true }` throws when no handler consumed an update.
- virtual clock for ttl/retry/debounce — never sleep real time:
  `env.useFakeTimers()` (arm before the timer is scheduled) → `await env.advanceTime(ms)` →
  `env.shutdown()` in teardown (restores real timers).
- satellite plugins ship fixtures as a `TestPack`
  (`createTestEnv(bot, { packs: [againTestPack()] })`) — explicit, never a global registry.

### webhooks / runners

`webhookRequest(update, { secretToken })` builds the POST for `webhookCallback(bot, ...)`;
`collectUpdates()` gives a recording `UpdateSink`; `withFetch(handler, fn)` stubs global fetch.

## when NOT to use @yaebal/test

`@yaebal/core` and `@yaebal/session` test with a hand-built `Context` + `Composer.toMiddleware()`
(see `packages/session/src/index.test.ts`) because depending on `@yaebal/test` there would be
circular. everything downstream of them should use actors.

## verify

```sh
pnpm typecheck
pnpm build && cd packages/<name> && node --test lib/*.test.js
```
