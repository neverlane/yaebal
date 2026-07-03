# @yaebal/example-onboarding (a runnable bot)

a focused bot that demonstrates `@yaebal/onboarding`: typed flow builder, inline next
and exit buttons, completion hooks, status commands, global opt-out and force restart.

## running

```sh
cp examples/onboarding/.env.example examples/onboarding/.env   # then add your token
pnpm --filter @yaebal/example-onboarding dev                  # reloads on change
```

- dev with reload: `pnpm --filter @yaebal/example-onboarding dev`
- run once: `pnpm --filter @yaebal/example-onboarding start`

both load `examples/onboarding/.env`. on start the bot registers its command menu with
telegram, so the commands below show up in the `/` picker.

## environment variables

| name        | example           | description                                                                               |
|:------------|:------------------|:------------------------------------------------------------------------------------------|
| `BOT_TOKEN` | `123456:aa-bc...` | bot token from [@BotFather](https://t.me/BotFather). required - the bot exits without it. |

## commands the example bot answers

| command    | what it shows                                     |
|:-----------|:--------------------------------------------------|
| `/start`   | starts or resumes the onboarding flow             |
| `/tour`    | force-restarts the tour from the first step        |
| `/status`  | reads `ctx.onboarding.welcome` state              |
| `/disable` | calls `ctx.onboarding.disableAll()`               |
| `/enable`  | calls `ctx.onboarding.enableAll()` and undismisses |
| `/exit`    | leaves the active tour                            |

the flow stores completion, dismissal and opt-out state in memory for the local demo.

---

part of [**yaebal**](https://github.com/neverlane/yaebal) - a type-safe, runtime-agnostic Telegram Bot API framework. MIT.
