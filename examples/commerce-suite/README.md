# @yaebal/example-commerce-suite (a runnable bot)

a small shop bot that stacks product plugins together: session cart, typed callback data,
i18n, pagination, command registry, fmt, filters and inbound anti-spam.

## running

```sh
cp examples/commerce-suite/.env.example examples/commerce-suite/.env   # then add your token
pnpm --filter @yaebal/example-commerce-suite dev                       # reloads on change
```

- dev with reload: `pnpm --filter @yaebal/example-commerce-suite dev`
- run once: `pnpm --filter @yaebal/example-commerce-suite start`

both load `examples/commerce-suite/.env`. on start the bot registers its command menu with
telegram, so the commands below show up in the `/` picker.

## environment variables

| name        | example           | description                                                                               |
|:------------|:------------------|:------------------------------------------------------------------------------------------|
| `BOT_TOKEN` | `123456:AA-bc...` | bot token from [@BotFather](https://t.me/BotFather). required - the bot exits without it. |

## commands the example bot answers

| command     | what it shows                                                        |
|:------------|:---------------------------------------------------------------------|
| `/start`    | shop intro with quick inline buttons                                 |
| `/catalog`  | paginated product list edited in place                               |
| `/deal`     | featured product with typed add/remove buttons                       |
| `/cart`     | current per-chat cart and total                                      |
| `/checkout` | fake checkout summary                                                |
| `/lang`     | toggles english/russian locale                                       |
| `/clear`    | empties the cart                                                     |
| `/help`     | lists commands through filters and fmt html                          |

it also accepts a plain product id like `3` and opens that product deal.

---

part of [**yaebal**](https://github.com/neverlane/yaebal) - a type-safe, runtime-agnostic Telegram Bot API framework. MIT.
