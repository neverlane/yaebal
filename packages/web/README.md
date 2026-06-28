# @yaebal/web

run your [yaebal](https://github.com/neverlane/yaebal) bot on edge/web runtimes —
cloudflare workers, deno deploy, bun, vercel edge — via webhooks. `fetch`-first,
zero `node:` imports.

## install

```sh
pnpm add @yaebal/web
```

## usage

```ts
import { Bot } from "@yaebal/core";
import { webhook, setWebhook } from "@yaebal/web";

// cloudflare workers / deno deploy / vercel edge
export default {
  fetch(request: Request, env: { BOT_TOKEN: string; SECRET: string }) {
    const bot = new Bot(env.BOT_TOKEN);

    bot.command("start", (ctx) => ctx.reply("running on the edge ⚡"));

    return webhook(bot, { secretToken: env.SECRET })(request);
  },
};

// register once on deploy
await setWebhook(bot, "https://my-worker.workers.dev/", { secretToken: SECRET });
```

`serve(bot, { port })` starts a native fetch server on bun or deno. on bode, use
`nodeWebhookCallback` from `@yaebal/core`. the operator dashboard lives in
[`@yaebal/panel`](https://github.com/neverlane/yaebal/tree/master/packages/panel).

---

part of [**yaebal**](https://github.com/neverlane/yaebal) — a type-safe, runtime-agnostic Telegram Bot API framework. MIT.
