<script lang="ts">
	import Code from "$lib/Code.svelte";

	const reply = `await ctx.reply("threaded reply");

await ctx.send("manual reply", {
  reply_parameters: { message_id: ctx.message!.message_id },
});`;

	const preview = `await ctx.send("https://yaebal.mom", {
  link_preview_options: {
    is_disabled: false,
    prefer_large_media: true,
  },
});`;

	const react = `bot.on("message:text", async (ctx) => {
  await ctx.react("🔥");
});`;

	const markup = `await ctx.reply("pick", {
  protect_content: true,
  disable_notification: true,
  reply_markup: new InlineKeyboard().text("ok", "ok"),
});`;
</script>

<svelte:head>
	<title>message extras — yaebal</title>
</svelte:head>

<h1>message extras</h1>
<p class="lead">
	telegram messages have many optional controls: replies, link previews, notifications, protection,
	reactions, captions, entities, keyboards, and effects.
</p>

<h2>reply parameters</h2>
<p>
	<code>ctx.reply()</code> fills reply parameters for the current message. use raw params when you
	need custom threading behavior.
</p>
<Code code={reply} title="reply.ts" />

<h2>link previews</h2>
<Code code={preview} title="preview.ts" />

<h2>reactions</h2>
<p>
	generated contexts expose convenience shortcuts like <code>ctx.react()</code> when you use
	<code>createBot()</code> from the meta package.
</p>
<Code code={react} title="reaction.ts" />

<h2>other send options</h2>
<Code code={markup} title="extras.ts" />

<h2>formatting</h2>
<p>
	prefer entity-based formatting through <a href="/docs/plugins/fmt/"><code>@yaebal/fmt</code></a>
	or core builders. it avoids broken markdown/html escaping and makes user interpolation safe.
</p>
