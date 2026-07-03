# @yaebal/example-again (a runnable bot)

a focused bot that shows `@yaebal/again`: awaited retries, structured `retry_after`,
retry metrics, bounded retry budget and final error handling.

## running

```sh
cp examples/again/.env.example examples/again/.env   # then add your token
pnpm --filter @yaebal/example-again dev              # reloads on change
```

- dev with reload: `pnpm --filter @yaebal/example-again dev`
- run once: `pnpm --filter @yaebal/example-again start`

both load `examples/again/.env`. this example does not need external services beyond
telegram itself.

## environment variables

| name        | example           | description                                                                              |
|:------------|:------------------|:-----------------------------------------------------------------------------------------|
| `BOT_TOKEN` | `123456:AA-bc...` | bot token from [@BotFather](https://t.me/BotFather). required - the bot exits without it. |

## commands the example bot answers

| command  | what it shows                                                                       |
|:---------|:------------------------------------------------------------------------------------|
| `/start` | explains the retry demo                                                             |
| `/burst` | sends many messages; any telegram flood-wait is retried by `@yaebal/again`          |
| `/stats` | prints retry counters collected from the `onRetry` hook                             |

the error handler distinguishes `TelegramError` from handler failures and replies when
all retry attempts are exhausted.

---

part of [**yaebal**](https://github.com/neverlane/yaebal) - a type-safe, runtime-agnostic Telegram Bot API framework. MIT.
