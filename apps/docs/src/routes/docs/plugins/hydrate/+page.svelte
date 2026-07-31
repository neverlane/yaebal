<script lang="ts">
	import Code from "$lib/Code.svelte";

	const install = `pnpm add @yaebal/hydrate`;

	const usage = `import { Bot } from "@yaebal/core";
import { hydrate, type HydratedMessage } from "@yaebal/hydrate";

const bot = new Bot(process.env.BOT_TOKEN!)
  .install(hydrate());

bot.command("start", async (ctx) => {
  const msg = (await ctx.send("counting…")) as HydratedMessage;

  await msg.editText("done");
  await msg.pin();
  // later…
  await msg.delete();
});

await bot.start();`;

	const ctxHydrate = `bot.on("callback_query", async (ctx) => {
  const message = ctx.callbackQuery?.message;
  // the api never returned this message — hydrate it explicitly (idempotent).
  if (message) await ctx.hydrate(message).editText("updated");
});`;

	const reactUsage = `// a bare emoji string is wrapped into { type: "emoji", emoji }
await msg.react("👍");

// arrays and full ReactionType values pass through untouched
await msg.react([{ type: "custom_emoji", custom_emoji_id: "123" }, "🔥"]);`;

	const standalone = `import { hydrateApi, hydrateMessage } from "@yaebal/hydrate";

// install the after-hook directly on a client (the plugin-free form)
hydrateApi(bot.api);

// or hydrate one message by hand, bound to a given client
const msg = hydrateMessage(bot.api, someMessage);
await msg.delete();`;

	const testing = `import { hydrateApi } from "@yaebal/hydrate";
import { createTestEnv } from "@yaebal/test";

const env = createTestEnv(bot);
hydrateApi(env.api);

// the mock's default send result is just { message_id } — return a full Message
// shape so shape-detection hydrates it:
env.onApi("sendMessage", (p) => ({
  message_id: 1,
  date: 0,
  chat: { id: p?.chat_id, type: "private" },
}));`;
</script>

<svelte:head>
	<title>@yaebal/hydrate — yaebal</title>
</svelte:head>

