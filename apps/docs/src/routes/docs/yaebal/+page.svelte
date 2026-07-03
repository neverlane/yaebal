<script lang="ts">
	import Code from "$lib/Code.svelte";

	const install = `pnpm add yaebal`;

	const quickstart = `import { createBot, html } from "yaebal";

const bot = createBot(process.env.BOT_TOKEN!)
  .command("start", (ctx) => ctx.send("hi"))
  .on("message:text", (ctx) => ctx.reply(html\`you said: <b>\${ctx.text}</b>\`));

await bot.start();`;

	const botVsCreate = `import { Bot, createBot, richContext } from "yaebal";

// recommended for app code: rich generated contexts at runtime.
const bot = createBot(token);

// advanced: same Bot class, but you choose the context factory yourself.
const custom = new Bot(token, { contextFactory: richContext });

// bare new Bot(token) still has auto readFile and typed router overloads,
// but does not graft generated context methods at runtime unless you pass
// contextFactory or use createBot().`;

	const rich = `const bot = createBot(process.env.BOT_TOKEN!);

bot.on("message:text", (ctx) => ctx.react("🔥"));          // MessageContext
bot.on("callback_query:data", (ctx) => ctx.answer("ok")); // CallbackQueryContext`;

	const callbacks = `import { InlineKeyboard, callbackData } from "yaebal";

const vote = callbackData("vote", { id: Number });

bot.command("poll", (ctx) =>
  ctx.send("pick one", {
    reply_markup: new InlineKeyboard()
      .text("👍", vote.pack({ id: 1 }))
      .text("👎", vote.pack({ id: 2 }))
      .build(),
  }),
);

bot.callbackQuery(vote.pattern, (ctx) => {
  const data = vote.unpack(ctx.callbackQuery.data!);
  if (data) return ctx.answer("voted " + data.id);
});`;

	const stateful = `import { session, i18n } from "yaebal";

bot
  .install(session({ initial: () => ({ count: 0 }) }))
  .install(i18n({
    defaultLocale: "en",
    locales: { en: { hi: "hello" }, ru: { hi: "привет" } },
  }))
  .command("count", (ctx) => ctx.reply("#" + ++ctx.session.count))
  .command("start", (ctx) => ctx.reply(ctx.t("hi")));`;

	const media = `import { media } from "yaebal";

bot.command("pic", (ctx) => ctx.sendPhoto(media.path("./cat.jpg"))); // node/bun/deno
// on edge, send media.url(...) / media.buffer(...) instead`;

	const edge = `import { createBot, webhook } from "yaebal";

export default {
  fetch(request: Request, env: { BOT_TOKEN: string; SECRET: string }) {
    const bot = createBot(env.BOT_TOKEN);
    bot.command("start", (ctx) => ctx.reply("running on the edge"));

    return webhook(bot, { secretToken: env.SECRET })(request);
  },
};`;
</script>

<svelte:head>
	<title>meta — yaebal</title>
</svelte:head>

<h1 data-pagefind-meta="title">yaebal <span class="badge">meta</span></h1>
<p class="lead">
	the batteries-included entry point — the <a href="/docs/core/">core engine</a>, the auto-generated
	per-update contexts, and the most-used plugins behind a <strong>single import</strong>.
	<code>media.path()</code> works on node, bun and deno, and the same bot can run behind long polling
	or a fetch webhook. for a minimal build, use <a href="/docs/core/">@yaebal/core</a> directly.
</p>

<h2>install</h2>
<Code code={install} title="terminal" lang="sh" />

<h2>quick start</h2>
<Code code={quickstart} title="bot.ts" />
<p>
	use <code>createBot()</code> for normal app code: it wires runtime rich contexts, so generated
	shortcut methods like <code>ctx.react()</code> are both typed and actually present when handlers run.
</p>

