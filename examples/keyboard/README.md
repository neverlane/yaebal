# @yaebal/example-keyboard (a runnable bot)

a tour of every `@yaebal/keyboard` feature — inline and reply keyboards, every button
type, styling, dynamic buttons via `add()`/`columns()`, request user/chat/managed-bot,
and `Keyboard.remove()`/`Keyboard.forceReply()` — as a smoke test of the plugin's public api.

## running

```sh
cp examples/keyboard/.env.example examples/keyboard/.env   # then add your token
pnpm --filter @yaebal/example-keyboard dev                 # reloads on change
```

- dev with reload: `pnpm --filter @yaebal/example-keyboard dev`
- run once: `pnpm --filter @yaebal/example-keyboard start`

both load `examples/keyboard/.env`. on start the bot registers its command menu with
telegram, so the commands below show up in the `/` picker.

## environment variables

| name         | example              | description                                                                               |
|:-------------|:---------------------|:------------------------------------------------------------------------------------------|
| `BOT_TOKEN`  | `123456:AA-bc...`    | bot token from [@BotFather](https://t.me/BotFather). required — the bot exits without it. |

## commands the example bot answers

| command     | what it shows                                                                                                                                                                                                        |
|:------------|:---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `/start`    | `text`, `style`, `row`, `url` — the basics, and `reply_markup` taking the builder directly via `toJSON()`                                                                                                            |
| `/gallery`  | every remaining inline button: `webApp`, `login`, `switchInline*`, `copyText` — plus `pay`/`game`/`icon` logged to the console (they only work inside invoice/game messages, or with a real numeric custom emoji id) |
| `/grid`     | buttons built from an array with `add()` + the static `InlineKeyboard.text()`, wrapped into rows with `columns(3)`                                                                                                   |
| `/contact`  | reply keyboard: `requestContact`, `requestLocation`, `requestPoll`, `webApp`, `resized`, `oneTime`                                                                                                                   |
| `/profile`  | reply keyboard: `requestUsers`, `requestChat` (channel + group), `requestManagedBot`, `persistent`, `placeholder`, `selective`                                                                                       |
| `/hide`     | `Keyboard.remove()`                                                                                                                                                                                                  |
| `/ask`      | `Keyboard.forceReply()`, with a handler that recognizes the reply                                                                                                                                                    |
| `/help`     | lists every command                                                                                                                                                                                                  |

it also reacts to the service messages those buttons produce (contact, location, poll,
`users_shared`, `chat_shared`, `managed_bot_created`, and the `managed_bot` update), and
echoes back any other text.

---

part of [**yaebal**](https://github.com/neverlane/yaebal) — a type-safe, runtime-agnostic Telegram Bot API framework. MIT.
