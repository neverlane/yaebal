<script lang="ts">
	import Code from "$lib/Code.svelte";

	const install = `pnpm add @yaebal/web`;

	const workers = `import { Bot } from "@yaebal/core";
import { webhook } from "@yaebal/web";

// cloudflare workers / deno deploy / vercel edge — no long-polling, just fetch
export default {
  fetch(request: Request, env: { BOT_TOKEN: string; SECRET: string }) {
    const bot = new Bot(env.BOT_TOKEN);
    bot.command("start", (ctx) => ctx.reply("running on the edge ⚡"));
    return webhook(bot, { secretToken: env.SECRET })(request);
  },
};`;

	const serveCode = `import { Bot } from "@yaebal/core";
import { serve } from "@yaebal/web";

const bot = new Bot(process.env.BOT_TOKEN!);
bot.on("message:text", (ctx) => ctx.reply(ctx.text));

// bun or deno only — starts a native fetch server
serve(bot, { port: 8080, secretToken: process.env.SECRET });`;

	const node = `import { Bot, nodeWebhookCallback } from "@yaebal/core";
import { createServer } from "node:http";

const bot = new Bot(process.env.BOT_TOKEN!);
bot.on("message:text", (ctx) => ctx.reply(ctx.text));

// on node, serve() isn't available — use the core node callback
createServer(nodeWebhookCallback(bot, { secretToken: process.env.SECRET })).listen(8080);`;

	const register = `import { setWebhook, deleteWebhook } from "@yaebal/web";

// run once on deploy to point telegram at your url
await setWebhook(bot, "https://my-worker.workers.dev/", {
  secretToken: process.env.SECRET,
  allowedUpdates: ["message", "callback_query"],
  dropPendingUpdates: true,
  maxConnections: 40,
});

// switch back to long-polling later
await deleteWebhook(bot);`;
</script>

<svelte:head>
	<title>@yaebal/web — yaebal</title>
</svelte:head>

<h1>@yaebal/web</h1>
<p class="lead">
	run your bot on edge/web runtimes — cloudflare workers, deno deploy, bun, vercel edge — via
	webhooks
</p>

<h2>install</h2>
<Code code={install} title="terminal" lang="sh" />

<h2>usage</h2>
<p>
	no long-polling: each incoming <code>Request</code> becomes one update.
	<code>webhook(bot, options?)</code> returns a standard
	<code>(Request) =&gt; Promise&lt;Response&gt;</code>. drop it into any runtime that speaks fetch —
	that's all an edge bot needs.
</p>
<Code code={workers} title="worker.ts" />

<h2>standalone server (bun / deno)</h2>
<p>
	<code>serve(bot, options?)</code> starts the runtime's native fetch server. it requires
	<strong>bun or deno</strong> — on node it throws.
</p>
<Code code={serveCode} title="server.ts" />

<h2>on node</h2>
<p>
	<code>serve()</code> has no node backend. instead wrap <code>nodeWebhookCallback</code> from
	<code>@yaebal/core</code> in a <code>node:http</code> server (or any node framework adapter).
</p>
<Code code={node} title="node-server.ts" />

<h2>register the webhook</h2>
<p>
	tell telegram where to send updates. the <code>secretToken</code> you set here must match the one
	you pass to <code>webhook()</code> / <code>serve()</code> — it's checked on every request.
</p>
<Code code={register} title="deploy.ts" />

<h2>api</h2>
<table>
	<thead><tr><th>export</th><th>signature</th><th>description</th></tr></thead>
	<tbody>
		<tr><td><code>webhook</code></td><td><code>(bot: UpdateSink, options?: WebhookOptions) =&gt; (Request) =&gt; Promise&lt;Response&gt;</code></td><td>fetch handler for edge/web runtimes</td></tr>
		<tr><td><code>serve</code></td><td><code>(bot: UpdateSink, options?: ServeOptions) =&gt; void</code></td><td>standalone fetch server — bun or deno only</td></tr>
		<tr><td><code>setWebhook</code></td><td><code>(bot, url: string, options?: SetWebhookOptions) =&gt; Promise&lt;void&gt;</code></td><td>register the webhook with telegram</td></tr>
		<tr><td><code>deleteWebhook</code></td><td><code>(bot, dropPendingUpdates?: boolean) =&gt; Promise&lt;void&gt;</code></td><td>remove the webhook (back to long-polling)</td></tr>
		<tr><td><code>ServeOptions</code></td><td><code>WebhookOptions &amp; &#123; port?: number; hostname?: string &#125;</code></td><td>options for <code>serve()</code></td></tr>
		<tr><td><code>SetWebhookOptions</code></td><td>interface</td><td>see below</td></tr>
		<tr><td><code>WebhookOptions</code></td><td>re-export</td><td>from <code>@yaebal/core</code></td></tr>
		<tr><td><code>UpdateSink</code></td><td>re-export</td><td>from <code>@yaebal/core</code></td></tr>
	</tbody>
</table>

<h3>SetWebhookOptions</h3>
<table>
	<thead><tr><th>field</th><th>type</th><th>description</th></tr></thead>
	<tbody>
		<tr><td><code>secretToken</code></td><td><code>string</code></td><td>token telegram echoes in <code>X-Telegram-Bot-Api-Secret-Token</code>; pass the same value to <code>webhook</code>.</td></tr>
		<tr><td><code>allowedUpdates</code></td><td><code>string[]</code></td><td>restrict the update types telegram sends.</td></tr>
		<tr><td><code>dropPendingUpdates</code></td><td><code>boolean</code></td><td>drop updates that piled up while the webhook was unset.</td></tr>
		<tr><td><code>maxConnections</code></td><td><code>number</code></td><td>max simultaneous HTTPS connections (1–100).</td></tr>
	</tbody>
</table>

<div class="note">
	<strong>node has no <code>serve()</code>.</strong> the whole package is <code>fetch</code>-first
	with zero <code>node:</code> imports, so it runs on bun, deno and edge. on node, use
	<code>nodeWebhookCallback</code> from <code>@yaebal/core</code>; on edge, just export
	<code>&#123; fetch: webhook(bot) &#125;</code>. the operator dashboard moved to
	<a href="/docs/plugins/panel/">@yaebal/panel</a>.
</div>
