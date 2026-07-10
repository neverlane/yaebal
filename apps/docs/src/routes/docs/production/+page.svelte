<script lang="ts">
	import Code from "$lib/Code.svelte";

	const baseline = `import { createBot } from "yaebal";
import { autoRetry } from "@yaebal/again";
import { throttle } from "@yaebal/throttle";
import { ratelimiter } from "@yaebal/ratelimiter";

const bot = createBot(process.env.BOT_TOKEN!)
  .install(throttle({ globalPerSec: 30, perChatPerSec: 1, perGroupPerMin: 20 }))
  .install(autoRetry({ maxRetries: 5, maxDelayMs: 10_000, retryAfterPaddingMs: 250 }))
  .install(ratelimiter({ limit: 5, windowMs: 1000 }));`;

	const runner = `import { run, chatKey } from "@yaebal/runner";

const handle = run(bot, {
  concurrency: 50,
  sequentializeBy: chatKey,
  allowedUpdates: ["message", "callback_query"],
  onError: (error, update) => {
    console.error("update failed", update?.update_id, error);
  },
});

process.once("SIGTERM", () => void handle.stop());`;

	const webhook = `import { createBot, webhook } from "yaebal";

const bot = createBot(env.BOT_TOKEN);
bot.command("start", (ctx) => ctx.reply("running"));

export default {
  fetch: webhook(bot, { secretToken: env.WEBHOOK_SECRET }),
};`;

	const graceful = `let stopping = false;

process.once("SIGTERM", async () => {
  if (stopping) return;
  stopping = true;
  await bot.stop();
});`;

	const hooks = `bot.api.before((method, params) => {
  console.log("telegram ->", method);
  return params;
});

bot.api.after((method) => {
  console.log("telegram <-", method, "ok");
});

bot.onError((error, ctx) => {
  console.error("handler failed", ctx.update.update_id, error);
});`;
</script>

<svelte:head>
	<title>production — yaebal</title>
</svelte:head>

<h1>production</h1>
<p class="lead">
	a practical checklist for running yaebal bots under real traffic: retries, rate limits,
	concurrency, webhooks, shutdown, tests, and observability.
</p>

<h2>the baseline stack</h2>
<p>
	most production bots need three guards: retry transient telegram failures, throttle outgoing calls
	to avoid 429s, and rate-limit abusive users before expensive handlers run.
</p>
<Code code={baseline} title="bot.ts" />
<table>
	<thead><tr><th>piece</th><th>why</th></tr></thead>
	<tbody>
		<tr><td><a href="/docs/plugins/again/"><code>@yaebal/again</code></a></td><td>await structured retry_after waits and transient 5xx errors</td></tr>
		<tr><td><a href="/docs/plugins/throttle/"><code>@yaebal/throttle</code></a></td><td>schedule outgoing API calls through global/private/group buckets</td></tr>
		<tr><td><a href="/docs/plugins/ratelimiter/"><code>@yaebal/ratelimiter</code></a></td><td>drop spammy incoming updates before they hit business logic</td></tr>
	</tbody>
</table>

<h2>polling at scale</h2>
<p>
	plain <code>bot.start()</code> processes updates sequentially. use <code>@yaebal/runner</code>
	when one slow handler should not block unrelated chats. keep per-chat ordering enabled if handlers
	read and write session state.
</p>
<Code code={runner} title="runner.ts" />
<div class="note">
	<strong>ordering is a correctness feature.</strong> two updates from the same chat running at the
	same time can lose session writes. <code>chatKey</code> serializes each chat while unrelated chats
	still run in parallel.
</div>

<h2>webhooks for serverless and edge</h2>
<p>
	for cloudflare workers, deno deploy, vercel edge, and similar runtimes, use a fetch-style webhook.
	the handler validates the secret token in constant time and rejects oversized bodies.
</p>
<Code code={webhook} title="worker.ts" />
<p>
	register the webhook during deploy with <a href="/docs/plugins/web/"><code>@yaebal/web</code></a>
	or the raw bot api. keep the secret token in your host's secret store, not in source.
</p>

<h2>graceful shutdown</h2>
<p>
	on polling deployments, catch <code>SIGTERM</code> and let the bot stop cleanly. with runner,
	<code>handle.stop()</code> stops polling and drains in-flight updates. with plain polling,
	<code>bot.stop()</code> stops the loop.
</p>
<Code code={graceful} title="shutdown.ts" />
<p>
	background schedules need the same care: <a href="/docs/plugins/cron/"><code>@yaebal/cron</code></a>
	wires its jobs to <code>bot.onStart</code>/<code>onStop</code>, so <code>bot.stop()</code> won't
	resolve until any in-flight cron run drains — no separate shutdown hook to remember.
</p>

<h2>observability</h2>
<p>
	use api hooks for request-level logs/metrics and <code>bot.onError</code> for handler failures.
	do not log tokens, file download urls, raw secrets, or full user payloads in production logs.
</p>
<Code code={hooks} title="observability.ts" />

<h2>broadcasts</h2>
<p>
	for large audiences, use <a href="/docs/plugins/broadcast/"><code>@yaebal/broadcast</code></a>
	with persistent storage, bounded retry and an explicit rate limit. keep skipped recipients for
	cleanup, and remove users that blocked the bot when telegram returns 403.
</p>

<h2>state and storage</h2>
<table>
	<thead><tr><th>state</th><th>production advice</th></tr></thead>
	<tbody>
		<tr><td>sessions</td><td>use persistent storage for anything that must survive restarts; memory storage is dev-only</td></tr>
		<tr><td>scenes/conversations</td><td>prefer durable state for long flows; short prompt-style flows can be in-memory</td></tr>
		<tr><td>media cache</td><td>cache file ids so repeated sends do not re-upload the same bytes</td></tr>
	</tbody>
</table>

<h2>pre-release checklist</h2>
<ul>
	<li>run <code>pnpm typecheck</code> and your bot tests.</li>
	<li>exercise critical flows with <a href="/docs/plugins/test/">@yaebal/test</a>.</li>
	<li>set <code>allowedUpdates</code> explicitly for the update kinds you use.</li>
	<li>use webhook secret tokens in production.</li>
	<li>keep one polling process per token, or use webhooks.</li>
	<li>set a broadcast rate limit and storage adapter before large outbound flows.</li>
	<li>document how to rotate the bot token and webhook secret.</li>
</ul>
