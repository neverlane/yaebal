<div align="center">
🐴

### yaebal

*the batteries-included telegram bot framework*  
**one import** · **type-safe** · **runtime-agnostic**

[🔗 docs](https://yaebal.mom) · [⭐ github](https://github.com/neverlane/yaebal) · [📦 npmx](https://npmx.dev/org/yaebal)

</div>

---

`yaebal` is the meta package: it bundles the [core engine](https://github.com/neverlane/yaebal/tree/master/packages/core),
the auto-generated per-update contexts, and the most-used plugins behind a **single import**.
no wiring, no platform package to pick — `media.path()` just works on node, bun and deno,
and the same bot runs behind long polling or a webhook on the edge.

## install

```sh
pnpm add yaebal
```

## quick start

```ts
import { Bot, html } from "yaebal";

const bot = new Bot(process.env.BOT_TOKEN!)
  .command("start", (ctx) => ctx.send("hi 🐴"))
  .on("message:text", (ctx) => ctx.reply(html`you said: <b>${ctx.text}</b>`));

await bot.start(); // long polling — or hand updates to a webhook (see below)
```

`.on("message:text")` narrows the context — inside, `ctx.text` is a `string`, not
`string | undefined`. every chain method (`command` / `on` / `hears` / `derive` /
`install` / …) flows the context type forward, so plugin-added properties are typed
with no casting.

## rich, typed contexts

`createBot` grafts the auto-generated shortcut methods onto every update — `ctx.react`,
`ctx.editText`, `ctx.pin`, … — typed to the matching update, not just present at runtime.

```ts
import { createBot } from "yaebal";

const bot = createBot(process.env.BOT_TOKEN!);

bot.on("message:text", (ctx) => ctx.react("🔥"));          // MessageContext
bot.on("callback_query:data", (ctx) => ctx.answer("ok")); // CallbackQueryContext
```

## what's in the box

one `import { … } from "yaebal"` gives you, ready to use:

| from                    | exports                                                        | what                                   |
|:------------------------|:---------------------------------------------------------------|:---------------------------------------|
| core                    | `Bot`, `Composer`, `Context`, `media`, `Api` hooks             | the engine, filter queries, transports |
| contexts                | `createBot`, the per-update context classes                    | typed `ctx.react` / `ctx.editText` / … |
| `@yaebal/keyboard`      | `InlineKeyboard`, `Keyboard`                                   | fluent keyboard builders               |
| `@yaebal/callback-data` | `callbackData`                                                 | typed `callback_data` pack / unpack    |
| `@yaebal/fmt`           | `html`, `md` (+ `*ToEntities`)                                 | tagged templates with auto-escaping    |
| `@yaebal/filters`       | `filters`, `and`, `or`, `not`                                  | composable, type-narrowing filters     |
| `@yaebal/session`       | `session`                                                      | per-chat state, pluggable storage      |
| `@yaebal/i18n`          | `i18n`                                                         | per-chat locale, `ctx.t`               |
| `@yaebal/web`           | `serve`, `webhook`, `setWebhook`, `deleteWebhook`              | webhooks on edge/web runtimes          |

## a quick tour

### keyboards + typed callback data

```ts
import { InlineKeyboard, callbackData } from "yaebal";

const vote = callbackData("vote", { id: Number });

bot.command("poll", (ctx) =>
  ctx.send("pick one", {
    reply_markup: new InlineKeyboard()
      .text("👍", vote.pack({ id: 1 }))
      .text("👎", vote.pack({ id: 2 }))
      .build(),
  }),
);

bot.on("callback_query:data", (ctx) => {
  const data = vote.unpack(ctx.callbackQuery.data);
  if (data) ctx.answer(`voted ${data.id}`);
});
```

### per-chat sessions

```ts
import { session } from "yaebal";

bot.install(session({ initial: () => ({ count: 0 }) }));
bot.command("count", (ctx) => ctx.reply(`#${++ctx.session.count}`));
```

### i18n (internationalization)

```ts
import { i18n } from "yaebal";

bot.install(i18n({
  defaultLocale: "en",
  locales: { en: { hi: "hello" }, ru: { hi: "привет" } },
}));
bot.command("start", (ctx) => ctx.reply(ctx.t("hi")));
```

### media — no platform package

```ts
import { media } from "yaebal";

bot.command("pic", (ctx) => ctx.sendPhoto(media.path("./cat.jpg"))); // node/bun/deno
// on edge, send media.url(...) / media.buffer(...) instead
```

### run on the edge (webhooks)

```ts
import { Bot, webhook } from "yaebal";

export default {
  fetch(request: Request, env: { BOT_TOKEN: string; SECRET: string }) {
    const bot = new Bot(env.BOT_TOKEN);
    bot.command("start", (ctx) => ctx.reply("running on the edge ⚡"));

    return webhook(bot, { secretToken: env.SECRET })(request);
  },
};
```

## need more?

the bundle covers the essentials. everything else is a first-party plugin you add as
needed — auto-retry, scenes, conversations, routing, broadcast, the operator
[panel](https://github.com/neverlane/yaebal/tree/master/packages/panel), and more.
see the [full plugin catalog](https://github.com/neverlane/yaebal#plugins).

---

part of [**yaebal**](https://github.com/neverlane/yaebal) — a type-safe, runtime-agnostic Telegram Bot API framework. MIT.
