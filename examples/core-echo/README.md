# @yaebal/example-core-echo (a runnable bot)

the smallest possible yaebal bot: bare `@yaebal/core` and nothing else. middleware chain,
filter-query narrowing, `ctx.send`/`ctx.reply`, entity `format` helpers and the raw typed
`api.call` passthrough — no plugins, no generated contexts.

## running

```sh
cp examples/core-echo/.env.example examples/core-echo/.env   # then add your token
pnpm --filter @yaebal/example-core-echo dev                  # reloads on change
```

- dev with reload: `pnpm --filter @yaebal/example-core-echo dev`
- run once: `pnpm --filter @yaebal/example-core-echo start`

## environment variables

| name        | example           | description                                                                               |
|:------------|:------------------|:------------------------------------------------------------------------------------------|
| `BOT_TOKEN` | `123456:AA-bc...` | bot token from [@BotFather](https://t.me/BotFather). required - the bot exits without it. |

## commands the example bot answers

| command or update | what it shows                                              |
|:------------------|:-----------------------------------------------------------|
| `/start`          | entity-based `format` helpers built into core              |
| `/me`             | typed api client methods (`api.getMe()`)                   |
| `/react`          | raw `api.call("setMessageReaction")` — the passthrough     |
| any text          | `derive` typing flow + `message:text` filter narrowing     |

core deliberately ships without per-update context classes. the `/react` handler spells out
`chat_id` and `message_id` by hand — install [`@yaebal/contexts`](../inline-search/) on top of
core (or use the [`yaebal`](https://yaebal.mom/docs/yaebal/) meta package) and that becomes
`ctx.react("👍")`.

---

part of [**yaebal**](https://github.com/neverlane/yaebal) - a type-safe, runtime-agnostic Telegram Bot API framework. MIT.
