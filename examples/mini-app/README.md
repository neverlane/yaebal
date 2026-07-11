# @yaebal/example-mini-app (a runnable bot)

a tour of `@yaebal/mini-app`: HMAC and Ed25519 `initData` validation, a mini app's own http
backend (`Authorization: tma` header), `answerWebAppQuery`, `web_app_data`, and the direct/
attachment-menu link builders.

## running

```sh
cp examples/mini-app/.env.example examples/mini-app/.env   # then add your token
pnpm --filter @yaebal/example-mini-app dev                 # reloads on change
```

- dev with reload: `pnpm --filter @yaebal/example-mini-app dev`
- run once: `pnpm --filter @yaebal/example-mini-app start`

both load `examples/mini-app/.env`. on start the bot registers its command menu with telegram,
so the commands below show up in the `/` picker — and a tiny standalone `node:http` server comes
up alongside it, standing in for the mini app's own backend.

## environment variables

| name            | example                     | description                                                                               |
|:----------------|:-----------------------------|:-------------------------------------------------------------------------------------------|
| `BOT_TOKEN`     | `123456:aa-bc...`             | bot token from [@BotFather](https://t.me/BotFather). required — the bot exits without it. |
| `MINI_APP_URL`  | `https://example.com/app`     | your deployed (https) mini app. optional — defaults to a placeholder that opens telegram's "app not found" screen. |
| `BACKEND_PORT`  | `8787`                        | port for the mini app backend demo. optional, defaults to `8787`.                         |

## commands the example bot answers

| command      | what it shows                                                                 |
|:-------------|:--------------------------------------------------------------------------------|
| `/start`     | opens the mini app via an inline `web_app` button                              |
| `/menubutton`| sets this chat's persistent menu button to open the mini app                   |
| `/demo`      | signs a synthetic `initData` (`ctx.miniApp.sign`) and validates it — no real mini app frontend needed |
| `/check`     | validates a real `initData` you paste, HMAC-style (`ctx.miniApp.validate`)     |
| `/check3rd`  | validates the same payload with Ed25519 — no bot token involved (`ctx.miniApp.validateThirdParty`) |
| `/answer`    | `answerWebAppQuery` for a pasted `query_id`                                    |
| `/links`     | prints a `miniAppLink` (direct) and `attachMenuLink` (attachment menu) for this bot |
| `/help`      | lists every command                                                            |

sending `message:web_app_data` (from `Telegram.WebApp.sendData()`) is also handled — the bot
echoes back the parsed payload and the button text that triggered it.

## the mini app backend demo

a mini app almost always talks to its own http backend, not a bot update — the bot starts a
tiny `node:http` server on `BACKEND_PORT` (default `8787`) that validates the
`Authorization: tma <initData>` header via `validateAuthHeader`:

```sh
curl -H "Authorization: tma $(cat initdata.txt)" http://localhost:8787/me
```

grab a real `initData` string with `/demo` (synthetic, always valid) or by pasting one exported
from an actual mini app frontend. the handler is deliberately plain `node:http` — `validateAuthHeader`
takes whatever string your server gives it for the header, so the same call works unchanged in
hono, express, or any edge `fetch` handler; see the
[`@yaebal/mini-app` docs](https://yaebal.mom/docs/plugins/mini-app/) for those.

---

part of [**yaebal**](https://github.com/neverlane/yaebal) — a type-safe, runtime-agnostic Telegram Bot API framework. MIT.
