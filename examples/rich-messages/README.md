# @yaebal/example-rich-messages (a runnable bot)

a focused bot that demonstrates `@yaebal/rich`: dual-dialect builders, document blocks,
`ctx.sendRichMessage`, fake answer streaming via `ctx.richMessageDraft`, and
`message:rich_message` readback.

## running

```sh
cp examples/rich-messages/.env.example examples/rich-messages/.env   # then add your token
pnpm --filter @yaebal/example-rich-messages dev                      # reloads on change
```

- dev with reload: `pnpm --filter @yaebal/example-rich-messages dev`
- run once: `pnpm --filter @yaebal/example-rich-messages start`

both load `examples/rich-messages/.env`. on start the bot registers its command menu with
telegram, so the commands below show up in the `/` picker.

## environment variables

| name        | example           | description                                                                               |
|:------------|:------------------|:------------------------------------------------------------------------------------------|
| `BOT_TOKEN` | `123456:aa-bc...` | bot token from [@BotFather](https://t.me/BotFather). required - the bot exits without it. |

## commands the example bot answers

| command           | what it shows                                                                 |
|:------------------|:------------------------------------------------------------------------------|
| `/start`          | `html` rich document with heading, paragraph, link and blockquote              |
| `/md`             | the same builder set rendered through `md` instead of `html`                  |
| `/report`         | table, checklist and collapsible details blocks                               |
| `/media`          | image, video and audio rich blocks with captions                              |
| `/ask <question>` | fake streaming answer through `RichMessageDraft`                              |

forwarding or sending a rich message back triggers `message:rich_message` and replies with
the block tree flattened by `richMessageToPlainText`.

---

part of [**yaebal**](https://github.com/neverlane/yaebal) - a type-safe, runtime-agnostic Telegram Bot API framework. MIT.
