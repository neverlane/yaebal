# @yaebal/example-tgcloud (a runnable bot)

an echo bot that also remembers a per-chat counter, built so the same source runs two ways:
long polling on your machine, and [telegram serverless](https://core.telegram.org/bots/serverless)
with no npm at runtime. `@yaebal/tgcloud` is the build step, not a plugin the bot installs.

## running locally

```sh
cp examples/tgcloud/.env.example examples/tgcloud/.env   # then add your token
pnpm --filter @yaebal/example-tgcloud dev                # reloads on change
```

- dev with reload: `pnpm --filter @yaebal/example-tgcloud dev`
- run once: `pnpm --filter @yaebal/example-tgcloud start`

local polling has no `sdk`, so `/count`, the echo and the button throw when they touch the
database. `/start` still answers. the database is the serverless one.

## deploying

turn serverless on for the bot in [@BotFather](https://t.me/BotFather) first.

```sh
pnpm --filter @yaebal/example-tgcloud build
cd examples/tgcloud
npx tgcloud login      # botfather → serverless → cli access, not the bot token
npx tgcloud push
npx tgcloud migrate    # creates the counters table; push never does this itself
```

`build` writes three files:

| file | what it is |
|:--|:--|
| `tgcloud/handlers/message.js` | the bot, bundled, for messages |
| `tgcloud/handlers/callback_query.js` | the same bot, bundled, for the button |
| `tgcloud/schema.js` | the `counters` table, copied as-is so the platform can migrate it |

the handler bundles import `sdk` and `sdk/db` and nothing else. `ctx.reply()` goes through
`sdk.api`; `bump()` goes through `sdk`'s sqlite. try a handler without deploying:

```sh
npx tgcloud run handlers/message '{ chat: { id: 1 }, text: "hi" }'
```

## commands the example bot answers

| command or update | what it shows |
|:--|:--|
| `/start` | the intro, plus an inline button |
| any text | echoes it back and bumps the per-chat `seen` counter |
| `/count` | the chat's echoed and ping totals |
| `ping` button | answers the callback and bumps `pings` |

---

part of [**yaebal**](https://github.com/neverlane/yaebal) - a type-safe, runtime-agnostic Telegram Bot API framework. MIT.
