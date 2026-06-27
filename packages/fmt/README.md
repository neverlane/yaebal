# @yaebal/fmt

`html` and `md` tagged template literals that parse Telegram's markup subset into `MessageEntity` objects — no `parse_mode`, no manual escaping.

## install

```sh
pnpm add @yaebal/fmt
```

## usage

```ts
import { html, md } from "@yaebal/fmt";

// html tag: interpolations are auto-escaped, FormatResult values are merged
bot.command("greet", (ctx) =>
  ctx.send(html`<b>Hello</b>, <i>${ctx.from?.first_name}</i>!`),
);

// md tag: ** bold **, __ italic __, ~~strikethrough~~, ||spoiler||, [link](url)
bot.command("info", (ctx) =>
  ctx.send(md`**yaebal** — _yet another_ telegram bot api library`),
);

// nest core helpers — offsets are shifted automatically
import { bold } from "@yaebal/core";
bot.command("mix", (ctx) =>
  ctx.send(html`welcome, ${bold(ctx.who)}!`),
);
```
