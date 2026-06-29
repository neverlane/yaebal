# @yaebal/example-onboarding (a runnable bot)

a single-file bot that demonstrates `@yaebal/onboarding`: typed flow builder, inline next/skip/exit buttons, completion hooks, status commands, global opt-out, and force-restarting a completed tour.

## running

```sh
cp examples/onboarding/.env.example examples/onboarding/.env   # then add your token
pnpm --filter @yaebal/example-onboarding dev                  # reloads on change
```

- dev with reload: `pnpm --filter @yaebal/example-onboarding dev`
- run once: `pnpm --filter @yaebal/example-onboarding start`

## environment variables

| name        | example           | description                                                                               |
|:------------|:------------------|:------------------------------------------------------------------------------------------|
| `BOT_TOKEN` | `123456:AA-bc...` | bot token from [@BotFather](https://t.me/BotFather). required - the bot exits without it. |

## commands

| command     | what it shows                                      |
|:------------|:---------------------------------------------------|
| `/start`    | starts or resumes the onboarding flow              |
| `/tour`     | force-restarts the tour from the first step         |
| `/status`   | reads `ctx.onboarding.welcome.status/currentStep`  |
| `/disable`  | calls `ctx.onboarding.disableAll()`                |
| `/enable`   | calls `ctx.onboarding.enableAll()`                 |
| `/exit`     | calls `ctx.onboarding.welcome.exit()`              |

---

part of [**yaebal**](https://github.com/neverlane/yaebal) - a type-safe, runtime-agnostic Telegram Bot API framework. MIT.
