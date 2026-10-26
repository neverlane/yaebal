# @yaebal/tgcloud

build a yaebal bot into a [telegram serverless](https://core.telegram.org/bots/serverless) project.

the tgcloud runtime has no npm and no `bot.start()`. it loads one file per update type (`tgcloud/handlers/message.js`, `tgcloud/handlers/callback_query.js`, …) and hands the bot `sdk` instead of the bot api. this package does the build on your machine, where npm exists, and writes those files. what gets deployed imports `sdk` and nothing else.

## install

```sh
pnpm add -D @yaebal/tgcloud
```

the bot itself stays a normal yaebal app. `@yaebal/tgcloud` is a build tool, not a runtime dependency.

## usage

```ts
// src/bot.ts — the same bot you would bot.start() locally
import { Bot } from "@yaebal/core";

export const bot = new Bot(process.env.BOT_TOKEN ?? "build");

bot.command("start", (ctx) => ctx.reply("hello from tgcloud"));
bot.on("callback_query", (ctx) => ctx.answerCallbackQuery({ text: "ok" }));
```

a full echo bot that also counts messages in the serverless database is
[`examples/tgcloud`](../../examples/tgcloud/).

```sh
yaebal-tgcloud src/bot.ts
npx tgcloud push
```

that writes `tgcloud/handlers/message.js` and `tgcloud/handlers/callback_query.js`. each one is a self-contained bundle whose default export is the handler tgcloud calls with the unwrapped update. `ctx.reply()` goes through `sdk.api`, with the same hooks (`autoRetry`, format, media) the bot had locally.

from code:

```ts
import { bundleTgcloud } from "@yaebal/tgcloud";

await bundleTgcloud({
	input: "src/bot.ts", // or { path, export: "bot" }
	root: process.cwd(), // tgcloud/ is created here
	handlers: ["inline_query"], // force a type the bot didn't name with on()
	ignore: ["poll"],
});
```

`command()` and `hears()` don't record an update type, so `message` is always emitted. everything else comes from `bot.registeredUpdates()`, plus `handlers`. a handler the bot stopped registering is deleted, so the folder matches the bot.

## what does not come along

- `bot.start()`, long polling, and `setWebhook`. tgcloud owns the webhook and routes by the handler files you deployed.
- `media.path()`. there is no filesystem. send `media.buffer()`, `media.url()`, or `media.fileId()`.
- `api.fileUrl()`. the bot token never reaches your code. use `api.downloadFile(fileId)` — it calls `sdk.api.getFileContent`.
- npm packages. a plugin that imports one is bundled in, which is the point, but it has to run without `node:` builtins the isolate doesn't have.

`schema.js`, `lib/`, and `endpoints/` are yours to write against `sdk` directly. this package only owns the bot's update handlers.

## cli

```text
yaebal-tgcloud <bot-entry> [--root dir] [--export name] [--handler type] [--ignore type] [--keep-logs]
```

`--keep-logs` leaves `console.*` in. by default they're dropped.

part of [**yaebal**](https://github.com/neverlane/yaebal) — a type-safe, runtime-agnostic Telegram Bot API framework. MIT.
