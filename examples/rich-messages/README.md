# @yaebal/example-rich-messages (a runnable bot)

a focused tour of `@yaebal/rich`: building blocks and inline marks, sending a document with `ctx.sendRichMessage`, streaming a fake answer via `ctx.richMessageDraft`/`RichMessageDraft`, and reading `message.rich_message` back with `richMessageToPlainText`.

## running

```sh
cp examples/rich-messages/.env.example examples/rich-messages/.env   # then add your token
pnpm --filter @yaebal/example-rich-messages dev                     # reloads on change
```

- dev with reload: `pnpm --filter @yaebal/example-rich-messages dev`
- run once: `pnpm --filter @yaebal/example-rich-messages start`

## environment variables

| name        | example           | description                                                                               |
|:------------|:------------------|:------------------------------------------------------------------------------------------|
| `BOT_TOKEN` | `123456:AA-bc...` | bot token from [@BotFather](https://t.me/BotFather). required - the bot exits without it. |

## commands

| command         | what it shows                                                          |
|:----------------|:-------------------------------------------------------------------------|
| `/start`        | `document()` with a heading, bold/link inline marks, and a blockquote  |
| `/report`       | `table()`/`cell()`, a checkbox `list()`, and a collapsible `details()` |
| `/media`        | `image()`/`video()`/`audio()` blocks with captions                    |
| `/ask <question>` | streams a fake answer via `RichMessageDraft` (`thinking()` → incremental pushes → `commit()`) |

sending any rich message back to the bot (e.g. forwarding one) triggers `message:rich_message`, which replies with the block tree flattened to plain text via `richMessageToPlainText`.

## a note on the write-side tags

`@yaebal/rich`'s builders use telegram's documented tags where the schema states one explicitly (tables, headings, `<details>`, `<tg-collage>`, …). a handful of inline marks (`marked`, `subscript`, `superscript`, `date_time`, …) have no documented tag and are best-effort — see the `@yaebal/rich` README's "coverage" section before relying on those in production.

---

part of [**yaebal**](https://github.com/neverlane/yaebal) - a type-safe, runtime-agnostic Telegram Bot API framework. MIT.
