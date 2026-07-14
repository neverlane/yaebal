<script lang="ts">
	import Code from "$lib/Code.svelte";

	const polling = `import { Bot } from "@yaebal/core";

// long polling — start() loops getUpdates and calls handleUpdate for each
const bot = new Bot(process.env.BOT_TOKEN!);
bot.on("message:text", (ctx) => ctx.reply(ctx.text));
await bot.start();   // resolves only when stop() is called`;

	const shutdown = `import { Bot } from "@yaebal/core";

const bot = new Bot(process.env.BOT_TOKEN!);
bot.on("message:text", (ctx) => ctx.reply(ctx.text));

const stop = () => void bot.stop();
process.on("SIGINT", stop);
process.on("SIGTERM", stop); // e.g. a container orchestrator's shutdown signal

await bot.start();`;

	const fetchHandler = `import { Bot, webhookCallback } from "@yaebal/core";

const bot = new Bot(process.env.BOT_TOKEN!);
bot.on("message:text", (ctx) => ctx.reply(ctx.text));

// (Request) => Promise<Response>
const handler = webhookCallback(bot, { secretToken: process.env.WEBHOOK_SECRET });`;

	const options = `import { Bot, webhookCallback } from "@yaebal/core";

const bot = new Bot(process.env.BOT_TOKEN!);

const handler = webhookCallback(bot, {
  secretToken: process.env.WEBHOOK_SECRET,
  path: "/telegram",                       // only serve this pathname
  fallback: () => new Response("ok"),      // e.g. a health check on any other path
  timeoutMs: 8_000,                        // answer telegram even if the handler is slow
  onTimeout: "ack",                        // "ack" (default): 200 now, finish in the background
                                            // "fail": 500 — telegram redelivers (handler must be idempotent)
  onError: "fail",                         // "fail" (default): 500, telegram redelivers with backoff
                                            // "ack": 200 — drop the update after logging
  reply: (method) => method === "sendChatAction", // let ONLY this call answer the webhook's own
                                                    // http response instead of a separate request
});`;

	const node = `// Node http
import { createServer } from "node:http";
import { Bot } from "@yaebal/core";
import { nodeWebhookCallback } from "@yaebal/core/node";

const bot = new Bot(process.env.BOT_TOKEN!);
bot.on("message:text", (ctx) => ctx.reply(ctx.text));

createServer(
  nodeWebhookCallback(bot, { secretToken: process.env.WEBHOOK_SECRET }),
).listen(8080);`;

	const handle = `import { Bot, type Update } from "@yaebal/core";

declare const bot: Bot;
declare const update: Update;

// both handlers ultimately call bot.handleUpdate — the single-update entry point.
// the chain is realized (and frozen) on the first call, so register every
// middleware / plugin before the first handleUpdate or start.
await bot.handleUpdate(update);`;

	const registerWebhook = `import { Bot } from "@yaebal/core";
import { setWebhook } from "@yaebal/web";

const bot = new Bot(process.env.BOT_TOKEN!);

// run once on deploy — points telegram at your url. secretToken must match
// whatever you pass to webhookCallback()/serve() itself.
await setWebhook(bot, "https://example.com/telegram", {
  secretToken: process.env.WEBHOOK_SECRET,
  allowedUpdates: ["message", "callback_query"],
  dropPendingUpdates: true, // discard whatever queued up while the webhook was unset
});`;

	const workers = `interface Env {
  BOT_TOKEN: string;
  WEBHOOK_SECRET: string;
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
}

import { Bot, webhookCallback } from "@yaebal/core";

// one bot per isolate, built lazily from env — module scope has no "env" yet,
// it only arrives as fetch()'s second argument
let bot: Bot | undefined;
const getBot = (env: Env) => (bot ??= new Bot(env.BOT_TOKEN));

export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    // Workers calls fetch(request, env, ctx) — ctx (not env) is the waitUntil()
    // execution context webhookCallback's timeout/onTimeout machinery needs
    return webhookCallback(getBot(env), { secretToken: env.WEBHOOK_SECRET })(request, ctx);
  },
};`;

	const bun = `// Bun
import { Bot, webhookCallback } from "@yaebal/core";

declare const Bun: {
  serve(options: { port: number; fetch: (request: Request) => Promise<Response> }): unknown;
};

const bot = new Bot(process.env.BOT_TOKEN!);
bot.on("message:text", (ctx) => ctx.reply(ctx.text));

Bun.serve({
  port: 8080,
  fetch: webhookCallback(bot, { secretToken: process.env.WEBHOOK_SECRET }),
});`;
</script>

