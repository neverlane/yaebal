<script lang="ts">
	import Code from "$lib/Code.svelte";

	const install = `pnpm add yaebal`;

	const setup = `import { createBot } from "yaebal";

export const bot = createBot(process.env.BOT_TOKEN!);
await bot.start();`;

	const handlers = `import { createBot } from "yaebal";

const bot = createBot(process.env.BOT_TOKEN!);

bot.command("start", (ctx) => ctx.reply("hi"));
bot.hears(/buy (.+)/, (ctx) => ctx.reply("matched"));
bot.callbackQuery(/^page:(\\d+)$/, (ctx) => ctx.answerCallbackQuery());
bot.on("message:text", (ctx) => ctx.text);
bot.on(":photo", (ctx) => ctx.reply("nice photo"));
bot.on("edited_message", (ctx) => ctx.reply("noticed the edit"));`;

	const enrich = `import { createBot } from "yaebal";

const loadUser = async (id: number) => ({ id, name: "somebody" });
const bot = createBot(process.env.BOT_TOKEN!)
  .derive(async (ctx) => ({ user: await loadUser(ctx.from!.id) }))
  .decorate({ version: "1.0.0" })
  .on("message:text", (ctx) => {
    ctx.user;
    ctx.version;
    ctx.text;
  });`;

	const keyboard = `import { createBot, InlineKeyboard, callbackData } from "yaebal";

const vote = callbackData("vote", { id: Number });
const bot = createBot(process.env.BOT_TOKEN!);

bot.command("poll", (ctx) =>
  ctx.reply("pick", {
    reply_markup: new InlineKeyboard()
      .text("yes", vote.pack({ id: 1 }))
      .text("no", vote.pack({ id: 2 }))
      .build(),
  }),
);`;

	const format = `import { html, format, bold, link, createBot } from "yaebal";

const bot = createBot(process.env.BOT_TOKEN!);
const user = { name: "Ann" };

bot.command("hi", (ctx) => {
  ctx.send(html\`<b>hello</b> \${user.name}\`);
  ctx.send(format\`\${bold("safe entities")} \${link("docs", "https://yaebal.mom")}\`);
});`;

	const editDelete = `import { createBot } from "yaebal";

const bot = createBot(process.env.BOT_TOKEN!);

bot.callbackQuery(/^refresh$/, async (ctx) => {
  await ctx.answerCallbackQuery(); // stop the client's loading spinner first
  await ctx.editText({ text: "refreshed @ " + new Date().toISOString() });
});

bot.command("cleanup", (ctx) => ctx.delete());`;

	const rawApi = `import { createBot } from "yaebal";

const bot = createBot(process.env.BOT_TOKEN!);

// every method is fully typed, generated straight from the Bot API schema —
// reach for this when there's no ctx shortcut yet, or you need a raw result.
await bot.api.call("sendChatAction", { chat_id: 123, action: "typing" });`;

	const errors = `import { createBot, TelegramError } from "yaebal";

const bot = createBot(process.env.BOT_TOKEN!);

bot.onError((error, ctx) => {
  if (error instanceof TelegramError && error.parameters?.retry_after) {
    console.warn("rate limited, retry after", error.parameters.retry_after);
    return;
  }
  console.error("update", ctx.update.update_id, "failed:", error);
});`;

	const media = `import { createBot, media } from "yaebal";

const bot = createBot(process.env.BOT_TOKEN!);

bot.command("pic", async (ctx) => {
  await ctx.sendPhoto(media.url("https://example.com/cat.jpg"));
  await ctx.sendDocument(media.path("./report.pdf"));
  await ctx.sendPhoto("AgACAgIAAx...");
});`;

	const plugins = `import { createBot, session, i18n } from "yaebal";

const bot = createBot(process.env.BOT_TOKEN!)
  .install(session({ initial: () => ({ count: 0 }) }))
  .install(i18n({ defaultLocale: "en", locales: { en: { hi: "hello" } } }))
  .command("count", (ctx) => ctx.reply(String(++ctx.session.count)));`;

	const scenesPrompt = `import { createBot } from "yaebal";
import { defineScene, scenes } from "@yaebal/scenes";
import { prompt } from "@yaebal/prompt";

const echo = defineScene({
  steps: [
    async (ctx) => {
      if (ctx.scene.firstTime) return ctx.send("say something");
      await ctx.send("you said: " + (ctx.text ?? ""));
      return ctx.scene.leave();
    },
  ],
});

const bot = createBot(process.env.BOT_TOKEN!)
  .install(scenes({ echo }))
  .install(prompt())
  .command("echo", (ctx) => ctx.scene.enter("echo"))
  .command("name", (ctx) => ctx.prompt("what's your name?", (ctx) => ctx.reply("hi, " + (ctx.text ?? ""))));`;

	const webhook = `import { createBot, webhook } from "yaebal";

const bot = createBot(process.env.BOT_TOKEN!);
export default { fetch: webhook(bot, { secretToken: process.env.WEBHOOK_SECRET }) };`;

	const test = `import { createTestEnv } from "@yaebal/test";
import { expect, test } from "vitest";
import { bot } from "./bot.js";

test("start", async () => {
  const env = createTestEnv(bot);
  const user = env.createUser({ firstName: "Linia" });

  await user.sendCommand("start");

  expect(env.lastApiCall("sendMessage")?.params?.text).toBeDefined();
});`;

	const packages = [
		["retry Telegram calls (retry_after, 5xx)", "@yaebal/again", "/docs/plugins/again/"],
		["throttle outgoing sends under Telegram's limits", "@yaebal/throttle", "/docs/plugins/throttle/"],
		["per-chat state", "@yaebal/session", "/docs/plugins/session/"],
		["multi-step wizards", "@yaebal/scenes", "/docs/plugins/scenes/"],
		["ask-one-question flows", "@yaebal/prompt", "/docs/plugins/prompt/"],
		["translated replies", "@yaebal/i18n", "/docs/plugins/i18n/"],
		["mass messaging with retry and progress", "@yaebal/broadcast", "/docs/plugins/broadcast/"],
		["concurrent long polling", "@yaebal/runner", "/docs/runner/"],
		["in-process bot tests", "@yaebal/test", "/docs/plugins/test/"],
	];
