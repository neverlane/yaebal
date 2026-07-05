# @yaebal/example-broadcast (a runnable bot)

a focused bot that demonstrates `@yaebal/broadcast`: users subscribe, an admin queues a
typed broadcast job, then checks progress, pauses, resumes or cancels it.

## running

```sh
cp examples/broadcast/.env.example examples/broadcast/.env   # then add your token
pnpm --filter @yaebal/example-broadcast dev                  # reloads on change
```

- dev with reload: `pnpm --filter @yaebal/example-broadcast dev`
- run once: `pnpm --filter @yaebal/example-broadcast start`

both load `examples/broadcast/.env`. on start the bot registers its command menu with
telegram, so the commands below show up in the `/` picker.

## environment variables

| name        | example           | description                                                                               |
|:------------|:------------------|:------------------------------------------------------------------------------------------|
| `BOT_TOKEN` | `123456:AA-bc...` | bot token from [@BotFather](https://t.me/BotFather). required - the bot exits without it. |
| `ADMIN_ID`  | `617580375`       | optional admin user id. when empty, every user can run admin commands locally.            |

## commands the example bot answers

| command           | what it shows                                           |
|:------------------|:--------------------------------------------------------|
| `/start`          | subscribes the current chat and explains the demo       |
| `/subscribe`      | adds the current chat to the in-memory audience         |
| `/unsubscribe`    | removes the current chat from the audience              |
| `/broadcast text` | queues a typed broadcast job for all subscribers        |
| `/status`         | lists recent jobs, events and local worker metrics      |
| `/pause job_id`   | pauses a queued or running job                          |
| `/resume job_id`  | resumes a paused job                                    |
| `/cancel job_id`  | cancels a job                                           |

the example uses in-memory subscribers and broadcast job storage, so state resets on
restart. swap the storage adapter for a database or redis in production.

---

part of [**yaebal**](https://github.com/neverlane/yaebal) - a type-safe, runtime-agnostic Telegram Bot API framework. MIT.
