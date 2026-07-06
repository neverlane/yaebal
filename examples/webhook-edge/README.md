# @yaebal/example-webhook-edge (a runnable bot)

a webhook-first bot that exports a fetch handler for edge runtimes and starts a tiny node
http adapter for local development. deliberately built on bare `@yaebal/core` — one of the
minimal-layer examples (see [core-echo](../core-echo/)).

## running

```sh
cp examples/webhook-edge/.env.example examples/webhook-edge/.env   # then add your token
pnpm --filter @yaebal/example-webhook-edge dev                     # reloads on change
```

- dev with reload: `pnpm --filter @yaebal/example-webhook-edge dev`
- run once: `pnpm --filter @yaebal/example-webhook-edge start`

both load `examples/webhook-edge/.env`. set `PUBLIC_URL` to an https tunnel url if you want
startup to call `setWebhook` automatically.

## environment variables

| name             | example                 | description                                                                               |
|:-----------------|:------------------------|:------------------------------------------------------------------------------------------|
| `BOT_TOKEN`      | `123456:aa-bc...`       | bot token from [@BotFather](https://t.me/BotFather). required - the bot exits without it. |
| `WEBHOOK_SECRET` | `dev-secret`            | secret checked against `x-telegram-bot-api-secret-token`. defaults to `dev-secret`.       |
| `PORT`           | `8080`                  | local http server port. defaults to `8080`.                                               |
| `PUBLIC_URL`     | `https://example.ngrok` | optional public https base url used for `setWebhook`.                                     |

## commands the example bot answers

| command or update | what it shows                                      |
|:------------------|:---------------------------------------------------|
| `/start`          | sends a webhook demo message with an inline button |
| `/where`          | confirms the update came through a fetch handler   |
| `/deletewebhook`  | calls `deleteWebhook`                              |
| `edge:pong`       | answers a callback over the webhook path           |

the module exports `fetch` and `default = { fetch }`, so workers-style runtimes can import
the same source and skip long polling.

---

part of [**yaebal**](https://github.com/neverlane/yaebal) - a type-safe, runtime-agnostic Telegram Bot API framework. MIT.
