---
name: yaebal-deploy
description: Use when running a yaebal bot in production — long polling with @yaebal/runner vs webhooks with @yaebal/web, graceful shutdown, and error handling.
---

# deploying a yaebal bot

two transports. pick by hosting model:

- **long polling** — a long-lived process (vps, container, fly.io). zero inbound networking.
  `bot.start()` is fine for dev; use `@yaebal/runner` in production for concurrency.
- **webhooks** — serverless/edge (cloudflare workers, lambda, vercel) or an existing http
  server. use `@yaebal/web`.

## long polling with @yaebal/runner

updates that share a chat id run strictly in order; unrelated chats run in parallel:

```typescript
import { run } from "@yaebal/runner";

const handle = run(bot, {
	concurrency: 50, // max parallel updates (default 50)
	onError: (err, update) => console.error(update?.update_id, err),
});

process.once("SIGINT", () => handle.stop());  // graceful shutdown
process.once("SIGTERM", () => handle.stop());
```

(plain `bot.start()` processes updates sequentially; stop it with `bot.stop()`.)

## webhooks with @yaebal/web

```typescript
import { Bot } from "@yaebal/core";
import { webhook, serve, setWebhook, sequentialize, dedupe } from "@yaebal/web";

const bot = new Bot(process.env.BOT_TOKEN!, { botInfo: BOT_INFO }); // botInfo skips the getMe round-trip on edge
bot.use(sequentialize()); // per-chat ordering — before session/scenes/conversation
bot.use(dedupe());        // drop telegram's redelivered update_ids

// fetch-native runtimes (workers / deno deploy / vercel edge / hono / elysia)
export default { fetch: webhook(bot, { secretToken: process.env.WEBHOOK_SECRET }) };

// or a standalone node/bun/deno server
const server = await serve(bot, { port: 8080, secretToken: process.env.WEBHOOK_SECRET });
process.once("SIGINT", () => server.stop());
```

register the webhook **once, from a separate deploy script** — never at module top level:

```typescript
await setWebhook(bot, "https://my-worker.workers.dev/", {
	secretToken: process.env.WEBHOOK_SECRET,
	dropPendingUpdates: true,
});
```

framework adapters exist for everything else: `expressAdapter`, `fastifyAdapter`,
`koaAdapter`, `honoAdapter`, `elysiaAdapter`, `nextAdapter`, `svelteKitAdapter`,
`cloudflareAdapter`, `awsLambdaAdapter`, `gcfAdapter`, `azureAdapter`. core also exports a
bare `webhookCallback(bot, options)` returning a `(Request) => Promise<Response>`.

## error handling basics

```typescript
import { autoRetry } from "@yaebal/again";
import { throttle } from "@yaebal/throttle";

bot.onError((error, ctx) => console.error(ctx.update.update_id, error)); // handler errors
bot.onPollingError((error) => console.error("poll failed", error));      // getUpdates failures

autoRetry(bot.api, { maxRetries: 5 });     // await 429 retry_after / transient failures
bot.install(throttle({ globalPerSec: 30 })); // stay under telegram's flood limits outbound
```

## rules

- **never run polling and a webhook at once**, and never two polling instances on one token —
  telegram answers 409 conflict. switch back to polling with
  `deleteWebhook(bot, { dropPendingUpdates: true })` from `@yaebal/web`.
- always set `secretToken` on webhooks and let the handler verify it (all adapters forward
  it). optionally check `isTelegramIp(...)` as defence in depth.
- webhook deliveries can run concurrently — install `sequentialize()` (and `dedupe()`) before
  any state plugin, or per-chat session state can race.
- graceful shutdown means: stop taking updates (`handle.stop()` / `server.stop()` /
  `bot.stop()`), let in-flight handlers finish, then exit. wire both SIGINT and SIGTERM.
- secrets (`BOT_TOKEN`, `WEBHOOK_SECRET`, api keys) come from the environment, never the repo.

## learn more

- https://yaebal.mom/docs/production/
- https://yaebal.mom/docs/webhooks/
- https://yaebal.mom/docs/runner/
