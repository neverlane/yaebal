# @yaebal/example-cron (a runnable bot)

a focused bot that shows `@yaebal/cron` end to end: a plain interval job, a schedule with
timezones, retries with backoff and a cooperative timeout, `overlap: "wait"`, catch-up after
downtime via a persisted `@yaebal/sklad` store, `ctx.cron` reached from a regular command, and the
`cronAdmin` ops command surface.

## running

```sh
cp examples/cron/.env.example examples/cron/.env   # then add your token
pnpm --filter @yaebal/example-cron dev             # reloads on change
```

- dev with reload: `pnpm --filter @yaebal/example-cron dev`
- run once: `pnpm --filter @yaebal/example-cron start`
- stop it, wait a bit, and start it again — `digest`'s `catchUp: true` + the file-backed `store`
  means a restart doesn't silently drop a missed 09:00 run

## environment variables

| name        | example           | description                                                                                          |
|:------------|:------------------|:------------------------------------------------------------------------------------------------------|
| `BOT_TOKEN` | `123456:AA-bc...` | bot token from [@BotFather](https://t.me/BotFather). required — the bot exits without it.              |
| `ADMIN_ID`  | `123456789`       | your telegram user id. optional — gates `/cron`; unset means everyone can use it (fine for this demo). |

## commands the example bot answers

| command       | what it shows                                                                                     |
|:--------------|:-----------------------------------------------------------------------------------------------------|
| `/start`      | lists the demo commands                                                                            |
| `/run-digest` | `ctx.cron.trigger("digest")` — runs it now, bypassing its schedule, without disturbing the schedule |
| `/state`      | every job's `runs`/`failures`/`nextRunAt`, read straight off `ctx.cron.states()`                    |
| `/cron`       | `cronAdmin`'s ops surface: lists every job; `run`/`pause`/`resume`/`next <name>`                     |

## jobs registered

| job           | schedule                | demonstrates                                                                     |
|:--------------|:-------------------------|:-----------------------------------------------------------------------------------|
| `heartbeat`   | every 10s                | the plain interval form — fires on its own, watch the terminal                    |
| `flaky-sync`  | every 15s                | `retries` + `retryDelayMs` backoff, `timeoutMs`, `overlap: "wait"` — fails ~50% of the time on purpose |
| `digest`      | `0 9 * * *` (Moscow time) | per-job `tz`, `catchUp` + a persisted `store` (`@yaebal/sklad`'s `fileStorage`)     |

the terminal logs every scheduler event via `onEvent` — `[cron] run_started {...}` — so you can
watch retries, timeouts, and catch-up firing in real time as `heartbeat`/`flaky-sync` tick on
their own.

---

part of [**yaebal**](https://github.com/neverlane/yaebal) - a type-safe, runtime-agnostic Telegram Bot API framework. MIT.
