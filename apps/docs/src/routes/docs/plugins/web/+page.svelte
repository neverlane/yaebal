<script lang="ts">
	import Code from "$lib/Code.svelte";

	const install = `pnpm add @yaebal/web`;

	const workers = `import { Bot } from "@yaebal/core";
import { webhook } from "@yaebal/web";

// cloudflare workers / deno deploy / vercel edge / bun — no long-polling, just fetch
export default {
  fetch(request: Request, env: { BOT_TOKEN: string; SECRET: string }, ctx) {
    const bot = getBot(env); // build once per isolate, not per request
    return webhook(bot, { secretToken: env.SECRET })(request, ctx);
  },
};`;

	const adaptersCode = `import { expressAdapter, fastifyAdapter, honoAdapter, awsLambdaAdapter } from "@yaebal/web";

// express / google cloud functions / firebase
app.post("/", expressAdapter(bot, { secretToken: SECRET }));

// fastify
fastify.post("/", fastifyAdapter(bot, { secretToken: SECRET }));

// hono — also threads c.executionCtx.waitUntil
app.post("/", honoAdapter(bot, { secretToken: SECRET }));

// aws lambda (api gateway / function url)
export const handler = awsLambdaAdapter(bot, { secretToken: SECRET });`;

	const serveCode = `import { serve } from "@yaebal/web";

// node, bun, or deno — the native http server, no per-runtime branching
const server = await serve(bot, { port: 8080, secretToken: process.env.SECRET });
process.once("SIGINT", () => server.stop());
console.log(\`listening on \${server.url}\`);`;

	const hardening = `import { sequentialize, dedupe } from "@yaebal/web";

// telegram delivers webhook updates in parallel — order them per chat so
// sessions/scenes/conversations don't clobber each other. install this FIRST.
bot.use(sequentialize());

// drop the updates telegram redelivers when a request fails or times out.
bot.use(dedupe());`;

	const options = `webhook(bot, {
  secretToken: SECRET,      // require the X-Telegram-Bot-Api-Secret-Token header
  path: "/telegram",        // only serve this path; others hit fallback / 404
  fallback: () => new Response("ok"), // health checks, GET probes
  timeoutMs: 10_000,        // answer anyway after 10s so telegram won't redeliver
  onTimeout: "ack",         // "ack" (200, keep running) | "fail" (500, redeliver)
  onError: "fail",          // "fail" (500, redeliver) | "ack" (200, drop)
  maxBodyBytes: 1 << 20,    // streaming-enforced body cap (1 MiB default)
  reply: true,              // answer the webhook request with an api call (saves a round trip)
});`;

	const register = `import { setWebhook, getWebhookInfo, deleteWebhook } from "@yaebal/web";

// run once on deploy to point telegram at your url
await setWebhook(bot, "https://my-worker.workers.dev/", {
  secretToken: process.env.SECRET,
  allowedUpdates: ["message", "callback_query"],
  dropPendingUpdates: true,
  maxConnections: 40,
});

// diagnose stalled deliveries — pending_update_count, last_error_message, …
const info = await getWebhookInfo(bot);

// switch back to long-polling later
await deleteWebhook(bot, { dropPendingUpdates: true });`;
</script>

<svelte:head>
	<title>@yaebal/web — yaebal</title>
</svelte:head>

<h1>@yaebal/web</h1>
<p class="lead">
	run your bot on any runtime via webhooks — edge (cloudflare, deno, bun, vercel), node servers
	(express, fastify, koa), serverless (aws lambda, azure, google cloud functions), and fetch
	frameworks (hono, elysia, next.js, sveltekit)
</p>

<h2>install</h2>
<Code code={install} title="terminal" lang="sh" />

<h2>usage</h2>
<p>
	no long-polling: each incoming <code>Request</code> becomes one update.
	<code>webhook(bot, options?)</code> returns a standard
	<code>(Request, execution?) =&gt; Promise&lt;Response&gt;</code> that drops straight into any
	fetch runtime. the optional second argument is the platform context (cloudflare's
	<code>ctx</code>) — pass it so a slow update can finish via <code>waitUntil</code>.
</p>
<Code code={workers} title="worker.ts" />
<p>
	pass <code>botInfo</code> to the <code>Bot</code> constructor on serverless to skip the
	<code>getMe</code> cold-start round trip; otherwise the handler resolves it lazily on the first
	update, so <code>ctx.me</code> and <code>/cmd@botname</code> addressing work without
	<code>start()</code>.
</p>

<h2>framework adapters</h2>
<p>
	for frameworks whose handler shape isn't <code>(Request) =&gt; Response</code>, an adapter wraps
	the same handler. every adapter forwards the secret token and request path, so
	<code>secretToken</code> and <code>path</code> behave identically across all of them — and each
	is zero-<code>node:</code>-import (node bodies are read through the stream interface).
