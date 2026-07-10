# @yaebal/web

run your [yaebal](https://github.com/neverlane/yaebal) bot on **any** runtime via
webhooks — edge (cloudflare workers, deno deploy, bun, vercel edge), node servers
(express, fastify, koa), serverless (aws lambda, azure functions, google cloud
functions), and modern fetch frameworks (hono, elysia, next.js, sveltekit).
`fetch`-first, zero static `node:` imports.

## install

```sh
pnpm add @yaebal/web
```

## fetch-native runtimes

`webhook(bot, options?)` returns a standard `(Request) => Promise<Response>`. that's
everything a fetch runtime needs:

```ts
import { Bot } from "@yaebal/core";
import { webhook, setWebhook } from "@yaebal/web";

const bot = new Bot(BOT_TOKEN, { botInfo: BOT_INFO }); // botInfo skips the getMe round-trip
bot.command("start", (ctx) => ctx.reply("running on the edge ⚡"));

// cloudflare workers / deno deploy / vercel edge / hono / elysia
export default { fetch: webhook(bot, { secretToken: SECRET }) };
```

register the webhook once, from a **separate** deploy script (never at module top level
on edge):

```ts
await setWebhook(bot, "https://my-worker.workers.dev/", {
  secretToken: SECRET,
  allowedUpdates: ["message", "callback_query"],
  dropPendingUpdates: true,
});
```

## framework adapters

for frameworks whose handler shape isn't `(Request) => Response`:

```ts
import { expressAdapter, fastifyAdapter, honoAdapter, awsLambdaAdapter } from "@yaebal/web";

app.post("/", expressAdapter(bot, { secretToken: SECRET }));       // express / gcf / firebase
fastify.post("/", fastifyAdapter(bot, { secretToken: SECRET }));   // fastify
app.post("/", honoAdapter(bot, { secretToken: SECRET }));          // hono (wires waitUntil)
export const handler = awsLambdaAdapter(bot, { secretToken: SECRET }); // aws lambda
```

full set: `honoAdapter`, `elysiaAdapter`, `cloudflareAdapter`, `nextAdapter`,
`svelteKitAdapter`, `expressAdapter`, `gcfAdapter`, `fastifyAdapter`, `koaAdapter`,
`awsLambdaAdapter`, `azureAdapter` — also grouped on the `adapters` object
(`adapters.express(bot)`). every adapter forwards the secret token and the request
path, so `secretToken` and `path` behave identically across all of them.

## standalone server (node / bun / deno)

`serve(bot, options?)` starts the runtime's native http server and resolves to a handle
you can `stop()`. it works on **node** too (lazily importing `node:http`), so there's no
special-casing:

```ts
import { serve } from "@yaebal/web";

const server = await serve(bot, { port: 8080, secretToken: SECRET });
process.once("SIGINT", () => server.stop());
console.log(`listening on ${server.url}`);
```

## production hardening

these are the pieces every serious webhook deployment needs — telegram fires updates in
parallel and redelivers on failure:

```ts
import { sequentialize, dedupe, isTelegramIp } from "@yaebal/web";

bot.use(sequentialize()); // per-chat ordering — install before session/scenes/conversation
bot.use(dedupe());        // drop telegram's redelivered update_ids

// defence in depth on top of the secret token
if (!isTelegramIp(request.headers.get("cf-connecting-ip"))) return new Response(null, { status: 403 });
```

`webhook()` also takes `timeoutMs` / `onTimeout` (ack a slow update so telegram doesn't
redeliver), `onError` (`"fail"` → 500 & redeliver, `"ack"` → 200 & drop), `path` +
`fallback` (health checks), `maxBodyBytes` (streaming-enforced), and `reply` (answer the
webhook request with an api call, saving a round trip).

## diagnostics

```ts
import { getWebhookInfo, deleteWebhook } from "@yaebal/web";

const info = await getWebhookInfo(bot); // pending_update_count, last_error_message, …
await deleteWebhook(bot, { dropPendingUpdates: true }); // back to long polling
```

---

part of [**yaebal**](https://github.com/neverlane/yaebal) — a type-safe, runtime-agnostic Telegram Bot API framework. MIT.