<svelte:head>
	<title>webhooks — yaebal</title>
</svelte:head>

<h1 data-pagefind-meta="title">webhooks &amp; deploy</h1>
<p class="lead">
	two webhook handlers — a fetch-style one and a node http one — both feeding the same
	handleUpdate entry point, with a constant-time secret check, a body-size cap, and the options
	that make a webhook production-ready: timeouts, retried-vs-acked errors, and the reply envelope.
</p>

<h2>polling vs webhooks</h2>
<table>
	<thead><tr><th></th><th>long polling</th><th>webhook</th></tr></thead>
	<tbody>
		<tr><td>setup</td><td><code>bot.start()</code>, nothing else</td><td>a public HTTPS URL + <code>setWebhook</code></td></tr>
		<tr><td>where it runs</td><td>anywhere with outbound HTTPS</td><td>anywhere that can receive it — including serverless</td></tr>
		<tr><td>latency</td><td>up to one poll cycle</td><td>telegram pushes immediately</td></tr>
		<tr><td>scaling</td><td>one process owns the poll loop</td><td>scales like any HTTP endpoint</td></tr>
		<tr><td>good for</td><td>local dev, single-instance bots</td><td>production, serverless, multi-instance</td></tr>
	</tbody>
</table>
<p>
	for development, long polling is simplest: <code>bot.start()</code> loops
	<code>getUpdates</code> and dispatches each update through <code>handleUpdate</code>, retrying
	after a short delay if a poll fails (see <code>bot.onPollingError</code> and the
	<code>allowedUpdates</code> bot option). it resolves only when <code>bot.stop()</code> is called.
</p>
<Code code={polling} title="polling.ts" />
<p>stop it cleanly on the signal your process manager actually sends:</p>
<Code code={shutdown} title="shutdown.ts" />
<p>
	for production you usually want webhooks: Telegram POSTs each update to your URL, and you hand the
	request straight to a yaebal handler. no polling loop, and it scales to serverless runtimes.
</p>

<h2>webhookCallback (fetch)</h2>
<p>
	<code>webhookCallback</code> returns a <code>(Request) =&gt; Promise&lt;Response&gt;</code>
	function — the shape every fetch-based runtime expects. it only accepts <code>POST</code>,
	parses the JSON update, and dispatches it.
</p>
<Code code={fetchHandler} title="webhook.ts" />

<h2>the secret check</h2>
<p>
	when you set <code>secretToken</code>, the handler requires Telegram's
	<code>X-Telegram-Bot-Api-Secret-Token</code> header to match. the comparison uses a small
	constant-time string loop instead of <code>node:crypto</code>, so the fetch handler stays portable
	across Node, Bun, Deno and edge runtimes.
</p>
<table>
	<thead>
		<tr><th>condition</th><th>response</th></tr>
	</thead>
	<tbody>
		<tr><td>wrong <code>path</code> (if set)</td><td><code>404</code> (or <code>fallback</code>)</td></tr>
		<tr><td>method is not <code>POST</code></td><td><code>405</code></td></tr>
		<tr><td><code>secretToken</code> set and header mismatched</td><td><code>401</code></td></tr>
		<tr><td>body larger than the cap</td><td><code>413</code></td></tr>
		<tr><td>body is not valid JSON, or not an update object</td><td><code>400</code></td></tr>
		<tr><td>handler throws (with <code>onError: "fail"</code>)</td><td><code>500</code></td></tr>
		<tr><td>handler exceeds <code>timeoutMs</code> (with <code>onTimeout: "ack"</code>)</td><td><code>200</code> — finishes in the background</td></tr>
		<tr><td>update dispatched</td><td><code>200 ok</code>, or the claimed <code>reply</code> call's body</td></tr>
	</tbody>
</table>
<div class="note">
	<strong>body size cap.</strong> Telegram updates are tiny, so the handler rejects anything over
	1 MiB (<code>maxBodyBytes</code>) to avoid memory abuse. the limit is enforced <em>while
	streaming</em> — an absent or spoofed <code>content-length</code> can't slip a large body past
	it — and a fast <code>content-length</code> check rejects oversize declared bodies before reading.
</div>

