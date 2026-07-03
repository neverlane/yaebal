<script lang="ts">
	import Code from "$lib/Code.svelte";

	const init = `// puregram
import { Telegram } from "puregram";
const tg = Telegram.fromToken(process.env.TOKEN!);

// yaebal
import { createBot } from "yaebal";
const bot = createBot(process.env.BOT_TOKEN!);`;

	const dispatch = `// puregram
tg.onMessage((message) => message.send("hello"));
tg.onCallbackQuery((query) => query.answer({ text: "ok" }));

// yaebal
bot.on("message:text", (ctx) => ctx.reply("hello"));
bot.on("callback_query:data", (ctx) => ctx.answerCallbackQuery({ text: "ok" }));`;

	const api = `// puregram raw layer
await tg.api.sendMessage({ chat_id: chatId, text: "hello" });

// yaebal typed shortcut if available
await bot.api.sendMessage({ chat_id: chatId, text: "hello" });

// yaebal escape hatch for every bot api method
await bot.api.call("sendMessage", { chat_id: chatId, text: "hello" });`;

	const plugins = `// puregram
const tg = Telegram.fromToken(token).extend(session());

// yaebal
const bot = createBot(token).install(session({ initial: () => ({}) }));`;

	const filters = `// puregram
tg.onMessage(filters.hasText, (message) => message.send(message.text));

// yaebal
bot.on("message:text", (ctx) => ctx.reply(ctx.text));`;

	const webhook = `// yaebal edge webhook
export default {
  fetch: webhook(bot, { secretToken: env.SECRET }),
};`;
</script>

<svelte:head>
	<title>migrate from puregram — yaebal</title>
</svelte:head>

<h1>migrate from puregram</h1>
<p class="lead">
	puregram is a thin wrapper around update classes. yaebal is a composer framework where handlers
	share one accumulating context.
</p>

<h2>mental model</h2>
<table>
	<thead><tr><th>puregram</th><th>yaebal</th></tr></thead>
	<tbody>
		<tr><td><code>Telegram</code> client</td><td><code>Bot</code> / <code>createBot()</code></td></tr>
		<tr><td>per-kind update objects</td><td>one context object with narrowed fields</td></tr>
		<tr><td><code>tg.extend(plugin)</code></td><td><code>bot.install(plugin)</code></td></tr>
		<tr><td><code>tg.api.method(params)</code></td><td><code>bot.api.method(params)</code> or <code>bot.api.call(name, params)</code></td></tr>
		<tr><td>filters namespace</td><td>filter queries and <code>@yaebal/filters</code></td></tr>
	</tbody>
</table>

<h2>initialization</h2>
<Code code={init} title="init.ts" />

<h2>dispatch</h2>
<Code code={dispatch} title="dispatch.ts" />

<h2>api calls</h2>
<p>
	yaebal has typed direct shortcuts for a growing method set and a generic <code>call</code> path for
	every method in the generated schema.
</p>
<Code code={api} title="api.ts" />

<h2>plugins</h2>
<Code code={plugins} title="plugins.ts" />

<h2>filters</h2>
<Code code={filters} title="filters.ts" />

<h2>webhooks</h2>
<Code code={webhook} title="webhook.ts" />

<h2>migration checklist</h2>
<ul>
	<li>replace update-object handlers with context handlers.</li>
	<li>use <code>on("message:text")</code>, <code>on("callback_query:data")</code>, and other filter queries for narrowing.</li>
	<li>move plugin installs to <code>.install()</code>.</li>
	<li>replace per-update shortcuts with generated <code>ctx.*</code> shortcuts when using <code>createBot()</code>.</li>
	<li>use <a href="/docs/production/">production</a> for runner/throttle/retry choices.</li>
</ul>
