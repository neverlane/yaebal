# @yaebal/example-simple (a runnable bot)

a compact bot that demonstrates `@yaebal/toml`: routes live in `bot.toml`, while complex
logic stays in a typescript handler registry.

## running

```sh
cp examples/simple/.env.example examples/simple/.env   # then add your token
pnpm --filter @yaebal/example-simple dev               # reloads on change
```

- dev with reload: `pnpm --filter @yaebal/example-simple dev`
- run once: `pnpm --filter @yaebal/example-simple start`

both load `examples/simple/.env` and `examples/simple/bot.toml`.

## environment variables

| name        | example           | description                                                                               |
|:------------|:------------------|:------------------------------------------------------------------------------------------|
| `BOT_TOKEN` | `123456:AA-bc...` | bot token from [@BotFather](https://t.me/BotFather). required - the bot exits without it. |

## commands the example bot answers

| command or update | what it shows                                      |
|:------------------|:---------------------------------------------------|
| `/start`          | toml-defined reply                                 |
| `/ping`           | named typescript handler from the registry         |
| `ping`            | toml `hears` route with an inline reply            |
| `admin`           | toml `hears` route backed by a named handler       |
| text with `yaebal` | toml `message:text` route with `contains` matching |
| `secret`          | toml `message:text` route backed by a named handler |
| callback `buy`    | toml callback reply                                |
| callback `profile` | named callback handler from the registry          |

the example is intentionally small so the toml shape and handler registry stay easy to copy.

---

part of [**yaebal**](https://github.com/neverlane/yaebal) - a type-safe, runtime-agnostic Telegram Bot API framework. MIT.
