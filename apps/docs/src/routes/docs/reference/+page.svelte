<script lang="ts">
	import Code from "$lib/Code.svelte";

	const bot = `import { Bot } from "@yaebal/core";

const bot = new Bot(process.env.BOT_TOKEN!, {
  allowedUpdates: ["message", "callback_query"],
});

bot.onStart((me) => console.log("started @" + me.username));
bot.onError((error, ctx) => console.error(ctx.update.update_id, error));

// long polling — resolves only when bot.stop() is called
await bot.start();`;

	const webhook = `import { Bot, webhookCallback } from "@yaebal/core";

const bot = new Bot(process.env.BOT_TOKEN!);

// fetch-style handler — the webhook alternative to bot.start()
export default {
  fetch: webhookCallback(bot, { secretToken: process.env.WEBHOOK_SECRET }),
};`;

	const composer = `import { Composer, type Context, type Plugin } from "@yaebal/core";

const shared = new Composer()
  .decorate({ app: "shop" as const })
  .derive(async (ctx) => ({ requestId: crypto.randomUUID() }));

const feature = new Composer()
  .extend(shared)
  .command("start", (ctx) => ctx.reply(ctx.app));

type NeedsApp = Context & { app: string };
const plugin: Plugin<NeedsApp, { ready: true }> = (composer) =>
  composer.decorate({ ready: true as const });`;

	const api = `import { Bot } from "@yaebal/core";

const bot = new Bot(process.env.BOT_TOKEN!);

bot.api.before((method, params) => {
  console.log("telegram ->", method);
  return params;
});

bot.api.after((method, params, result) => result);

bot.api.onError((method, error, attempt) => {
  if (attempt < 3) return { retry: true, delayMs: 500 };
});

await bot.api.call("sendMessage", { chat_id: 123, text: "hello" });`;

	const storage = `import { Bot } from "@yaebal/core";
import { session, type StorageAdapter } from "@yaebal/session";

class RedisStorage<T> implements StorageAdapter<T> {
  get(key: string): Promise<T | undefined> { /* load */ throw new Error("todo"); }
  set(key: string, value: T): Promise<void> { /* save */ throw new Error("todo"); }
  delete(key: string): Promise<void> { /* delete */ throw new Error("todo"); }
}

const bot = new Bot(process.env.BOT_TOKEN!);

bot.install(session({
  initial: () => ({ count: 0 }),
  storage: new RedisStorage<{ count: number }>(),
}));`;
</script>

<svelte:head>
	<title>public api reference — yaebal</title>
</svelte:head>

<h1>public api reference</h1>
<p class="lead">
	the generated bot api reference covers telegram methods and objects. this page maps the public
	yaebal library surface: the engine, context, api client, plugin contracts and storage interfaces.
</p>

<div class="note">
	<strong>checked against source.</strong> the stable source of truth is the exported types from
	each package. this page is the human entry point; <code>pnpm docs:check</code> typechecks every
	snippet on this page against the workspace packages, so the examples cannot drift silently.
</div>

<h2>core package</h2>
<table>
	<thead><tr><th>symbol</th><th>kind</th><th>use it for</th></tr></thead>
	<tbody>
		<tr><td><code>Bot</code></td><td>class</td><td>token-bound composer with polling, lifecycle hooks, api client and webhook entrypoint</td></tr>
		<tr><td><code>Composer</code></td><td>class</td><td>standalone middleware chain for feature modules and plugin composition</td></tr>
		<tr><td><code>Context</code></td><td>class</td><td>base per-update wrapper with update accessors and reply/send helpers</td></tr>
		<tr><td><code>Api</code></td><td>interface</td><td>telegram api client with typed known methods, <code>call()</code> and hooks</td></tr>
		<tr><td><code>Plugin</code></td><td>type</td><td>composer extension that adds typed context fields</td></tr>
		<tr><td><code>BotPlugin</code></td><td>type</td><td>bot extension that needs bot-only lifecycle or api access</td></tr>
		<tr><td><code>Middleware</code></td><td>type</td><td>koa-style <code>(ctx, next)</code> handler</td></tr>
		<tr><td><code>Filter</code></td><td>interface</td><td>type-guard predicate consumed by <code>composer.filter()</code></td></tr>
		<tr><td><code>FilterQuery</code></td><td>type</td><td>grammy-style query strings such as <code>message:text</code></td></tr>
		<tr><td><code>MediaSource</code></td><td>type</td><td>file id, url, buffer or path input for media sends</td></tr>
		<tr><td><code>media</code></td><td>helper</td><td>builds a <code>MediaSource</code>: <code>media.path()</code>, <code>media.url()</code>, <code>media.buffer()</code>, <code>media.fileId()</code></td></tr>
		<tr><td><code>format</code></td><td>helper</td><td>entity-based formatting: tagged template plus <code>bold</code>, <code>italic</code>, <code>link</code>, …</td></tr>
		<tr><td><code>webhookCallback</code></td><td>function</td><td>fetch-style <code>(Request) =&gt; Promise&lt;Response&gt;</code> webhook handler</td></tr>
		<tr><td><code>TelegramError</code></td><td>class</td><td>thrown on failed api calls; carries <code>method</code>, <code>code</code>, <code>description</code>, <code>parameters</code></td></tr>
	</tbody>
</table>

<h2>bot</h2>
<p>
	<code>Bot&lt;C&gt;</code> extends <code>Composer&lt;C&gt;</code>. every context-enriching method keeps
	returning a bot so lifecycle methods stay reachable after <code>derive()</code>,
	<code>decorate()</code>, <code>install()</code> and <code>extend()</code>.