</p>
<Code code={adaptersCode} title="adapters.ts" />
<table>
	<thead><tr><th>adapter</th><th>runtime / framework</th></tr></thead>
	<tbody>
		<tr><td><code>honoAdapter</code></td><td>hono — wires <code>waitUntil</code></td></tr>
		<tr><td><code>elysiaAdapter</code></td><td>elysia</td></tr>
		<tr><td><code>cloudflareAdapter</code></td><td>cloudflare workers module syntax (<code>request, env, ctx</code>)</td></tr>
		<tr><td><code>nextAdapter</code></td><td>next.js app-router route handler (remix, astro too)</td></tr>
		<tr><td><code>svelteKitAdapter</code></td><td>sveltekit endpoint — reads <code>platform.context</code></td></tr>
		<tr><td><code>expressAdapter</code> / <code>gcfAdapter</code></td><td>express, google cloud functions, firebase</td></tr>
		<tr><td><code>fastifyAdapter</code></td><td>fastify</td></tr>
		<tr><td><code>koaAdapter</code></td><td>koa</td></tr>
		<tr><td><code>awsLambdaAdapter</code></td><td>aws lambda behind api gateway / function url</td></tr>
		<tr><td><code>azureAdapter</code></td><td>azure functions (v3 model)</td></tr>
	</tbody>
</table>
<p>all of them are also grouped on the <code>adapters</code> object — <code>adapters.express(bot)</code>.</p>

<h2>standalone server (node / bun / deno)</h2>
<p>
	<code>serve(bot, options?)</code> starts the runtime's native http server and resolves to a
	handle you can <code>stop()</code>. it works on <strong>node too</strong> (lazily importing
	<code>node:http</code>), so there's no per-runtime special-casing. on an edge platform with no
	server to own, export <code>&#123; fetch: webhook(bot) &#125;</code> instead.
</p>
<Code code={serveCode} title="server.ts" />

<h2>production hardening</h2>
<p>
	telegram fires webhook updates in parallel (up to <code>maxConnections</code>) and redelivers on
	failure. these two combinators are what a serious deployment needs:
</p>
<Code code={hardening} title="hardening.ts" />
<p>
	for defence in depth, <code>isTelegramIp(ip)</code> checks the peer against telegram's published
	subnets — pass the client ip your platform exposes
	(<code>cf-connecting-ip</code>, <code>x-forwarded-for</code>, <code>req.ip</code>).
</p>

<h2>webhook options</h2>
<Code code={options} title="options.ts" />

<h2>register &amp; diagnose</h2>
<p>
	tell telegram where to send updates. the <code>secretToken</code> you set here must match the one
	you pass to <code>webhook()</code> / <code>serve()</code> — it's validated locally and checked on
	every request.
</p>
<Code code={register} title="deploy.ts" />

<h2>api</h2>
<table>
	<thead><tr><th>export</th><th>description</th></tr></thead>
	<tbody>
		<tr><td><code>webhook(bot, options?)</code></td><td>fetch handler <code>(Request, execution?) =&gt; Promise&lt;Response&gt;</code> for edge/web runtimes</td></tr>
		<tr><td><code>serve(bot, options?)</code></td><td>standalone http server on node/bun/deno; resolves to <code>&#123; url, port, stop() &#125;</code></td></tr>
		<tr><td><code>honoAdapter</code>, <code>expressAdapter</code>, …</td><td>per-framework handlers (see table above); also on the <code>adapters</code> object</td></tr>
		<tr><td><code>sequentialize(key?)</code></td><td>middleware: order updates per chat (or custom key)</td></tr>
		<tr><td><code>dedupe(options?)</code></td><td>middleware: drop redelivered <code>update_id</code>s</td></tr>
		<tr><td><code>isTelegramIp(ip)</code></td><td>is the peer in a telegram webhook subnet?</td></tr>
		<tr><td><code>setWebhook(bot, url, options?)</code></td><td>register the webhook (secret, allowed updates, ip, certificate, …)</td></tr>
		<tr><td><code>deleteWebhook(bot, options?)</code></td><td>remove the webhook; accepts <code>&#123; dropPendingUpdates &#125;</code> or a bare boolean</td></tr>
		<tr><td><code>getWebhookInfo(bot)</code></td><td>current status: pending count, last error, url</td></tr>
	</tbody>
</table>

<div class="note">
	<strong>node needs no special path.</strong> <code>serve()</code> runs everywhere; the package is
	<code>fetch</code>-first with zero <em>static</em> <code>node:</code> imports, so it still bundles
	for edge. for a hand-rolled node server you can also use <code>nodeWebhookCallback</code> from
	<code>@yaebal/core/node</code>. the operator dashboard lives in
	<a href="/docs/plugins/panel/">@yaebal/panel</a>.
</div>
