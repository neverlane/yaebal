# @yaebal/example-pagination (a runnable bot)

a focused bot that shows `@yaebal/pagination`: lazy sources (with and without `count`),
item buttons with `onSelect`, a typed payload that parameterizes one list per genre,
`button()` used both to morph a menu into a list and as back-navigation from a detail
card, ownership via `filter` + `denied`, counter/first-last navigation, and `format`
entities in headers and lines.

## running

```sh
cp examples/pagination/.env.example examples/pagination/.env   # then add your token
pnpm --filter @yaebal/example-pagination dev                   # reloads on change
```

- dev with reload: `pnpm --filter @yaebal/example-pagination dev`
- run once: `pnpm --filter @yaebal/example-pagination start`

both load `examples/pagination/.env`. this example does not need external services beyond
telegram itself.

## environment variables

| name        | example           | description                                                                              |
|:------------|:------------------|:-----------------------------------------------------------------------------------------|
| `BOT_TOKEN` | `123456:AA-bc...` | bot token from [@BotFather](https://t.me/BotFather). required - the bot exits without it. |

## commands the example bot answers

| command   | what it shows                                                                                        |
|:----------|:------------------------------------------------------------------------------------------------------|
| `/start`  | explains the demo                                                                                     |
| `/books`  | lazy source with `count`: exact totals, ⏮ ◀ N/M ▶ ⏭ row, counter doubles as refresh, close button    |
| `/genres` | a static menu whose buttons morph into per-genre lists (`button()` + typed payload); items open cards |
| `/feed`   | lazy source without `count` (limit+1 probing); the payload carries ownership, others get a toast      |

the "horror" genre is intentionally empty — it renders the `empty` state. book cards are
plain `editMessageText` edits with a `byGenre.button("« back", ...)` that returns to the
exact page the reader came from.

---

part of [**yaebal**](https://github.com/neverlane/yaebal) - a type-safe, runtime-agnostic Telegram Bot API framework. MIT.
