# @yaebal/example-testing-lab (a runnable bot)

a bot designed to be tested. it exports a composer factory, runs as a normal polling bot,
and ships `node:test` scenarios powered by `@yaebal/test` actors.

## running

```sh
cp examples/testing-lab/.env.example examples/testing-lab/.env   # then add your token
pnpm --filter @yaebal/example-testing-lab dev                    # reloads on change
```

- dev with reload: `pnpm --filter @yaebal/example-testing-lab dev`
- run once: `pnpm --filter @yaebal/example-testing-lab start`
- run tests: `pnpm --filter @yaebal/example-testing-lab test`

both load `examples/testing-lab/.env` when running the real bot. tests use a mock api and do
not call telegram.

## environment variables

| name        | example           | description                                                                               |
|:------------|:------------------|:------------------------------------------------------------------------------------------|
| `BOT_TOKEN` | `123456:AA-bc...` | bot token from [@BotFather](https://t.me/BotFather). required only for `dev` and `start`. |

## commands the example bot answers

| command  | what it shows                                      |
|:---------|:---------------------------------------------------|
| `/start` | sends a typed inline vote keyboard                 |
| `/stats` | prints vote counters from session state            |

it also handles typed vote callbacks and echoes any other text. `src/bot.test.ts` asserts the
keyboard, callback data, session state and outgoing api calls without network access.

---

part of [**yaebal**](https://github.com/neverlane/yaebal) - a type-safe, runtime-agnostic Telegram Bot API framework. MIT.
