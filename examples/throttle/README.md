# @yaebal/example-throttle (a runnable bot)

a focused bot that shows `@yaebal/throttle`: global/private/group buckets,
per-method priorities, request cancellation, retry-after learning and live metrics.

## running

```sh
cp examples/throttle/.env.example examples/throttle/.env   # then add your token
pnpm --filter @yaebal/example-throttle dev                 # reloads on change
```

- dev with reload: `pnpm --filter @yaebal/example-throttle dev`
- run once: `pnpm --filter @yaebal/example-throttle start`

both load `examples/throttle/.env`. this example is intentionally noisy so you can see
queueing and bucket behavior in chat and in logs.

## environment variables

| name        | example           | description                                                                               |
|:------------|:------------------|:------------------------------------------------------------------------------------------|
| `BOT_TOKEN` | `123456:aa-bc...` | bot token from [@BotFather](https://t.me/BotFather). required - the bot exits without it. |

## commands the example bot answers

| command     | what it shows                                                 |
|:------------|:--------------------------------------------------------------|
| `/start`    | explains the outbound scheduler demo                          |
| `/burst`    | queues multiple messages through the per-chat bucket           |
| `/priority` | queues low-priority work and one urgent high-priority message  |
| `/cancel`   | queues a request and aborts it before it drains                |
| `/metrics`  | prints live throttle metrics                                   |

the bot installs `@yaebal/again` after the throttle transport, so learned flood waits are
handled together with bounded api retry.

---

part of [**yaebal**](https://github.com/neverlane/yaebal) - a type-safe, runtime-agnostic Telegram Bot API framework. MIT.