<h2>options</h2>
<p>the options that make a webhook behave correctly under real traffic, not just the happy path:</p>
<Code code={options} title="options.ts" />
<ul>
	<li>
		<code>timeoutMs</code>/<code>onTimeout</code> — telegram redelivers a request that hangs, so
		answering first beats being timed out remotely. <code>"ack"</code> (default) returns 200 and
		lets the update finish in the background — pass the platform's <code>waitUntil</code> (the
		handler's second argument) on serverless so it survives past the response; <code>"fail"</code>
		returns 500 so telegram redelivers later, meaning a deterministic hang repeats every time.
	</li>
	<li>
		<code>path</code>/<code>fallback</code> — serve one exact pathname and hand everything else
		(health checks, other routes) to your own handler instead of a bare 404/405.
	</li>
	<li>
		<code>reply</code> — the <strong>webhook reply envelope</strong>: let one eligible api call
		answer the webhook's own HTTP request instead of making a separate call, saving a round trip
		per update. <code>true</code> allows any upload-free call; a predicate restricts which method
		qualifies. the claimed call's promise still resolves (<code>true</code> — telegram doesn't
		send back a result), and it's delivered <em>after</em> any direct calls the handler made first.
	</li>
	<li>
		<code>onError</code> — <code>"fail"</code> (default) returns 500, so telegram redelivers with
		backoff; a handler that deterministically throws will repeat until it ages out.
		<code>"ack"</code> returns 200 and drops the update after logging — safer for a
		best-effort handler that shouldn't be retried indefinitely.
	</li>
</ul>

<h2>nodeWebhookCallback (node http)</h2>
<p>
	for a plain Node server, import <code>nodeWebhookCallback</code> from
	<code>@yaebal/core/node</code>. it returns an <code>(req, res)</code> handler you can drop into
	<code>http.createServer</code>. keeping it in a Node-only subpath prevents the main
	<code>@yaebal/core</code> entry from importing <code>node:http</code>.
</p>
<Code code={node} title="node-server.ts" />

<h2>handleUpdate</h2>
<p>
	both handlers ultimately call <code>bot.handleUpdate(update)</code>, which builds a
	<code>Context</code> and runs the middleware chain, sending any thrown error to your
	<code>onError</code> handler. you can also call it directly from a custom HTTP layer.
</p>
<Code code={handle} title="handle.ts" />
<div class="note">
	<strong>register before the first update.</strong> the chain is realized and frozen on the first
	<code>handleUpdate</code> (or <code>start</code>), so attach all middleware and plugins before
	then. webhook handlers also lazily call <code>bot.init()</code> on the first update, so
	<code>ctx.me</code>/<code>/cmd@botname</code> addressing work without ever polling — pass
	<code>botInfo</code> in the <code>Bot</code> constructor to skip that extra <code>getMe</code>
	round trip on a cold serverless start.
</div>

<h2>registering the webhook</h2>
<p>
	telegram has to be told the URL. run <code>setWebhook</code> once on deploy (from
	<a href="/docs/plugins/web">@yaebal/web</a>) — its <code>secretToken</code> must match the one
	you pass to <code>webhookCallback</code>/<code>serve</code>:
</p>
<Code code={registerWebhook} title="deploy.ts" />

<h2>deploy: Cloudflare Workers</h2>
<Code code={workers} title="worker.ts" />

<h2>deploy: Bun</h2>
<Code code={bun} title="bun-server.ts" />

<h2>other runtimes</h2>
<p>
	Deno, Node behind a framework, and every serverless flavor (AWS Lambda, Azure Functions, Google
	Cloud Functions) work the same way — hand a <code>Request</code> to <code>webhookCallback</code>
	(or use the framework-specific adapter). the full, up-to-date matrix lives on
	<a href="/docs/production/deploy-targets">deploy targets</a> and
	<a href="/docs/runtimes">runtimes</a>; every adapter itself is documented on
	<a href="/docs/plugins/web">@yaebal/web</a>.
</p>

<h2>going further: @yaebal/web</h2>
<p>
	<a href="/docs/plugins/web/">@yaebal/web</a> wraps this engine with everything a real deployment
	needs: one-line adapters for express, fastify, koa, hono, elysia, next.js, sveltekit, aws lambda,
	azure and google cloud functions; a <code>serve()</code> that runs on node/bun/deno and returns a
	stoppable handle; the <code>sequentialize()</code> and <code>dedupe()</code> combinators for
	parallel delivery and redelivery; <code>setWebhook</code> / <code>getWebhookInfo</code> /
	<code>deleteWebhook</code>; and timeout / error / webhook-reply policies on
	<code>webhook()</code> itself.
</p>
