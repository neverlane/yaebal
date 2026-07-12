# @yaebal/example-auto-answer (a runnable bot)

a focused bot that tours `@yaebal/auto-answer`: the `"deadline"` default (a handler that answers
fast keeps its own alert; a handler that forgets still gets a fallback ack), `ctx.skipAutoAnswer()`
for a callback answered later from off to the side, and `filter()` for callbacks another plugin
already answers its own way.

## running

```sh
cp examples/auto-answer/.env.example examples/auto-answer/.env   # then add your token
pnpm --filter @yaebal/example-auto-answer dev                    # reloads on change
```

- dev with reload: `pnpm --filter @yaebal/example-auto-answer dev`
- run once: `pnpm --filter @yaebal/example-auto-answer start`

both load `examples/auto-answer/.env`. on start the bot registers its command menu with telegram,
so the commands below show up in the `/` picker.

## environment variables

| name        | example           | description                                                                               |
|:------------|:------------------|:------------------------------------------------------------------------------------------|
| `BOT_TOKEN` | `123456:AA-bc...` | bot token from [@BotFather](https://t.me/BotFather). required - the bot exits without it. |

## commands the example bot answers

| command   | what it shows                                                                                  |
|:----------|:-------------------------------------------------------------------------------------------------|
| `/start`  | a handler that answers well inside the deadline — its own alert reaches the client untouched     |
| `/forgot` | a handler that never calls `answerCallbackQuery` — the plugin's fallback clears the spinner anyway |
| `/queue`  | `ctx.skipAutoAnswer()`, then answering ~2s later once a simulated background job finishes         |
| `/raw`    | `filter()` excluding a callback prefix so another handler can answer it its own way               |
| `/help`   | lists every command                                                                              |

---

part of [**yaebal**](https://github.com/neverlane/yaebal) - a type-safe, runtime-agnostic Telegram Bot API framework. MIT.
