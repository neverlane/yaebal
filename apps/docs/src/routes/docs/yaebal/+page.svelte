<script lang="ts">
	import Code from "$lib/Code.svelte";

	const install = `pnpm add yaebal`;

	const quickstart = `import { Bot, html } from "yaebal";

const bot = new Bot(process.env.BOT_TOKEN!)
  .command("start", (ctx) => ctx.send("hi 🐴"))
  .on("message:text", (ctx) => ctx.reply(html\`you said: <b>\${ctx.text}</b>\`));

await bot.start(); // long polling — or hand updates to a webhook`;

	const rich = `import { createBot } from "yaebal";

const bot = createBot(process.env.BOT_TOKEN!);

bot.on("message:text", (ctx) => ctx.react("🔥"));          // MessageContext
bot.on("callback_query:data", (ctx) => ctx.answer("ok")); // CallbackQueryContext`;

	const keyboards = `import { InlineKeyboard, callbackData } from "yaebal";

const vote = callbackData("vote", { id: Number });

bot.command("poll", (ctx) =>
  ctx.send("pick one", {
    reply_markup: new InlineKeyboard()
      .text("👍", vote.pack({ id: 1 }))
      .text("👎", vote.pack({ id: 2 }))
      .build(),
  }),
);

bot.on("callback_query:data", (ctx) => {
  const data = vote.unpack(ctx.callbackQuery.data);
  if (data) ctx.answer(\`voted \${data.id}\`);
});`;

	const stateful = `import { session, i18n } from "yaebal";

bot.install(session({ initial: () => ({ count: 0 }) }));
bot.command("count", (ctx) => ctx.reply(\`#\${++ctx.session.count}\`));

bot.install(i18n({
  defaultLocale: "en",
  locales: { en: { hi: "hello" }, ru: { hi: "привет" } },
}));
bot.command("start", (ctx) => ctx.reply(ctx.t("hi")));`;

	const media = `import { media } from "yaebal";

bot.command("pic", (ctx) => ctx.sendPhoto(media.path("./cat.jpg"))); // node/bun/deno
// on edge, send media.url(...) / media.buffer(...) instead`;

	const edge = `import { Bot, webhook } from "yaebal";

export default {
  fetch(request: Request, env: { BOT_TOKEN: string; SECRET: string }) {
    const bot = new Bot(env.BOT_TOKEN);
    bot.command("start", (ctx) => ctx.reply("running on the edge ⚡"));
    return webhook(bot, { secretToken: env.SECRET })(request);
  },
};`;
</script>

<svelte:head>
	<title>meta — yaebal</title>
</svelte:head>

<h1>yaebal <span class="badge">meta</span></h1>
<p class="lead">
	the batteries-included entry point — the <a href="/docs/core/">core engine</a>, the auto-generated
	per-update contexts, and the most-used plugins behind a <strong>single import</strong>.
	<code>media.path()</code> just works on node, bun and deno, and the same bot runs behind long
	polling or a webhook on the edge. for a minimal build, use <a href="/docs/core/">@yaebal/core</a>
	directly.
</p>

<h2>install</h2>
<Code code={install} title="terminal" lang="sh" />

<h2>quick start</h2>
<Code code={quickstart} title="bot.ts" />
<p>
	<code>.on("message:text")</code> narrows the context — inside, <code>ctx.text</code> is a
	<code>string</code>, not <code>string | undefined</code>. every chain method (<code>command</code>
	/ <code>on</code> / <code>derive</code> / <code>install</code> / …) flows the context type
	forward, so plugin-added properties are typed with no casting.
</p>

<h2>rich, typed contexts</h2>
<p>
	<code>createBot()</code> grafts the auto-generated shortcut methods onto every update —
	<code>ctx.react</code>, <code>ctx.editText</code>, <code>ctx.pin</code>, … — typed to the matching
	update, not just present at runtime.
</p>
<Code code={rich} title="rich.ts" />

<h2>what's in the box</h2>
<p>one <code>import &#123; … &#125; from "yaebal"</code> gives you, ready to use:</p>
<table>
	<thead>
		<tr><th>from</th><th>exports</th><th>what</th></tr>
	</thead>
	<tbody>
		<tr><td>core</td><td><code>Bot</code>, <code>Composer</code>, <code>Context</code>, <code>media</code></td><td>the engine, filter queries, transports</td></tr>
		<tr><td>contexts</td><td><code>createBot</code>, per-update context classes</td><td>typed <code>ctx.react</code> / <code>ctx.editText</code> / …</td></tr>
		<tr><td><a href="/docs/plugins/keyboard/">keyboard</a></td><td><code>InlineKeyboard</code>, <code>Keyboard</code></td><td>fluent keyboard builders</td></tr>
		<tr><td><a href="/docs/plugins/callback-data/">callback-data</a></td><td><code>callbackData</code></td><td>typed <code>callback_data</code> pack / unpack</td></tr>
		<tr><td><a href="/docs/plugins/fmt/">fmt</a></td><td><code>html</code>, <code>md</code></td><td>tagged templates with auto-escaping</td></tr>
		<tr><td><a href="/docs/plugins/filters/">filters</a></td><td><code>filters</code>, <code>and</code>, <code>or</code>, <code>not</code></td><td>composable, type-narrowing filters</td></tr>
		<tr><td><a href="/docs/plugins/session/">session</a></td><td><code>session</code></td><td>per-chat state, pluggable storage</td></tr>
		<tr><td><a href="/docs/plugins/i18n/">i18n</a></td><td><code>i18n</code></td><td>per-chat locale, <code>ctx.t</code></td></tr>
		<tr><td><a href="/docs/plugins/web/">web</a></td><td><code>serve</code>, <code>webhook</code>, <code>setWebhook</code></td><td>webhooks on edge/web runtimes</td></tr>
	</tbody>
</table>

<h2>a quick tour</h2>
<p>keyboards + typed callback data:</p>
<Code code={keyboards} title="keyboards.ts" />
<p>per-chat sessions and i18n:</p>
<Code code={stateful} title="stateful.ts" />
<p>media — no platform package to pick:</p>
<Code code={media} title="media.ts" />
<p>run on the edge over webhooks:</p>
<Code code={edge} title="worker.ts" />

<div class="note">
	<strong>how the rich context works.</strong> core's <code>Bot</code> exposes a
	<code>contextFactory</code> hook; <code>yaebal</code> injects one (<code>richContext</code>) that
	builds the base <a href="/docs/context/">Context</a> and grafts the matching generated context's
	shortcut methods + payload fields onto it. core stays decoupled from
	<a href="/docs/contexts/">@yaebal/contexts</a> — the meta-package does the wiring.
</div>

<div class="note">
	the bundle covers the essentials. everything else is a first-party plugin you add as needed —
	auto-retry, scenes, conversations, routing, broadcast, the operator
	<a href="/docs/plugins/panel/">panel</a>, and more. see the
	<a href="/docs/plugins/">full plugin catalog</a>.
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
		font-family: "IBM Plex Mono", monospace;
	}
</style>
