<script lang="ts">
	import Code from "$lib/Code.svelte";

	const setup = `pnpm add yaebal

import { createBot } from "yaebal";
const bot = createBot(process.env.BOT_TOKEN!);
await bot.start();`;

	const handlers = `bot.command("start", (ctx) => ctx.reply("hi"));
bot.hears(/buy (.+)/, (ctx) => ctx.reply("matched"));
bot.callbackQuery(/^page:(\\d+)$/, (ctx) => ctx.answerCallbackQuery());
bot.on("message:text", (ctx) => ctx.text);`;

	const enrich = `const bot = createBot(token)
  .derive(async (ctx) => ({ user: await loadUser(ctx.from?.id) }))
  .decorate({ version: "1.0.0" })
  .on("message:text", (ctx) => {
    ctx.user;
    ctx.version;
    ctx.text;
  });`;

	const keyboard = `import { InlineKeyboard, callbackData } from "yaebal";

const vote = callbackData("vote", { id: Number });

await ctx.reply("pick", {
  reply_markup: new InlineKeyboard()
    .text("yes", vote.pack({ id: 1 }))
    .text("no", vote.pack({ id: 2 })),
});`;

	const format = [
		'import { html, format, bold, link } from "yaebal";',
		"",
		"await ctx.send(html`<b>hello</b> ${user.name}`);",
		'await ctx.send(format`${bold("safe entities")} ${link("docs", "https://yaebal.mom")}`);',
	].join("\n");

	const media = `import { media } from "yaebal";

await ctx.sendPhoto(media.url("https://example.com/cat.jpg"));
await ctx.sendDocument(media.path("./report.pdf"));
await ctx.sendPhoto("AgACAgIAAx...");`;

	const plugins = `import { session, i18n } from "yaebal";

const bot = createBot(token)
  .install(session({ initial: () => ({ count: 0 }) }))
  .install(i18n({ defaultLocale: "en", locales: { en: { hi: "hello" } } }))
  .command("count", (ctx) => ctx.reply(String(++ctx.session.count)));`;

	const webhook = `import { createBot, webhook } from "yaebal";

const bot = createBot(env.BOT_TOKEN);
export default { fetch: webhook(bot, { secretToken: env.SECRET }) };`;

	const test = `import { createTestEnv } from "@yaebal/test";

const env = createTestEnv(bot);
const user = env.createUser({ firstName: "Linia" });

await user.sendCommand("start");
env.lastApiCall("sendMessage")?.params?.text;`;
</script>

<svelte:head>
	<title>cheat sheet — yaebal</title>
</svelte:head>

<h1>cheat sheet</h1>
<p class="lead">the most common yaebal patterns on one page.</p>

<h2>setup</h2>
<Code code={setup} title="setup.ts" />

<h2>handlers</h2>
<Code code={handlers} title="handlers.ts" />
<table>
	<thead><tr><th>method</th><th>use</th></tr></thead>
	<tbody>
		<tr><td><code>command</code></td><td><code>/start</code>, <code>/help</code>, command args</td></tr>
		<tr><td><code>hears</code></td><td>text/caption string or regexp matches</td></tr>
		<tr><td><code>callbackQuery</code></td><td>inline button callbacks</td></tr>
		<tr><td><code>on("message:text")</code></td><td>filter query with typed narrowing</td></tr>
	</tbody>
</table>

<h2>context enrichment</h2>
<Code code={enrich} title="enrich.ts" />

<h2>keyboards and callback data</h2>
<Code code={keyboard} title="keyboard.ts" />

<h2>formatting</h2>
<Code code={format} title="format.ts" />

<h2>media</h2>
<Code code={media} title="media.ts" />

<h2>sessions and i18n</h2>
<Code code={plugins} title="plugins.ts" />

<h2>webhooks</h2>
<Code code={webhook} title="worker.ts" />

<h2>testing</h2>
<Code code={test} title="bot.test.ts" />

<h2>production defaults</h2>
<ul>
	<li><a href="/docs/plugins/again/"><code>@yaebal/again</code></a> for structured <code>retry_after</code> and 5xx retry.</li>
	<li><a href="/docs/plugins/throttle/"><code>@yaebal/throttle</code></a> for outgoing Telegram buckets and priority queues.</li>
	<li><a href="/docs/runner/"><code>@yaebal/runner</code></a> for concurrent polling with per-chat ordering.</li>
	<li><a href="/docs/plugins/test/"><code>@yaebal/test</code></a> for in-process bot tests.</li>
</ul>
