# @yaebal/example-commands (a runnable bot)

a focused bot that tours every `@yaebal/commands` feature: a typed command registry
(handlers see the session context and `ctx.command` / `ctx.args`), localized menu
descriptions, an admin-scoped menu, aliases, hidden commands, menu-only entries, and
diff-based menu sync on startup.

## running

```sh
cp examples/commands/.env.example examples/commands/.env   # then add your token
pnpm --filter @yaebal/example-commands dev                 # reloads on change
```

- dev with reload: `pnpm --filter @yaebal/example-commands dev`
- run once: `pnpm --filter @yaebal/example-commands start`

both load `examples/commands/.env`. on start the bot `sync()`s its command menus with
telegram — only menus that actually changed are pushed, so restarts don't hammer
`setMyCommands`.

## environment variables

| name        | example           | description                                                                               |
|:------------|:------------------|:------------------------------------------------------------------------------------------|
| `BOT_TOKEN` | `123456:AA-bc...` | bot token from [@BotFather](https://t.me/BotFather). required - the bot exits without it. |

## commands the example bot answers

| command      | what it shows                                                                            |
|:-------------|:-----------------------------------------------------------------------------------------|
| `/start`     | typed handler; `/go` is an alias that never shows in the menu                            |
| `/echo a b`  | `ctx.args` parsing                                                                       |
| `/stats`     | the registry handler reading the typed session context                                   |
| `/help`      | `cmd.list({ languageCode })` — the menu as text, localized per user                      |
| `/about`     | a menu-only entry: the description lives in the registry, the handler on the bot chain   |
| `/pin_rules` | scoped to `all_chat_administrators` — only group admins see it in their `/` menu         |
| `/debug`     | hidden — handled but absent from every menu                                              |
| `/menu`      | hidden lifecycle demo: `/menu` syncs, `/menu push` registers, `/menu clear` unregisters  |

set your telegram client to russian to see the localized (`ru`) menu descriptions.

---

part of [**yaebal**](https://github.com/neverlane/yaebal) - a type-safe, runtime-agnostic Telegram Bot API framework. MIT.