<h2>Bot vs createBot</h2>
<Code code={botVsCreate} title="bot-vs-createbot.ts" />
<div class="note">
	<strong>important:</strong> <code>new Bot(token)</code> from <code>yaebal</code> adds the meta
	package conveniences such as auto file reading and richer router typings, but it does not install
	<code>richContext</code> automatically. use <code>createBot(token)</code>, or pass
	<code>{"{ contextFactory: richContext }"}</code> yourself, when you want generated context methods at
	runtime.
</div>

<h2>rich, typed contexts</h2>
<p>
	<code>createBot()</code> grafts the auto-generated shortcut methods onto every update —
	<code>ctx.react</code>, <code>ctx.editText</code>, <code>ctx.pin</code>, … — typed to the matching
	update and backed by the generated context classes.
</p>
<Code code={rich} title="rich.ts" />

<h2>exports</h2>
<table>
	<thead>
		<tr><th>from</th><th>exports</th><th>what</th></tr>
	</thead>
	<tbody>
		<tr><td>core</td><td><code>Bot</code>, <code>Composer</code>, <code>Context</code>, <code>media</code>, <code>format</code>, <code>createApi</code>, <code>TelegramError</code>, types</td><td>the engine, base context, media, entity formatting and API client</td></tr>
		<tr><td>contexts</td><td>all generated context classes and <code>contextFor</code></td><td>per-update context classes and shortcuts</td></tr>
		<tr><td>yaebal</td><td><code>createBot</code>, <code>richContext</code></td><td>meta-package runtime wiring for generated contexts</td></tr>
		<tr><td><a href="/docs/plugins/fmt/">fmt</a></td><td><code>html</code>, <code>md</code>, <code>htmlToEntities</code>, <code>mdToEntities</code></td><td>HTML/Markdown parsing into Telegram entities</td></tr>
		<tr><td><a href="/docs/plugins/filters/">filters</a></td><td><code>filters</code>, <code>and</code>, <code>or</code>, <code>not</code></td><td>composable, type-narrowing filters</td></tr>
		<tr><td><a href="/docs/plugins/keyboard/">keyboard</a></td><td><code>InlineKeyboard</code>, <code>Keyboard</code></td><td>fluent keyboard builders</td></tr>
		<tr><td><a href="/docs/plugins/callback-data/">callback-data</a></td><td><code>callbackData</code></td><td>typed <code>callback_data</code> pack / unpack</td></tr>
		<tr><td><a href="/docs/plugins/session/">session</a></td><td><code>session</code></td><td>per-chat state, pluggable storage</td></tr>
		<tr><td><a href="/docs/plugins/i18n/">i18n</a></td><td><code>i18n</code></td><td>per-chat locale, <code>ctx.t</code></td></tr>
		<tr><td><a href="/docs/plugins/web/">web</a></td><td><code>webhook</code>, <code>serve</code>, <code>setWebhook</code>, <code>deleteWebhook</code></td><td>fetch/webhook helpers for web runtimes</td></tr>
	</tbody>
</table>

<h2>a quick tour</h2>
<p>keyboards + typed callback data:</p>
<Code code={callbacks} title="callbacks.ts" />
<p>per-chat sessions and i18n:</p>
<Code code={stateful} title="stateful.ts" />
<p>media — no platform package to pick:</p>
<Code code={media} title="media.ts" />
<p>run on the edge over webhooks:</p>
<Code code={edge} title="worker.ts" />

<div class="note">
	<strong>how the rich context works.</strong> core's <code>Bot</code> exposes a
	<code>contextFactory</code> hook; <code>richContext</code> builds the base
	<a href="/docs/context/">Context</a> and grafts the matching generated context's shortcut methods,
	accessors and payload fields onto it. core stays decoupled from
	<a href="/docs/contexts/">@yaebal/contexts</a> — the meta-package does the wiring.
</div>

<style>
	.badge {
		display: inline-block;
		vertical-align: middle;
		margin-left: 10px;
		font-size: 11px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.6px;
		padding: 4px 9px;
		border-radius: 8px;
		background: var(--blue);
		color: var(--white);
		font-family: "JetBrains Mono", monospace;
	}
</style>
