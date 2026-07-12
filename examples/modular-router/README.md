# @yaebal/example-modular-router (a runnable bot)

a file-based bot layout for bigger projects, using `@yaebal/router`'s typed `define*()` route
files: `src/routes/commands/`, `src/routes/on/`, `src/routes/hears/`, and `src/routes/use/` are
loaded and registered on the bot at startup — `src/router.ts` binds the `define*` helpers to this
bot's own context type, so route files get full narrowing with zero per-call generics.

## running

```sh
cp examples/modular-router/.env.example examples/modular-router/.env   # then add your token
pnpm --filter @yaebal/example-modular-router dev                       # routes hot-reload
```

- dev with route hot-reload: `pnpm --filter @yaebal/example-modular-router dev` — uses
  `watchRoutes()`, so editing anything under `src/routes/` takes effect without restarting the
  process. editing `src/index.ts`/`src/bot.ts`/`src/router.ts` themselves still needs a manual
  restart — only route files are watched.
- run once, no watching: `pnpm --filter @yaebal/example-modular-router start` — plain
  `loadRoutes()`, the one to use in production.

both load `examples/modular-router/.env`. on start the bot syncs its command menu with telegram
via `loadRoutes(..., { syncCommands: true })` (the optional `@yaebal/commands` bridge), so the
commands below show up in the `/` picker with no separate `setMyCommands` call.

## environment variables

| name        | example           | description                                                                               |
|:------------|:------------------|:------------------------------------------------------------------------------------------|
| `BOT_TOKEN` | `123456:aa-bc...` | bot token from [@BotFather](https://t.me/BotFather). required - the bot exits without it. |

## what the example bot answers

| command or update      | route file                                | shows                                       |
|:------------------------|:-------------------------------------------|:---------------------------------------------|
| `/start`                | `commands/start.ts`                        | intro with inline buttons                    |
| `/help`, `/h`           | `commands/help.ts`                         | a menu-alias command and a route map         |
| `/whoami`               | `commands/admin/whoami.ts`                 | admin-only route, gated by a nested `_guard.ts` |
| `"ping"` (any message)  | `hears/ping.ts`                            | a `hears()` text match                       |
| any other text          | `on/message.text.ts`                       | a route-loaded text echo                     |
| the inline buttons      | `on/callback_query.data.ts`                | a route-loaded callback handler              |
| every update             | `use/logger.ts`                            | a plain middleware file, logged to the console |

file names map to routes: `commands/start.ts` becomes `/start`, `on/message.text.ts` becomes
`on("message:text")`, and `commands/admin/_guard.ts` gates every route under `commands/admin/`
(just `whoami.ts` here).

---

part of [**yaebal**](https://github.com/neverlane/yaebal) - a type-safe, runtime-agnostic Telegram Bot API framework. MIT.
