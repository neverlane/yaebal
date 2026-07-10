# @yaebal/example-session (a runnable bot)

a focused bot that shows `@yaebal/session` v2 end to end: dirty-checked saves you can watch in
the terminal, file-backed persistence from `@yaebal/sklad`, two independent sessions (per-chat +
per-user via `keyBy.user`), self-expiring `ttl()` fields, `clearSession`, and schema migrations.

## running

```sh
cp examples/session/.env.example examples/session/.env   # then add your token
pnpm --filter @yaebal/example-session dev                # reloads on change
```

- dev with reload: `pnpm --filter @yaebal/example-session dev`
- run once: `pnpm --filter @yaebal/example-session start`

sessions are persisted to `examples/session/data/*.json` — restart the bot and `/count`
keeps counting. delete the files to start clean.

## environment variables

| name        | example           | description                                                                              |
|:------------|:------------------|:-----------------------------------------------------------------------------------------|
| `BOT_TOKEN` | `123456:AA-bc...` | bot token from [@BotFather](https://t.me/BotFather). required - the bot exits without it. |

## commands the example bot answers

| command  | what it shows                                                                        |
|:---------|:--------------------------------------------------------------------------------------|
| `/start` | lists the demo commands                                                              |
| `/count` | per-chat counter — the terminal logs exactly one storage write                       |
| `/noop`  | reads the session without changing it — the terminal logs **no** write (dirty-check) |
| `/me`    | per-user counter in a second session (`key: "profile"`, `getKey: keyBy.user`)        |
| `/otp`   | stores a `ttl()`-wrapped code that expires after 30 seconds                          |
| `/check` | reads the code with `unwrapTtl` — valid → the code, expired → gone                   |
| `/reset` | `clearSession()` on both sessions: records deleted, state back to `initial()`        |

the chat session also carries a `migrations` block — if you ran an older shape of this bot,
its records upgrade in place on first read.

for handlers that rarely touch the session, swap `session` for `lazySession` and
`await ctx.session` — storage isn't read at all on the other paths.

---

part of [**yaebal**](https://github.com/neverlane/yaebal) - a type-safe, runtime-agnostic Telegram Bot API framework. MIT.
