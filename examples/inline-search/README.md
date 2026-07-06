# @yaebal/example-inline-search (a runnable bot)

an inline-mode bot with generated article results, pagination by offset and chosen-result
analytics. built on `@yaebal/core` plus `@yaebal/contexts` installed separately — the
"core + contexts" layering example.

## running

```sh
cp examples/inline-search/.env.example examples/inline-search/.env   # then add your token
pnpm --filter @yaebal/example-inline-search dev                      # reloads on change
```

- dev with reload: `pnpm --filter @yaebal/example-inline-search dev`
- run once: `pnpm --filter @yaebal/example-inline-search start`

both load `examples/inline-search/.env`. enable inline mode in botfather, then type
`@your_bot query` in any chat.

## environment variables

| name        | example           | description                                                                               |
|:------------|:------------------|:------------------------------------------------------------------------------------------|
| `BOT_TOKEN` | `123456:AA-bc...` | bot token from [@BotFather](https://t.me/BotFather). required - the bot exits without it. |

## commands the example bot answers

| command or update      | what it shows                                      |
|:-----------------------|:---------------------------------------------------|
| `/start`               | explains how to use inline mode                    |
| `inline_query`         | returns generated article results with next offset |
| `chosen_inline_result` | logs chosen-result analytics                       |

bare core has no per-update contexts — they live in `@yaebal/contexts`, a separate install on
top of it. the handlers wrap the raw update with `contextFor("inline_query", ctx.api, ctx.update)`
and get the generated shortcuts: `inline.answer(results, extra)` fills `inline_query_id` itself,
and payload fields (`inline.query`, `chosen.result_id`, `chosen.senderId`) come typed. the
[`yaebal`](https://yaebal.mom/docs/yaebal/) meta package does this wiring automatically via
`createBot()`; a raw `ctx.api.call("answerInlineQuery", …)` always remains as the escape hatch
(see [core-echo](../core-echo/)).

---

part of [**yaebal**](https://github.com/neverlane/yaebal) - a type-safe, runtime-agnostic Telegram Bot API framework. MIT.
