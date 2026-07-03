# @yaebal/example-payments-stars (a runnable bot)

a telegram stars bot for invoices, pre-checkout approval, successful payment handling and
refunds through the raw bot api passthrough.

## running

```sh
cp examples/payments-stars/.env.example examples/payments-stars/.env   # then add your token
pnpm --filter @yaebal/example-payments-stars dev                       # reloads on change
```

- dev with reload: `pnpm --filter @yaebal/example-payments-stars dev`
- run once: `pnpm --filter @yaebal/example-payments-stars start`

both load `examples/payments-stars/.env`. on start the bot registers its command menu with
telegram, so the commands below show up in the `/` picker.

## environment variables

| name        | example           | description                                                                               |
|:------------|:------------------|:------------------------------------------------------------------------------------------|
| `BOT_TOKEN` | `123456:aa-bc...` | bot token from [@BotFather](https://t.me/BotFather). required - the bot exits without it. |

## commands the example bot answers

| command             | what it shows                                          |
|:--------------------|:-------------------------------------------------------|
| `/start`            | choose a stars plan through typed callback buttons     |
| `/buy`              | sends a default stars invoice                          |
| `/refund charge_id` | calls `refundStarPayment` for the current user         |

the bot also answers `pre_checkout_query` updates and confirms `message:successful_payment`.

---

part of [**yaebal**](https://github.com/neverlane/yaebal) - a type-safe, runtime-agnostic Telegram Bot API framework. MIT.
