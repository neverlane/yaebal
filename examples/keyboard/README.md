# @yaebal/example-keyboard (a runnable bot)

a focused bot that tours every `@yaebal/keyboard` feature: inline and reply keyboards,
every button type, styling, dynamic buttons, request user/chat/managed-bot, remove and
force-reply helpers.

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

| name        | example           | description                                                                               |
|:------------|:------------------|:------------------------------------------------------------------------------------------|
| `BOT_TOKEN` | `123456:AA-bc...` | bot token from [@BotFather](https://t.me/BotFather). required - the bot exits without it. |

## commands the example bot answers

| command    | what it shows                                                                                         |
|:-----------|:------------------------------------------------------------------------------------------------------|
| `/start`   | `text`, `style`, `row`, `url` and builder-as-`reply_markup` basics                                     |
| `/gallery` | remaining inline buttons: `webApp`, `login`, `switchInline*`, `copyText`                              |
| `/grid`    | buttons built from an array with `add()`, `InlineKeyboard.text()` and `columns(3)`                     |
| `/contact` | reply keyboard with contact, location, poll and web app request buttons                               |
| `/profile` | reply keyboard with user, chat and managed-bot request buttons                                        |
| `/hide`    | `Keyboard.remove()`                                                                                   |
| `/ask`     | `Keyboard.forceReply()` plus a handler that recognizes the reply                                      |
| `/help`    | lists every command                                                                                   |

it also reacts to contact, location, poll, `users_shared`, `chat_shared`,
`managed_bot_created`, the `managed_bot` update and any other plain text.

---

part of [**yaebal**](https://github.com/neverlane/yaebal) - a type-safe, runtime-agnostic Telegram Bot API framework. MIT.
