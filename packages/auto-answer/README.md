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

that's it — every button press gets a spinner-clearing answer, and a handler that wants to show
its own alert (`ctx.answerCallbackQuery({ text: "…", showAlert: true })`) still can: it just needs
to answer before the default 1.5s deadline (see [modes](#modes) below).

## modes

```ts
// "deadline" (default) — races the handler chain against `timeout` (default 1500ms). a handler
// that answers first — with its own text/alert — always wins; if nothing answers before the
// timer fires, the plugin fills the gap with an empty ack. the spinner never outlives `timeout`.
bot.install(autoAnswer({ timeout: 2000 }));

// "deferred" — waits for the whole handler chain to finish, however long that takes, and only
// answers if nothing already did. no timer, so no risk of racing a still-running handler — but a
// hung or truly slow handler leaves the spinner spinning for as long as it takes.
bot.install(autoAnswer({ mode: "deferred" }));

// "immediate" — answers the instant the update arrives, before any handler runs. zero added
// latency, but a handler's own answerCallbackQuery(...) can no longer win — it's silently turned
// into a no-op instead of a second call that would fail against telegram. only reach for this if
// no handler downstream ever answers its own callback queries.
bot.install(autoAnswer({ mode: "immediate" }));
```

pick `"deadline"` unless you have a specific reason not to — it's the only mode where both
"the spinner always clears promptly" and "a handler's own alert still works" hold at once.

## never double-answers, never throws

whichever call reaches `ctx.answerCallbackQuery` first — this plugin's own fallback, or a
handler's manual call — wins; every later one (even in the same synchronous tick, e.g. an
`"immediate"` fire racing a handler that answers right away) becomes a safe no-op instead of a
second network call racing the first to telegram's `400: query is too old`.

calls that go around `ctx.answerCallbackQuery` entirely — a rich
[`@yaebal/contexts`](/packages/contexts/) `contextFor("callback_query", ...).answer()`, or a raw
`ctx.api.call("answerCallbackQuery", ...)` — are still *observed* (so `"deferred"`/`"deadline"`'s
fallback correctly backs off once the handler chain has had time to run), but not blocked outright:
in `"immediate"` mode specifically, a bypass call issued in the very same tick as the plugin's own
fire can still double-dispatch. stick to `ctx.answerCallbackQuery` (or `ctx.skipAutoAnswer()`, see
below) inside handlers this plugin watches, and this never comes up.

a failed auto-answer (an expired query, a dropped connection, a throwing `filter`/`params`) is
always swallowed and handed to `onError` — this plugin never crashes the chain over a best-effort
spinner clear, and a broken `onAnswer`/`onError` callback can't crash it either.

## opting out per update

```ts
bot.callbackQuery("archive", async (ctx) => {
	// answering later, from a queued job — tell the plugin not to fill the gap in the meantime.
	ctx.skipAutoAnswer();
	await queue.push({ type: "archive", callbackQueryId: ctx.callbackQuery.id });
});
```

`ctx.skipAutoAnswer()` opts the current update out entirely — no fallback answer, regardless of
mode. it's a no-op outside a `callback_query` update, so it's always safe to call.

## options

```ts
bot.install(
	autoAnswer({
		mode: "deadline",
		timeout: 2000,
		// static, or computed per update (sync or async):
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