</p>
<Code code={bot} title="bot.ts" />
<p>
	long polling and webhooks are alternatives: call <code>start()</code> for polling, or skip it and
	export the <code>webhookCallback()</code> handler instead — see <a href="/docs/webhooks/">webhooks</a>
	for per-runtime setups.
</p>
<Code code={webhook} title="webhook.ts" />
<table>
	<thead><tr><th>api</th><th>description</th></tr></thead>
	<tbody>
		<tr><td><code>new Bot(token, options?)</code></td><td>creates the api client and composer-backed bot</td></tr>
		<tr><td><code>start()</code> / <code>stop()</code></td><td>long polling lifecycle</td></tr>
		<tr><td><code>handleUpdate(update)</code></td><td>run one update through the realized chain; used by webhooks and tests</td></tr>
		<tr><td><code>onStart()</code> / <code>onStop()</code> / <code>onError()</code></td><td>lifecycle and handler-failure hooks</td></tr>
		<tr><td><code>api</code></td><td>the low-level telegram api client</td></tr>
	</tbody>
</table>

<h2>composer</h2>
<p>
	<code>Composer</code> is the reusable middleware engine. feature files should usually export a
	composer, not a token-bound bot.
</p>
<Code code={composer} title="composer.ts" />
<table>
	<thead><tr><th>method</th><th>type behavior</th></tr></thead>
	<tbody>
		<tr><td><code>use(...middleware)</code></td><td>keeps the same context type</td></tr>
		<tr><td><code>on(query, ...handlers)</code></td><td>narrows handlers with <code>Filtered&lt;C, Q&gt;</code></td></tr>
		<tr><td><code>command()</code>, <code>hears()</code>, <code>callbackQuery()</code></td><td>attach match/command fields for the handler</td></tr>
		<tr><td><code>guard(predicate)</code></td><td>runtime gate, no type widening</td></tr>
		<tr><td><code>filter(filter, ...handlers)</code></td><td>uses the filter's type guard to narrow context</td></tr>
		<tr><td><code>derive()</code></td><td>async per-update enrichment; returns <code>Composer&lt;C &amp; D&gt;</code></td></tr>
		<tr><td><code>decorate()</code></td><td>static zero-per-update enrichment; returns <code>Composer&lt;C &amp; D&gt;</code></td></tr>
		<tr><td><code>install(plugin)</code></td><td>applies a typed plugin and checks its required input context</td></tr>
		<tr><td><code>extend(composer)</code></td><td>merges another composer and carries both context types forward</td></tr>
	</tbody>
</table>

<h2>context</h2>
<p>
	<code>Context</code> exposes the raw update plus safe accessors: <code>message</code>,
	<code>callbackQuery</code>, <code>from</code>, <code>chat</code>, <code>text</code>, routing helpers and
	base shortcuts such as <code>send()</code>, <code>reply()</code>, <code>sendPhoto()</code>,
	<code>sendDocument()</code>, <code>answerCallbackQuery()</code>. use <a href="/docs/contexts/">generated contexts</a>
	via <code>createBot()</code> when you want every schema-derived shortcut.
</p>

<h2>api client</h2>
<p>
	<code>Api</code> is deliberately small: known high-traffic methods are direct, every other telegram
	method goes through <code>call&lt;T&gt;()</code>, and hooks let plugins implement retry, logging,
	metrics and transforms.
</p>
<Code code={api} title="api.ts" />

<h2>plugin contracts</h2>
<table>
	<thead><tr><th>type</th><th>when to use</th></tr></thead>
	<tbody>
		<tr><td><code>Plugin&lt;In, Out&gt;</code></td><td>composer-only extension that requires <code>In</code> and adds <code>Out</code></td></tr>
		<tr><td><code>BotPlugin&lt;In, Out&gt;</code></td><td>extension that needs <code>bot.api</code>, lifecycle hooks or bot-only behavior</td></tr>
		<tr><td><code>Filter&lt;C, Add&gt;</code></td><td>type-narrowing predicate for <code>composer.filter()</code></td></tr>
	</tbody>
</table>

<h2>storage interfaces</h2>
<p>
	stateful plugins expose tiny storage contracts instead of global adapters. sessions use
	<code>StorageAdapter&lt;T&gt;</code>; broadcasts use <code>BroadcastStorage</code> for durable jobs and
	deliveries.
</p>
<Code code={storage} title="storage.ts" />

<h2>package references</h2>
<table>
	<thead><tr><th>package</th><th>primary exports</th></tr></thead>
	<tbody>
		<tr><td><code>yaebal</code></td><td><code>createBot</code>, generated contexts, common plugins and core re-exports</td></tr>
		<tr><td><code>@yaebal/core</code></td><td><code>Bot</code>, <code>Composer</code>, <code>Context</code>, <code>Api</code>, <code>media</code>, <code>format</code>, <code>webhookCallback</code></td></tr>
		<tr><td><code>@yaebal/types</code></td><td>generated telegram bot api types and method params</td></tr>
		<tr><td><code>@yaebal/contexts</code></td><td>generated per-update context classes and shortcut methods</td></tr>
		<tr><td><code>@yaebal/session</code></td><td><code>session</code>, <code>StorageAdapter</code>, <code>MemoryStorage</code></td></tr>
		<tr><td><code>@yaebal/broadcast</code></td><td><code>Broadcast</code>, <code>createBroadcast</code>, <code>BroadcastStorage</code>, <code>MemoryBroadcastStorage</code></td></tr>
	</tbody>
</table>

<div class="note">
	next: use <a href="/docs/api/">bot api reference</a> for telegram methods and
	<a href="/docs/packages/">packages map</a> for every first-party package.
</div>