</script>

<svelte:head>
	<title>cheat sheet — yaebal</title>
</svelte:head>

<h1>cheat sheet</h1>
<p class="lead">the most common yaebal patterns on one page.</p>

<h2>setup</h2>
<Code code={install} lang="sh" title="terminal" />
<Code code={setup} title="bot.ts" />

<h2>handlers</h2>
<Code code={handlers} title="handlers.ts" />
<table>
	<thead><tr><th>method</th><th>use</th></tr></thead>
	<tbody>
		<tr><td><code>command</code></td><td><code>/start</code>, <code>/help</code>, command args</td></tr>
		<tr><td><code>hears</code></td><td>text/caption string or regexp matches</td></tr>
		<tr><td><code>callbackQuery</code></td><td>inline button callbacks</td></tr>
		<tr><td><code>on("message:text")</code></td><td>filter query with typed narrowing</td></tr>
		<tr><td><code>on(":photo")</code></td><td>any update carrying a photo — messages, edits, channel posts</td></tr>
		<tr><td><code>on("edited_message")</code></td><td>an edited message, not the original</td></tr>
	</tbody>
</table>

<h2>context enrichment</h2>
<Code code={enrich} title="enrich.ts" />

<h2>keyboards and callback data</h2>
<Code code={keyboard} title="keyboard.ts" />
<p>
	<code>.build()</code> is optional — <code>InlineKeyboard</code>/<code>Keyboard</code> implement
	<code>toJSON()</code>, so passing the builder straight to <code>reply_markup</code> works too.
	this page always calls it explicitly for clarity.
</p>

<h2>formatting</h2>
<Code code={format} title="format.ts" />

<h2>edit, delete, answer</h2>
<Code code={editDelete} title="edit.ts" />

<h2>raw api calls</h2>
<Code code={rawApi} title="raw.ts" />

<h2>error handling</h2>
<Code code={errors} title="errors.ts" />
<p>see <a href="/docs/core/#error-handling">core concepts</a> and <a href="/docs/hooks/">hooks &amp; errors</a>.</p>

<h2>media</h2>
<Code code={media} title="media.ts" />

<h2>sessions and i18n</h2>
<Code code={plugins} title="plugins.ts" />

<h2>scenes and prompts</h2>
<Code code={scenesPrompt} title="scenes.ts" />

<h2>webhooks</h2>
<Code code={webhook} title="worker.ts" />

<h2>testing</h2>
<Code code={test} title="bot.test.ts" />

<h2>which package do I need?</h2>
<table>
	<thead><tr><th>need</th><th>package</th></tr></thead>
	<tbody>
		{#each packages as [need, pkg, href]}
			<tr><td>{need}</td><td><a {href}><code>{pkg}</code></a></td></tr>
		{/each}
	</tbody>
</table>
