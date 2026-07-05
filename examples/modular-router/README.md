# @yaebal/example-modular-router (a runnable bot)

a file-based bot layout for bigger projects. route files under `src/routes/commands` and
`src/routes/on` are loaded at startup and registered on the bot.

## running

```sh
cp examples/modular-router/.env.example examples/modular-router/.env   # then add your token
pnpm --filter @yaebal/example-modular-router dev                       # reloads on change
```

- dev with reload: `pnpm --filter @yaebal/example-modular-router dev`
- run once: `pnpm --filter @yaebal/example-modular-router start`

both load `examples/modular-router/.env`. on start the bot registers its command menu with
telegram, so the commands below show up in the `/` picker.

## environment variables

| name        | example           | description                                                                               |
|:------------|:------------------|:------------------------------------------------------------------------------------------|
| `BOT_TOKEN` | `123456:aa-bc...` | bot token from [@BotFather](https://t.me/BotFather). required - the bot exits without it. |

## commands the example bot answers

| command or update         | what it shows                                      |
|:--------------------------|:---------------------------------------------------|
| `/start`                  | route-loaded intro with inline buttons             |
| `/help`                   | route-loaded help text                             |
| `message:text`            | route-loaded text echo for non-command messages    |
| `callback_query:data`     | route-loaded callback handler                      |

file names map to routes: `commands/start.ts` becomes `/start`, and
`on/message.text.ts` becomes `on("message:text")`.

---

part of [**yaebal**](https://github.com/neverlane/yaebal) - a type-safe, runtime-agnostic Telegram Bot API framework. MIT.
