# @yaebal/example-again

runnable bot showing `@yaebal/again`: awaited retries, structured `retry_after`, retry metrics and final error handling.

## running

```sh
cp examples/again/.env.example examples/again/.env
pnpm --filter @yaebal/example-again dev
```

## environment variables

| name         | example              | description                                                                               |
|:-------------|:---------------------|:------------------------------------------------------------------------------------------|
| `BOT_TOKEN`  | `123456:AA-bc...`    | bot token from [@BotFather](https://t.me/BotFather). required — the bot exits without it. |

## commands the example bot answers

| command  | what it does                                                                       |
|:---------|:-----------------------------------------------------------------------------------|
| `/start` | explains the example                                                               |
| `/burst` | sends many messages sequentially, so any Telegram flood-wait is retried by `again` |
| `/stats` | prints retry counters collected from `onRetry`                                     |

---

part of [**yaebal**](https://github.com/neverlane/yaebal) - a type-safe, runtime-agnostic Telegram Bot API framework. MIT.
