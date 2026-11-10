# @yaebal/example-widget (a runnable bot)

a tour of `@yaebal/widget` (html widgets, bot api 10.4): a live poll — typed queries via `bot.widgetQuery()`, a revisioned shared tally in `public_data`, json answers — and a TON tip jar that runs the whole wallet flow from one tap.

## running

```sh
cp examples/widget/.env.example examples/widget/.env   # then add your token
pnpm --filter @yaebal/example-widget dev               # reloads on change
```

no telegram needed to look at the widgets themselves:

```sh
pnpm --filter @yaebal/example-widget preview           # writes examples/widget/preview-*.html
```

the pages run each widget in a browser with a `TelegramWidget` stub — tap the poll buttons and the bars move, using canned answers.

## environment variables

| name          | example         | description                                                                 |
|:--------------|:----------------|:----------------------------------------------------------------------------|
| `BOT_TOKEN`   | `123456:aa-bc…` | bot token from [@BotFather](https://t.me/BotFather). required.               |
| `TON_ADDRESS` | `EQ…`           | where `/tip` payments go. optional — `/tip` explains itself without it. use a testnet wallet while trying it. |

## commands

| command | what it shows |
|:--------|:--------------|
| `/poll` | sends the poll widget (`poll.message()` checks the 4 kb compressed limit first) |
| `/tip`  | sends the tip jar — `yw.pay()` → `tonTransaction` answer → wallet → `sent_transaction` |

## files

- `src/poll.ts` — the action (`callbackData`), the state codec (`widgetState({ revision: true })`) and the widget (`defineWidget` + `widgetClient`).
- `src/tip.ts` — the tip jar widget, `widgetClient({ wallet: true })`.
- `src/index.ts` — the bot: `widgets()`, `bot.widgetQuery(vote, …)` with `ctx.widget.setData` / `answer`, and the two-step wallet handler.
- `src/preview.ts` — `widget.preview()` pages and `widget.check()` size + lint reports.

in production, telegram currently delivers widgets to private chats only. the demo keeps tallies in memory; a real bot stores them in `@yaebal/session` or a database. verify `ctx.widget.msgHash` on-chain before treating a tip as received.
