# @yaebal/example-rich-messages (a runnable bot)

a focused tour of `@yaebal/rich`: the dual-dialect builders (`bold`, `paragraph`, `table`, …) rendered through both the `html` and `md` template tags, sending a document with `ctx.sendRichMessage`, streaming a fake answer via `ctx.richMessageDraft`/`RichMessageDraft`, and reading `message.rich_message` back with `richMessageToPlainText`.

## running

```sh
cp examples/rich-messages/.env.example examples/rich-messages/.env   # then add your token
pnpm --filter @yaebal/example-rich-messages dev                      # reloads on change
```

- dev with reload: `pnpm --filter @yaebal/example-rich-messages dev`
- run once: `pnpm --filter @yaebal/example-rich-messages start`

## environment variables

| name        | example           | description                                                                               |
|:------------|:------------------|:------------------------------------------------------------------------------------------|
| `BOT_TOKEN` | `123456:AA-bc...` | bot token from [@BotFather](https://t.me/BotFather). required - the bot exits without it. |

## commands

| command           | what it shows                                                                                                          |
|:------------------|:-----------------------------------------------------------------------------------------------------------------------|
| `/start`          | `html`\`…\` with a heading, bold/link inline marks, and a blockquote                                                   |
| `/md`             | the exact same builders, rendered through `md`\`…\` instead of `html`\`…\`                                             |
| `/report`         | `table()`/`cell()`, a checkbox `list()`, and a collapsible `details()`                                                 |
| `/media`          | `image()`/`video()`/`audio()` blocks with captions                                                                     |
| `/ask <question>` | streams a fake answer via `RichMessageDraft` (`thinking()` → incremental `rewrite()`s → `write()` a footer → `send()`) |

sending any rich message back to the bot (e.g. forwarding one) triggers `message:rich_message`, which replies with the block tree flattened to plain text via `richMessageToPlainText`.

## one builder set, two dialects

`bold`, `paragraph`, `table`, … don't know their output format — they return a `RichNode` that renders itself when asked. `html`\`…\` and `md`\`…\` are the two places that ask: pick a dialect, and every builder you already know works under it. `/start` and `/md` build (almost) the same content through each tag to show the symmetry.

## a note on the write-side tags

`@yaebal/rich`'s builders use telegram's documented tags where the schema states one explicitly (tables, headings, `<details>`, `<tg-collage>`, …). a handful of inline marks (`marked`, `subscript`, `superscript`, `date_time`, …) have no documented tag and are best-effort — see the `@yaebal/rich` README's "coverage" section before relying on those in production.

---

part of [**yaebal**](https://github.com/neverlane/yaebal) - a type-safe, runtime-agnostic Telegram Bot API framework. MIT.
