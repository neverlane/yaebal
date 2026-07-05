# @yaebal/example-dialog-quest (a runnable bot)

a role-playing support bot with multiple dialog styles in one place: morda menus,
persistent scenes, one-shot prompts, coroutine conversations and session-backed profile state.

## running

```sh
cp examples/dialog-quest/.env.example examples/dialog-quest/.env   # then add your token
pnpm --filter @yaebal/example-dialog-quest dev                     # reloads on change
```

- dev with reload: `pnpm --filter @yaebal/example-dialog-quest dev`
- run once: `pnpm --filter @yaebal/example-dialog-quest start`

both load `examples/dialog-quest/.env`. on start the bot registers its command menu with
telegram, so the commands below show up in the `/` picker.

## environment variables

| name        | example           | description                                                                               |
|:------------|:------------------|:------------------------------------------------------------------------------------------|
| `BOT_TOKEN` | `123456:AA-bc...` | bot token from [@BotFather](https://t.me/BotFather). required - the bot exits without it. |

## commands the example bot answers

| command    | what it shows                                      |
|:-----------|:---------------------------------------------------|
| `/start`   | opens the morda cockpit menu                       |
| `/quest`   | starts the scene wizard                            |
| `/support` | starts the await-style conversation flow           |
| `/rename`  | asks one prompt and saves the next answer          |
| `/profile` | shows saved session profile state                  |
| `/cancel`  | leaves the active scene or conversation            |

the cockpit buttons demonstrate stack navigation and rerender, while long-running flows stay
behind explicit commands so callback handlers remain quick.

---

part of [**yaebal**](https://github.com/neverlane/yaebal) - a type-safe, runtime-agnostic Telegram Bot API framework. MIT.
