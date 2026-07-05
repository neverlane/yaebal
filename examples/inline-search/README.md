# @yaebal/example-inline-search (a runnable bot)

an inline-mode bot with generated article results, pagination by offset and chosen-result
analytics.

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

the bot uses `api.call("answerInlineQuery")` directly, so new inline-mode fields can be used
without waiting for higher-level sugar.

---

part of [**yaebal**](https://github.com/neverlane/yaebal) - a type-safe, runtime-agnostic Telegram Bot API framework. MIT.
