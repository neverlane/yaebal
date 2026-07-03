<script lang="ts">
	import Code from "$lib/Code.svelte";

	const init = `// gramio
import { Bot } from "gramio";
const bot = new Bot(process.env.BOT_TOKEN as string);

// yaebal
import { createBot } from "yaebal";
const bot = createBot(process.env.BOT_TOKEN!);`;

	const handlers = `// gramio
bot.command("start", (ctx) => ctx.send("hello"));
bot.on("message", (ctx) => ctx.send(ctx.text ?? ""));
bot.callbackQuery("ok", (ctx) => ctx.answer());

// yaebal
bot.command("start", (ctx) => ctx.reply("hello"));
bot.on("message:text", (ctx) => ctx.reply(ctx.text));
bot.callbackQuery("ok", (ctx) => ctx.answerCallbackQuery());`;

	const context = `// gramio
const bot = new Bot(token)
  .derive(async (ctx) => ({ user: await loadUser(ctx.from!.id) }))
  .decorate({ version: "1.0.0" });

// yaebal
const bot = createBot(token)
  .derive(async (ctx) => ({ user: await loadUser(ctx.from!.id) }))
  .decorate({ version: "1.0.0" });`;

	const plugins = `// gramio
bot.extend(session());

// yaebal
bot.install(session({ initial: () => ({}) }));`;

	const formatting = [
		"// gramio",
		'ctx.send(format`${bold("hello")}`);',
		"",
		"// yaebal",
		'ctx.send(format`${bold("hello")}`);',
		"ctx.send(html`<b>hello</b>`);",
	].join("\n");

	const keyboard = `// gramio
new InlineKeyboard().text("yes", "yes");

// yaebal
new InlineKeyboard().text("yes", "yes");`;

	const webhook = `// yaebal fetch webhook
import { webhook } from "yaebal";

export default {
  fetch: webhook(bot, { secretToken: env.SECRET }),
};`;
</script>

<svelte:head>
	<title>migrate from gramio — yaebal</title>
</svelte:head>

<h1>migrate from gramio</h1>
<p class="lead">
	gramio and yaebal share the chainable composer idea, so migration is mostly naming, package
	selection, and runtime context wiring.
</p>

<h2>mental model</h2>
<table>
	<thead><tr><th>gramio</th><th>yaebal</th></tr></thead>
	<tbody>
		<tr><td><code>Bot</code> is a chainable composer</td><td><code>Bot</code> still extends <code>Composer</code></td></tr>
		<tr><td><code>.extend(plugin)</code></td><td><code>.install(plugin)</code> for plugins, <code>.extend(composer)</code> for composers</td></tr>
		<tr><td><code>ctx.send()</code></td><td><code>ctx.send()</code> and <code>ctx.reply()</code>; prefer <code>reply</code> when responding to a message</td></tr>
		<tr><td>format package</td><td>core entity builders plus <code>@yaebal/fmt</code> for html/markdown parsing</td></tr>
	</tbody>
</table>

<h2>initialization</h2>
<Code code={init} title="init.ts" />

<h2>handlers</h2>
<p>
	yaebal uses filter queries like <code>message:text</code> to narrow the context type. when a handler
	needs text, prefer that over a generic <code>message</code> route.
</p>
<Code code={handlers} title="handlers.ts" />

<h2>derive and decorate</h2>
<p>
	this part maps almost directly. keep async, per-update work in <code>derive</code> and static
	services in <code>decorate</code>.
</p>
<Code code={context} title="context.ts" />

<h2>plugins</h2>
<Code code={plugins} title="plugins.ts" />
<p>
	install order is type-checked. if a plugin requires <code>ctx.session</code>, install session first.
</p>

<h2>formatting</h2>
<Code code={formatting} title="formatting.ts" />

<h2>keyboards</h2>
<p>
	the fluent keyboard shape is intentionally familiar. yaebal also adds typed callback-data helpers.
</p>
<Code code={keyboard} title="keyboard.ts" />

<h2>webhooks</h2>
<Code code={webhook} title="webhook.ts" />

<h2>migration checklist</h2>
<ul>
	<li>replace app imports with <code>yaebal</code> or granular <code>@yaebal/*</code> packages.</li>
	<li>change plugin registration to <code>.install(plugin())</code>.</li>
	<li>replace generic text handlers with <code>on("message:text")</code>.</li>
	<li>use <code>createBot()</code> when you want generated context shortcuts at runtime.</li>
	<li>move tests to <a href="/docs/plugins/test/">@yaebal/test</a> actor flows.</li>
</ul>
