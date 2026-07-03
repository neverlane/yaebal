<script lang="ts">
	import Code from "$lib/Code.svelte";

	const init = `// telegraf
import { Telegraf } from "telegraf";
const bot = new Telegraf(process.env.BOT_TOKEN!);
bot.launch();

// yaebal
import { createBot } from "yaebal";
const bot = createBot(process.env.BOT_TOKEN!);
await bot.start();`;

	const handlers = `// telegraf
bot.start((ctx) => ctx.reply("hello"));
bot.on("text", (ctx) => ctx.reply(ctx.message.text));
bot.action("ok", (ctx) => ctx.answerCbQuery("ok"));

// yaebal
bot.command("start", (ctx) => ctx.reply("hello"));
bot.on("message:text", (ctx) => ctx.reply(ctx.text));
bot.callbackQuery("ok", (ctx) => ctx.answerCallbackQuery({ text: "ok" }));`;

	const api = `// telegraf
await ctx.telegram.sendMessage(chatId, "hello");
await ctx.replyWithPhoto("file_id");

// yaebal
await ctx.api.sendMessage({ chat_id: chatId, text: "hello" });
await ctx.sendPhoto("file_id");`;

	const keyboard = `// telegraf
Markup.inlineKeyboard([[Markup.button.callback("yes", "yes")]]);

// yaebal
new InlineKeyboard().text("yes", "yes");`;

	const session = `// telegraf often uses ctx.session through middleware

// yaebal
const bot = createBot(token)
  .install(session({ initial: () => ({ count: 0 }) }))
  .command("count", (ctx) => ctx.reply(String(++ctx.session.count)));`;

	const webhook = `// yaebal node http
import { createServer } from "node:http";
import { nodeWebhookCallback } from "@yaebal/core/node";

createServer(nodeWebhookCallback(bot, { secretToken: process.env.SECRET })).listen(8080);`;
</script>

<svelte:head>
	<title>migrate from telegraf — yaebal</title>
</svelte:head>

<h1>migrate from telegraf</h1>
<p class="lead">
	telegraf and yaebal both feel like bot frameworks, but yaebal uses named bot api params, typed
	filter queries, and context additions that flow through the composer chain.
</p>

<h2>initialization</h2>
<Code code={init} title="init.ts" />

<h2>handlers</h2>
<Code code={handlers} title="handlers.ts" />

<h2>api calls</h2>
<Code code={api} title="api.ts" />

<h2>keyboards</h2>
<Code code={keyboard} title="keyboard.ts" />

<h2>sessions</h2>
<Code code={session} title="session.ts" />

<h2>webhooks</h2>
<Code code={webhook} title="webhook.ts" />

<h2>mapping table</h2>
<table>
	<thead><tr><th>telegraf</th><th>yaebal</th></tr></thead>
	<tbody>
		<tr><td><code>bot.start(handler)</code></td><td><code>bot.command("start", handler)</code></td></tr>
		<tr><td><code>bot.on("text")</code></td><td><code>bot.on("message:text")</code></td></tr>
		<tr><td><code>bot.action(data)</code></td><td><code>bot.callbackQuery(data)</code></td></tr>
		<tr><td><code>ctx.telegram</code></td><td><code>ctx.api</code></td></tr>
		<tr><td><code>ctx.replyWithPhoto</code></td><td><code>ctx.sendPhoto</code></td></tr>
		<tr><td><code>Markup.inlineKeyboard</code></td><td><code>InlineKeyboard</code></td></tr>
	</tbody>
</table>

<h2>migration checklist</h2>
<ul>
	<li>replace positional api calls with named param objects.</li>
	<li>replace <code>action</code> handlers with <code>callbackQuery</code>.</li>
	<li>replace context augmentation with typed plugins or <code>derive</code>/<code>decorate</code>.</li>
	<li>use <code>@yaebal/test</code> to pin behavior before changing production handlers.</li>
	<li>choose <code>webhookCallback</code>, <code>nodeWebhookCallback</code>, or <code>@yaebal/web</code> based on runtime.</li>
</ul>
