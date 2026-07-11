# @yaebal/example-state-machine (a runnable bot)

a focused bot that demonstrates `@yaebal/state-machine`: a typed event union driving
transitions, a guarded transition you can trip interactively (`/lockcancel` then `/cancel`),
per-state `onEnter` hooks, a mutable extended-state bag, and `reset()`.

## running

```sh
cp examples/state-machine/.env.example examples/state-machine/.env   # then add your token
pnpm --filter @yaebal/example-state-machine dev                      # reloads on change
```

- dev with reload: `pnpm --filter @yaebal/example-state-machine dev`
- run once: `pnpm --filter @yaebal/example-state-machine start`

both load `examples/state-machine/.env`. on start the bot registers its command menu with
telegram, so the commands below show up in the `/` picker.

## environment variables

| name        | example           | description                                                                               |
|:------------|:------------------|:------------------------------------------------------------------------------------------|
| `BOT_TOKEN` | `123456:aa-bc...` | bot token from [@BotFather](https://t.me/BotFather). required - the bot exits without it. |

## commands the example bot answers

| command       | what it shows                                              |
|:--------------|:-------------------------------------------------------------|
| `/start`      | lists the available commands                                |
| `/status`     | reads `ctx.machine.state` and `ctx.machine.context`          |
| `/pay`        | sends the `PAY` event (`created` → `paid`)                   |
| `/ship`       | sends the `SHIP` event (`paid` → `shipped`)                  |
| `/deliver`    | sends the `DELIVER` event (`shipped` → `delivered`)          |
| `/cancel`     | sends the `CANCEL` event - rejected by a guard once locked   |
| `/lockcancel` | flips `ctx.machine.context.cancelLocked`, so the next `/cancel` is guard-rejected |
| `/reset`      | calls `ctx.machine.reset()`, back to `created`               |

the order state and context live in memory for this local demo — swap `stateMachine`'s
`storage` option for any `@yaebal/sklad` adapter to persist across restarts.

---

part of [**yaebal**](https://github.com/neverlane/yaebal) - a type-safe, runtime-agnostic Telegram Bot API framework. MIT.
