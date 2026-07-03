# @yaebal/example-throttle

runnable bot showing `@yaebal/throttle`: global/private/group buckets, per-method priorities, request cancellation and metrics.

## running

```sh
cp examples/throttle/.env.example examples/throttle/.env
pnpm --filter @yaebal/example-throttle dev
```

## environment variables

| name         | example              | description                                                                               |
|:-------------|:---------------------|:------------------------------------------------------------------------------------------|
| `BOT_TOKEN`  | `123456:AA-bc...`    | bot token from [@BotFather](https://t.me/BotFather). required — the bot exits without it. |

## commands the example bot answers

| command     | what it does                                                 |
|:------------|:-------------------------------------------------------------|
| `/start`    | explains the example                                         |
| `/burst`    | queues multiple messages through the per-chat bucket         |
| `/priority` | queues low-priority work and an urgent high-priority message |
| `/cancel`   | queues a request and aborts it before it drains              |
| `/metrics`  | prints live throttle metrics                                 |

---

part of [**yaebal**](https://github.com/neverlane/yaebal) - a type-safe, runtime-agnostic Telegram Bot API framework. MIT.
