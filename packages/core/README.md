# @yaebal/core (the framework)

the yaebal core is a type-safe, chainable telegram bot api framework. `Bot extends
Composer` — a koa-style middleware engine where the context type *accumulates* through
the chain, so `derive` / `decorate` / `install` each return a bot with an enriched
context and handlers see plugin-added properties with no casting.

## installing

```sh
pnpm add @yaebal/core
```

## quick start

```ts
import { Bot, bold, format } from "@yaebal/core";

const bot = new Bot(process.env.BOT_TOKEN)
  .command("start", (ctx) => ctx.send("hi 🐴"))
  .on("message:text", (ctx) => ctx.reply(format`you said: ${bold(ctx.text)}`));

await bot.start(); // long polling — or bot.handleUpdate(update) behind a webhook
```

## what's inside

- chainable `Composer` — `use` / `on` / `command` / `hears` / `callbackQuery` / `guard` / `derive` / `decorate` / `install`, all type-accumulating.
- filter queries — `on("message:text")`, `on("callback_query:data")`, narrowing the context type.
- typed plugins — `install(plugin)` checks a plugin's required context at compile time; `BotPlugin` covers bot/API/lifecycle extensions.
- `api` — typed methods plus a `call(method, params)` passthrough, with `before` / `after` / `onError` hooks.
- entity-based formatting — `` format`…` `` plus nestable helpers (`bold` … `blockquote`, `pre` with a language, `customEmoji`, `dateTime`) that also work as tagged templates, and `join` (keeps entities where `[].join()` drops them). a format result is accepted by *every* api call — the client splits it into text + the right `*_entities` sibling anywhere the schema allows formatted text, nested params included.
- media — `media.path` / `url` / `buffer` / `stream` / `text` / `fileId`, `ctx.sendPhoto` / `ctx.sendDocument`, and nested uploads (`sendMediaGroup`, `editMessageMedia`, sticker sets, stories) rewritten to `attach://` automatically.
- both transports — long polling (`start`/`stop`/`onStart`/`onStop`) and webhooks (`handleUpdate`).

## developing (in this monorepo)

- to type-check, run `pnpm typecheck`.
- to build to `lib/`, run `pnpm build`.
- to run the tests, run `pnpm test`.
