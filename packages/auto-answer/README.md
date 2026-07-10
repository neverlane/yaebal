# @yaebal/auto-answer

clears the client's loading spinner on every `callback_query` — no `await ctx.answerCallbackQuery()`
sprinkled through every button handler, and no forgotten one leaving a user staring at a spinner
until telegram gives up on it.

## install

```sh
pnpm add @yaebal/auto-answer
```

## usage

```ts
import { autoAnswer } from "@yaebal/auto-answer";

bot.install(autoAnswer());

bot.callbackQuery("ping", (ctx) => ctx.reply("pong"));
```

that's it — every button press gets an instant, empty answer, and handlers never have to think
about the spinner again.

## behavior

- **`mode: "immediate"`** (default) — answers the instant the update arrives, fired off before
  any handler runs, so the spinner clears with zero added latency even if a handler is slow.
- **`mode: "deferred"`** — waits for the whole handler chain to finish first, and only answers if
  nothing did. a handler's own `ctx.answerCallbackQuery({ text, showAlert })` always wins; the
  plugin only fills the gap when it's forgotten.
- never double-answers: `ctx.answerCallbackQuery` is tracked per update, so a manual call — before
  or after the plugin's own — always short-circuits it.
- never throws: a failed auto-answer (an expired query, a dropped connection) is swallowed and
  handed to `onError` instead of crashing the chain over a best-effort spinner clear.

## options

```ts
bot.install(
	autoAnswer({
		mode: "deferred",
		// static, or computed per update:
		params: (ctx) => ({ text: ctx.callbackQuery.data === "danger" ? "careful!" : undefined }),
		// skip updates another plugin already handles (e.g. @yaebal/pagination's own alerts):
		filter: (ctx) => !ctx.callbackQuery.data?.startsWith("page:"),
		onAnswer: (ctx) => metrics.increment("callback_answered"),
		onError: (error, ctx) => logger.warn("auto-answer failed", error, ctx.callbackQuery.id),
	}),
);
```

`params` accepts `text`, `showAlert`, `url` and `cacheTime` — the same fields
`answerCallbackQuery` takes, camelCased.

---

part of [**yaebal**](https://github.com/neverlane/yaebal) — a type-safe, runtime-agnostic Telegram Bot API framework. MIT.
