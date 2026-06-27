# @yaebal/web

Run your [yaebal](https://github.com/neverlane/yaebal) bot on edge/web runtimes —
Cloudflare Workers, Deno Deploy, Bun, Vercel Edge — via webhooks. `fetch`-first,
zero `node:` imports.

## install

```sh
pnpm add @yaebal/web
```

## usage

```ts
import { Bot } from "@yaebal/core";
import { webhook, setWebhook } from "@yaebal/web";

// Cloudflare Workers / Deno Deploy / Vercel Edge
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

`serve(bot, { port })` starts a native fetch server on Bun or Deno. On Node, use
`nodeWebhookCallback` from `@yaebal/core`. The operator dashboard lives in
[`@yaebal/panel`](https://github.com/neverlane/yaebal/tree/master/packages/panel).
