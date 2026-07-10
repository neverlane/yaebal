<script lang="ts">
	import Code from "$lib/Code.svelte";

	const polling = `// long polling — start() loops getUpdates and calls handleUpdate for each
const bot = new Bot(process.env.BOT_TOKEN!);
bot.on("message:text", (ctx) => ctx.reply(ctx.text));
await bot.start();   // resolves only when stop() is called`;

	const fetchHandler = `import { webhookCallback } from "@yaebal/core";

// (Request) => Promise<Response>
const handler = webhookCallback(bot, { secretToken: process.env.WEBHOOK_SECRET });`;

	const workers = `// Cloudflare Workers
import { Bot, webhookCallback } from "@yaebal/core";

const bot = new Bot(env.BOT_TOKEN);
bot.command("start", (ctx) => ctx.reply("hi from the edge"));

export default {
  fetch: webhookCallback(bot, { secretToken: env.WEBHOOK_SECRET }),
};`;

	const bun = `// Bun
import { Bot, webhookCallback } from "@yaebal/core";

const bot = new Bot(process.env.BOT_TOKEN!);
bot.on("message:text", (ctx) => ctx.reply(ctx.text));

Bun.serve({
  port: 8080,
  fetch: webhookCallback(bot, { secretToken: process.env.WEBHOOK_SECRET }),
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

	const handle = `// both handlers ultimately call bot.handleUpdate — the single-update entry point.
// the chain is realized (and frozen) on the first call, so register every
// middleware / plugin before the first handleUpdate or start.
await bot.handleUpdate(update);`;
</script>

<svelte:head>
	<title>webhooks — yaebal</title>
</svelte:head>

<h1>webhooks</h1>
<p class="lead">
	two webhook handlers — a fetch-style one and a node http one — both feeding the same
	handleUpdate entry point, with a constant-time secret check and a body-size cap.
</p>

<h2>polling vs webhooks</h2>
<p>
	for development, long polling is simplest: <code>bot.start()</code> loops
	<code>getUpdates</code> and dispatches each update through <code>handleUpdate</code>, retrying
	after a short delay if a poll fails. it resolves only when <code>bot.stop()</code> is called.
</p>
<Code code={polling} title="polling.ts" />
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
		<tr><td>method is not <code>POST</code></td><td><code>405</code></td></tr>
		<tr><td><code>secretToken</code> set and header mismatched</td><td><code>401</code></td></tr>
		<tr><td>body larger than the cap</td><td><code>413</code></td></tr>
		<tr><td>body is not valid JSON, or not an update object</td><td><code>400</code></td></tr>
		<tr><td>handler throws (with <code>onError: "fail"</code>)</td><td><code>500</code></td></tr>
		<tr><td>update dispatched</td><td><code>200 ok</code></td></tr>
	</tbody>
</table>
<div class="note">
	<strong>body size cap.</strong> Telegram updates are tiny, so the handler rejects anything over
	1 MiB (<code>maxBodyBytes</code>) to avoid memory abuse. the limit is enforced <em>while
	streaming</em> — an absent or spoofed <code>content-length</code> can't slip a large body past
	it — and a fast <code>content-length</code> check rejects oversize declared bodies before reading.
</div>

<h2>nodeWebhookCallback (node http)</h2>
<p>
	for a plain Node server, import <code>nodeWebhookCallback</code> from
	<code>@yaebal/core/node</code>. it returns an <code>(req, res)</code> handler you can drop into
	<code>http.createServer</code>. keeping it in a Node-only subpath prevents the main
	<code>@yaebal/core</code> entry from importing <code>node:http</code>.
</p>
<Code code={node} title="server.ts" />

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
	then.
</div>

<h2>deploy: Cloudflare Workers</h2>
<Code code={workers} title="worker.ts" />

<h2>deploy: Bun</h2>
<Code code={bun} title="server.ts" />

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
