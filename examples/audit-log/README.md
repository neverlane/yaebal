# @yaebal/example-audit-log (a runnable bot)

a focused bot that shows `@yaebal/audit-log` end to end: default structured logging to the
terminal, secure-by-default redaction (`applyRedaction`), a `memorySink` ring buffer read back
from `/status`, a deliberately crashing handler to see the `update` event's `error` field, and the
telegram-native `auditAdmin` ops surface. set `ADMIN_CHAT_ID` to also see `chatSink` ship errors
into a chat.

## running

```sh
cp examples/audit-log/.env.example examples/audit-log/.env   # then add your token
pnpm --filter @yaebal/example-audit-log dev                  # reloads on change
```

- dev with reload: `pnpm --filter @yaebal/example-audit-log dev`
- run once: `pnpm --filter @yaebal/example-audit-log start`

## environment variables

| name             | example           | description                                                                                          |
|:-----------------|:------------------|:-------------------------------------------------------------------------------------------------------|
| `BOT_TOKEN`      | `123456:AA-bc...` | bot token from [@BotFather](https://t.me/BotFather). required — the bot exits without it.               |
| `ADMIN_ID`       | `123456789`       | your telegram user id. optional — gates `/audit`; unset means everyone can use it (fine for this demo). |
| `ADMIN_CHAT_ID`  | `123456789`       | a chat id for `chatSink`. optional — unset skips wiring it, no alerts sent anywhere.                    |

## commands the example bot answers

| command    | what it shows                                                                                    |
|:-----------|:----------------------------------------------------------------------------------------------------|
| `/start`   | lists the demo commands                                                                            |
| `/whoami`  | a normal reply — watch the terminal for the `update` and matching `api.call`/`api.result` events    |
| `/secret`  | `applyRedaction` masking a fake `secret_token`/`phone_number` before/after, side by side             |
| `/status`  | the last few audit entries, read straight out of a `memorySink` — no separate db                    |
| `/boom`    | throws inside the handler; the `update` event still logs, with `error` set, and it still propagates |
| `/audit`   | `auditAdmin`'s ops surface: received/written/filtered/sampled counts + a per-stage error breakdown  |

every event printed to the terminal is structured JSON, redacted by default, and — for the events
an update produces — correlated by a shared `correlationId`: grep the terminal for one
`correlationId` to see exactly what one `/whoami` triggered, in order.

---

part of [**yaebal**](https://github.com/neverlane/yaebal) - a type-safe, runtime-agnostic Telegram Bot API framework. MIT.
