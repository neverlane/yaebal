# @yaebal/conversation

write multi-step dialogs as a straight line — `await cv.waitFor(...)` resolves with the next
matching update for that key. a coroutine by default (the builder runs once, detached, no replay,
no duplicated side effects); opt into a durable, restart-safe replay engine with one option.

## install

```sh
pnpm add @yaebal/conversation
```

## usage

```ts
import { conversation, createConversation } from "@yaebal/conversation";
import { createBot } from "yaebal";

const greet = createConversation(async (cv, ctx) => {
	await ctx.send("what's your name?");

	const answer = await cv.waitFor("message:text"); // narrowed: answer.text is a plain string
	await answer.send(`hi ${answer.text}! nice to meet you.`);
});

const bot = createBot(token).install(conversation({ greet }));

bot.command("greet", (ctx) => ctx.conversation.enter("greet")); // names are typed
bot.command("cancel", (ctx) => ctx.conversation.active && ctx.conversation.leave()); // works mid-conversation
```

## behavior

- **typed waiting** — `waitFor(query)` narrows like `composer.on()`, `waitUntil(predicate)` takes
  any sync/async predicate (with a type-guard overload); `cv.form.text/int/choice/confirm` are
  ready-made ask-validate-reask loops on top, with `standard-schema` support.
- **polite routing** — an update that doesn't match the parked `wait()` falls through to normal
  handlers (`passthrough`), and `/commands` bypass the conversation (`passCommands`), so a global
  `/cancel` keeps working with zero per-step boilerplate.
- **cancellation and timeouts** — `leave()` rejects a parked `wait()` with
  `ConversationExitedError` (the builder's `finally` still runs); every wait accepts a `timeout`,
  rejecting with `ConversationTimeoutError`. `cv.signal` is an `AbortSignal` for `fetch`.
- **the durable engine** — pass `options.storage` (any `StorageAdapter`, see `@yaebal/sklad`) and
  the builder is replayed from a recorded log on every update instead of parking in memory, so it
  survives a restart. requires a **deterministic** builder: route every side effect through `ctx`
  or `cv.external()`, never branch on outside mutable state.
- **hooks** — `onEnter`, `onLeave(ctx, { reason, result, error })` with reasons
  `finish | left | replaced | timeout | error`, `onError`, `onOverflow`.
- **`enter()` doesn't wait for completion** — only for the conversation to *start* (bounded, fast),
  so calling it as a bare, unawaited command-handler return value never deadlocks. read the result
  back via `onLeave`'s `info.result`.

---

part of [**yaebal**](https://github.com/neverlane/yaebal) — a type-safe, runtime-agnostic Telegram Bot API framework. MIT.
