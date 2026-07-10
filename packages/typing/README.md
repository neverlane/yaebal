# @yaebal/typing

keeps the "is typing…" indicator alive for the duration of an async operation — no manual
`sendChatAction` calls, no forgotten indicator left stuck after telegram's ~5s expiry. built for
long LLM/API calls where the reply takes a noticeable amount of time to arrive.

## install

```sh
pnpm add @yaebal/typing
```

## usage

```ts
import { typing } from "@yaebal/typing";

bot.install(typing());

bot.on("message:text", async (ctx) => {
	const reply = await ctx.typing(() => llm.complete(ctx.message.text));
	await ctx.reply(reply);
});
```

`ctx.typing(fn)` sends `sendChatAction: "typing"` immediately, re-sends it on an interval so it
survives telegram's ~5 second expiry, and clears itself the instant `fn` settles — resolved or
rejected. the handler above shows a live typing indicator for as long as the LLM call takes, with
no cleanup code of its own.

## behavior

- **`ctx.typing(fn, options?)`** — wraps an async operation. sends the chat action right away,
  keeps it alive on `options.intervalMs` (default `4000`ms — under telegram's ~5s expiry), and
  clears the interval as soon as `fn()` settles. resolves/rejects to whatever `fn()` does.
- **`ctx.typing(action?)`** — the plain one-off form: sends a single chat action and resolves to
  the api's `boolean` result. defaults to `"typing"`; also takes any other
  `sendChatAction` action (`"upload_photo"`, `"record_voice"`, `"find_location"`, …).
- a failed keep-alive ping is swallowed — it's a best-effort UI touch, not something that should
  abort the operation it's decorating. observe it via `onError` instead of a thrown exception.
- an update with no chat (e.g. `inline_query`) can't show an indicator: the one-off form rejects
  (there's nothing to send), the `fn` form just runs `fn()` plain — the operation itself still
  matters even without a chat to animate.

## options

```ts
bot.install(
	typing({
		action: "typing", // default chat action, overridable per call
		intervalMs: 4000, // re-send cadence, in ms — stay under telegram's ~5s expiry
		onError: (error) => logger.warn("typing keep-alive failed", error),
	}),
);

// per-call overrides win over the plugin's defaults:
await ctx.typing(() => generateImage(prompt), { action: "upload_photo" });
```

---

part of [**yaebal**](https://github.com/neverlane/yaebal) — a type-safe, runtime-agnostic Telegram Bot API framework. MIT.
