# @yaebal/example-basic (a runnable bot)

a single-file bot that wires up the whole yaebal stack — session, dialogs (morda),
i18n, scenes, prompt, keyboards, typed callback data, media, retry and throttle — as a
smoke test of the public api.

## running

- to run a dev environment with reload, run `pnpm dev`.
- to run it once, run `pnpm start`.

both read the configuration from the environment variables below.

## environment variables

the bot reads a couple of runtime environment variables. set them in your shell before
starting (or in a `.env` your runner loads).

| name         | example              | description                                                                               |
|:-------------|:---------------------|:------------------------------------------------------------------------------------------|
| `BOT_TOKEN`  | `123456:AA-bc...`    | bot token from [@BotFather](https://t.me/BotFather). required — the bot exits without it. |

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

---

part of [**yaebal**](https://github.com/neverlane/yaebal) — a type-safe, runtime-agnostic Telegram Bot API framework. MIT.
