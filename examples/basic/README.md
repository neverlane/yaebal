# @yaebal/example-basic (a runnable bot)

a single-file bot that wires up the whole yaebal stack — session, dialogs (morda),
i18n, scenes, prompt, keyboards, typed callback data, media, retry and throttle — as a
smoke test of the public api.

## running

```sh
cp examples/basic/.env.example examples/basic/.env   # then add your token
pnpm --filter @yaebal/example-basic dev              # reloads on change
```

- dev with reload: `pnpm --filter @yaebal/example-basic dev`
- run once: `pnpm --filter @yaebal/example-basic start`

both load `examples/basic/.env`. on start the bot registers its command menu with
telegram, so the commands below show up in the `/` picker.

## environment variables

| name         | example           | description                                                                               |
|:-------------|:------------------|:------------------------------------------------------------------------------------------|
| `BOT_TOKEN`  | `123456:AA-bc...` | bot token from [@BotFather](https://t.me/BotFather). required — the bot exits without it. |

## commands the example bot answers

| command     | what it shows                                                           |
|:------------|:------------------------------------------------------------------------|
| `/start`    | a formatted greeting with an inline keyboard (keyboard + callback-data) |
| `/count`    | a per-chat counter (session)                                            |
| `/menu`     | a two-window dialog with stack navigation (morda)                       |
| `/photo`    | sends a photo by url (media)                                            |
| `/lang`     | toggles the locale and replies in it (i18n)                             |
| `/register` | a name → age wizard (scenes)                                            |
| `/name`     | asks once and handles the reply (prompt)                                |
| `/help`     | lists every command (filters + fmt html)                               |

it also reacts to plain messages: `ping` → `pong` (`hears`), anything starting with
`hello` is echoed back bold (filters + fmt), and any other text is echoed.

---

part of [**yaebal**](https://github.com/neverlane/yaebal) — a type-safe, runtime-agnostic Telegram Bot API framework. MIT.
