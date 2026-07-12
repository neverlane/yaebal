# @yaebal/example-analytics (a runnable bot)

a focused bot that shows `@yaebal/analytics` end to end: a typed event catalog (`p.object`),
`autoTrack` auto-capturing commands/button clicks/messages with no manual `ctx.track()` calls,
`ctx.identify`, a `context()` enricher merged onto every event, multiple adapters running side by
side (`consoleAdapter` + `memoryAdapter`), and the `analyticsAdmin` ops command surface reading
straight out of that in-memory store.

## running

```sh
cp examples/analytics/.env.example examples/analytics/.env   # then add your token
pnpm --filter @yaebal/example-analytics dev                  # reloads on change
```

- dev with reload: `pnpm --filter @yaebal/example-analytics dev`
- run once: `pnpm --filter @yaebal/example-analytics start`

## environment variables

| name        | example           | description                                                                                              |
|:------------|:------------------|:----------------------------------------------------------------------------------------------------------|
| `BOT_TOKEN` | `123456:AA-bc...` | bot token from [@BotFather](https://t.me/BotFather). required — the bot exits without it.                 |
| `ADMIN_ID`  | `123456789`       | your telegram user id. optional — gates `/analytics`; unset means everyone can use it (fine for this demo). |

## commands the example bot answers

| command      | what it shows                                                                                   |
|:-------------|:---------------------------------------------------------------------------------------------------|
| `/start`     | a typed `start` event (declared, untyped properties) via `ctx.track`                              |
| `/buy`       | a typed `purchase` event — try renaming a property in `src/index.ts` and watch `tsc` catch it      |
| `/identify`  | `ctx.identify(...)` — person-level properties forwarded to any adapter that supports them          |
| `/menu`      | an inline button; clicking it auto-tracks a `callback_query` event with the button's data          |
| *any text*   | auto-tracked as `message_received` — no handler-side `ctx.track()` call needed                     |
| `/analytics` | `analyticsAdmin`'s ops surface: total events + top event names over a window (default 24h)         |

every event also prints to the console (`consoleAdapter`) as you interact, so you can watch
`autoTrack` fire alongside the manual `ctx.track`/`ctx.identify` calls in real time. `bot.onStop`
would drain any buffered adapter automatically — this demo's adapters aren't buffered, but a
production `clickhouseAdapter`/`httpAdapter` gets the same treatment with zero extra wiring.

---

part of [**yaebal**](https://github.com/neverlane/yaebal) - a type-safe, runtime-agnostic Telegram Bot API framework. MIT.