<h1>@yaebal/hydrate</h1>
<p class="lead">
	api call results come back "hydrated" — the <code>Message</code> returned by
	<code>ctx.send</code>, <code>ctx.reply</code> or <code>api.sendMessage</code> carries methods
	bound to itself, so a follow-up edit, delete, pin, forward, copy or reaction needs no
	<code>chat_id</code> or <code>message_id</code>. inspired by grammy's hydrate plugin, fitted to
	yaebal idioms (it hangs off <code>@yaebal/core</code>'s <code>api.after</code> hook).
</p>

<h2>install</h2>
<Code code={install} title="terminal" lang="sh" />

<h2>usage</h2>
<p>
	install <code>hydrate()</code> once. every <code>Message</code> an api call returns comes back
	with the methods attached at runtime. <code>ctx.send</code> still types its result as plain
	<code>Message</code> (core owns that signature), so cast to <code>HydratedMessage</code>, or run
	the value through <code>ctx.hydrate</code> to type it without a cast.
</p>
<Code code={usage} title="bot.ts" />

<h2>ctx.hydrate</h2>
<p>
	<code>hydrate()</code> also decorates the context with <code>ctx.hydrate(message)</code>, for
	messages the api never handed you directly — most often the callback query's message. it's
	idempotent, so calling it on an already-hydrated value is a no-op, and it binds to
	<code>ctx.api</code>, so the shortcuts route through whatever client built the update (a
	webhook-reply view, a test mock, …).
</p>
<Code code={ctxHydrate} title="bot.ts" />

<h2>methods</h2>
<p>each method targets the message it's attached to.</p>
<table>
	<thead>
		<tr><th>method</th><th>calls</th><th>resolves to</th></tr>
	</thead>
	<tbody>
		<tr><td><code>editText(text, extra?)</code></td><td><code>editMessageText</code></td><td><code>HydratedMessage | true</code></td></tr>
		<tr><td><code>editCaption(caption, extra?)</code></td><td><code>editMessageCaption</code></td><td><code>HydratedMessage | true</code></td></tr>
		<tr><td><code>editReplyMarkup(replyMarkup?, extra?)</code></td><td><code>editMessageReplyMarkup</code></td><td><code>HydratedMessage | true</code></td></tr>
		<tr><td><code>delete(extra?)</code></td><td><code>deleteMessage</code></td><td><code>true</code></td></tr>
		<tr><td><code>pin(extra?)</code></td><td><code>pinChatMessage</code></td><td><code>true</code></td></tr>
		<tr><td><code>unpin(extra?)</code></td><td><code>unpinChatMessage</code></td><td><code>true</code></td></tr>
		<tr><td><code>forward(chatId, extra?)</code></td><td><code>forwardMessage</code></td><td><code>HydratedMessage</code></td></tr>
		<tr><td><code>copy(chatId, extra?)</code></td><td><code>copyMessage</code></td><td><code>MessageId</code></td></tr>
		<tr><td><code>react(reaction, extra?)</code></td><td><code>setMessageReaction</code></td><td><code>true</code></td></tr>
	</tbody>
</table>
<p>
	<code>text</code> and <code>caption</code> accept a plain string or a
	<a href="/docs/plugins/fmt"><code>format</code>/<code>fmt</code></a> result. the business
	connection a message belongs to is threaded into its edits and pins automatically, the same way
	<code>ctx.send</code> routes new messages.
</p>
<Code code={reactUsage} title="react.ts" />

<h2>how it works</h2>
<p>
	hydration is shape-detected: any result with a numeric <code>message_id</code> and a
	<code>chat</code> object gets the methods, so it covers every message-returning method — including
	future ones — with no per-method list. <code>sendMediaGroup</code>'s array is walked element by
	element. <code>copyMessage</code>'s <code>MessageId</code> (no <code>chat</code>) is deliberately
	left alone. the methods are added as non-enumerable properties, so
	<code>JSON.stringify(msg)</code> and object spreads see the plain telegram payload, never the
	helpers.
</p>

<h2>standalone</h2>
<p>
	the extension points, if you don't want the full plugin: <code>hydrateApi(api)</code> installs the
	after-hook directly on a client, and <code>hydrateMessage(api, message)</code> hydrates one
	message by hand.
</p>
<Code code={standalone} title="standalone.ts" />

<h2>api</h2>
<table>
	<thead>
		<tr><th>export</th><th>signature</th><th>description</th></tr>
	</thead>
	<tbody>
		<tr>
			<td><code>hydrate</code></td>
			<td><code>() =&gt; BotPlugin&lt;Context, HydrateFlavor&gt;</code></td>
			<td>installable plugin — hydrates api results and adds <code>ctx.hydrate()</code></td>
		</tr>
		<tr>
			<td><code>hydrateApi</code></td>
			<td><code>(api: Api) =&gt; Api</code></td>
			<td>install the after-hook on a client directly; idempotent per client</td>
		</tr>
		<tr>
			<td><code>hydrateMessage</code></td>
			<td><code>&lt;M extends Message&gt;(api: Api, message: M) =&gt; M &amp; HydrateMessageMethods</code></td>
			<td>hydrate one message by hand, bound to a given client</td>
		</tr>
	</tbody>
</table>

<h3>HydrateFlavor</h3>
<table>
	<thead>
		<tr><th>member</th><th>signature</th><th>description</th></tr>
	</thead>
	<tbody>
		<tr>
			<td><code>hydrate</code></td>
			<td><code>&lt;M extends Message&gt;(message: M) =&gt; M &amp; HydrateMessageMethods</code></td>
			<td>attach the methods to a message the api didn't return; idempotent</td>
		</tr>
	</tbody>
</table>

<h2>testing</h2>
<p>
	<a href="/docs/plugins/test"><code>@yaebal/test</code></a> gives each api its own mock client, so
	install <code>hydrateApi</code> on <code>env.api</code> and return a full
	<code>Message</code> shape from the send you want hydrated:
</p>
<Code code={testing} title="hydrate.test.ts" />

<div class="note">
	<strong>types vs runtime.</strong> hydration happens at runtime for every message-returning
	call, but <code>ctx.send</code>'s static return type stays <code>Message</code> — core owns that
	signature and hydrate can't retype it. reach for <code>ctx.hydrate(...)</code> or a
	<code>HydratedMessage</code> cast when you want the methods typed.
</div>
