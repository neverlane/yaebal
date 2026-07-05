# @yaebal/example-runner-workers (a runnable bot)

a high-throughput bot using `@yaebal/runner` for concurrent polling plus
`@yaebal/workers` for cpu-heavy work in worker threads.

## running

```sh
cp examples/runner-workers/.env.example examples/runner-workers/.env   # then add your token
pnpm --filter @yaebal/example-runner-workers dev                       # reloads on change
```

- dev with reload: `pnpm --filter @yaebal/example-runner-workers dev`
- run once: `pnpm --filter @yaebal/example-runner-workers start`

both load `examples/runner-workers/.env`. this bot is driven by `run(bot, ...)` instead of
`bot.start()` so unrelated chats can be processed concurrently.

## environment variables

| name               | example           | description                                                                               |
|:-------------------|:------------------|:------------------------------------------------------------------------------------------|
| `BOT_TOKEN`        | `123456:aa-bc...` | bot token from [@BotFather](https://t.me/BotFather). required - the bot exits without it. |
| `WORKER_POOL_SIZE` | `2`               | optional number of worker threads. defaults to `2`.                                       |

## commands the example bot answers

| command       | what it shows                                      |
|:--------------|:---------------------------------------------------|
| `/start`      | runner status and worker pool size                 |
| `/hash text`  | runs sha256 in a worker                            |
| `/score text` | runs a fake cpu-heavy score in a worker            |
| `/fanout`     | queues several outgoing messages from one update   |

the runner keeps updates from the same chat ordered while other chats can run in parallel.

---

part of [**yaebal**](https://github.com/neverlane/yaebal) - a type-safe, runtime-agnostic Telegram Bot API framework. MIT.
