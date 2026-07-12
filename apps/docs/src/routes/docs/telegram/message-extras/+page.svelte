<script lang="ts">
	import Code from "$lib/Code.svelte";

	const reply = `import { createBot } from "yaebal";

const bot = createBot(process.env.BOT_TOKEN!);

bot.on("message:text", async (ctx) => {
  await ctx.reply("threaded reply");

  await ctx.send("manual reply", {
    reply_parameters: { message_id: ctx.message!.message_id },
  });
});`;

	const quoteSnippet = `import { createBot } from "yaebal";

const bot = createBot(process.env.BOT_TOKEN!);

// quote() is sugar for reply_parameters.quote — replies pinned to a specific
// substring of the original message instead of the whole thing.
bot.on("message:text", (ctx) => ctx.quote(ctx.text.slice(0, 20), "about that part —"));`;

	const preview = `import { createBot } from "yaebal";

const bot = createBot(process.env.BOT_TOKEN!);

bot.command("share", (ctx) =>
  ctx.reply("https://yaebal.mom", {
    link_preview_options: {
      is_disabled: false,
      prefer_large_media: true,
    },
  }),
);`;

	const react = `import { createBot } from "yaebal";

const bot = createBot(process.env.BOT_TOKEN!);

bot.on("message:text", async (ctx) => {
  await ctx.react("🔥");          // one emoji
  await ctx.react("🔥", "12345"); // emoji + a custom emoji id
  await ctx.react();              // no args — clears this bot's reaction
});`;

	const markup = `import { createBot, InlineKeyboard } from "yaebal";

const bot = createBot(process.env.BOT_TOKEN!);

bot.command("pick", (ctx) =>
  ctx.reply("pick", {
    protect_content: true,
    disable_notification: true,
    reply_markup: new InlineKeyboard().text("ok", "ok"),
  }),
);`;

	const captions = `import { createBot, html, media } from "yaebal";

const bot = createBot(process.env.BOT_TOKEN!);

bot.command("pic", (ctx) =>
  // caption accepts the same FormatResult as text — html/md/format results are
  // split into caption + caption_entities automatically, same as ctx.send().
  ctx.sendPhoto(media.url("https://example.com/cat.jpg"), {
    caption: html\`<b>cute cat</b>, no filter\`,
  }),
);`;

	const effect = `import { createBot } from "yaebal";

const bot = createBot(process.env.BOT_TOKEN!);

// one of Telegram's small fixed set of animated effect ids (🔥 shown by clients
// as a full-screen animation) — there's no yaebal-side enum, it's a raw id
// telegram assigns; capture the ones you use as named constants in your own code.
const FIRE_EFFECT_ID = "5104841245755180586";

bot.command("celebrate", (ctx) => ctx.reply("🎉", { message_effect_id: FIRE_EFFECT_ID }));`;
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
<p><code>ctx.quote()</code> is sugar for the common "reply quoting part of the message" case:</p>
<Code code={quoteSnippet} title="quote.ts" />

<h2>link previews</h2>
<Code code={preview} title="preview.ts" />

<h2>reactions</h2>
<p>
	generated contexts expose convenience shortcuts like <code>ctx.react()</code> when you use
	<code>createBot()</code> from the meta package — it accepts a bare emoji, an emoji plus a custom
	emoji id, or no arguments at all to clear the bot's own reaction.
</p>
<Code code={react} title="reaction.ts" />

<h2>other send options</h2>
<Code code={markup} title="extras.ts" />

<h2>captions and entities</h2>
<p>
	a caption takes the same <code>FormatResult</code> a message body does —
	<a href="/docs/plugins/fmt/"><code>@yaebal/fmt</code></a>'s <code>html</code>/<code>md</code> or
	core's entity builders split into <code>caption</code>/<code>caption_entities</code>
	automatically, the same splitting <code>ctx.send()</code> does for plain text.
</p>
<Code code={captions} title="caption.ts" />

<h2>message effects</h2>
<p>
	<code>message_effect_id</code> plays a full-screen animation on private chats (🎉, 🔥, ❤️, 👍, 👎,
	💩 as of this writing) — send-only, private chats only, and only from a real params object (not
	available on every context shortcut's positional-string sugar).
</p>
<Code code={effect} title="effect.ts" />

<h2>formatting</h2>
<p>
	prefer entity-based formatting through <a href="/docs/plugins/fmt/"><code>@yaebal/fmt</code></a>
	or core builders. it avoids broken markdown/html escaping and makes user interpolation safe.
</p>
