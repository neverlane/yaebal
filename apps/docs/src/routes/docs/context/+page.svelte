<script lang="ts">
	import Code from "$lib/Code.svelte";
	import Try from "$lib/Try.svelte";

	const base = `import type { Context } from "@yaebal/core";

declare const ctx: Context;

ctx.update;      // the raw Update
ctx.updateType;  // "message" | "callback_query" | …
ctx.message;     // message ?? edited_message ?? channel_post ??
                 // edited_channel_post ?? business_message ?? edited_business_message
ctx.from;        // User | undefined — sender, from any of ~13 update kinds
ctx.chat;        // Chat | undefined — chat, from any of ~10 update kinds
ctx.text;        // message.text ?? message.caption
ctx.entities;     // message.entities ?? message.caption_entities
ctx.senderChat;  // Chat | undefined — set for anonymous admins / linked-channel posts
ctx.me;          // this bot's own account, once known (see /docs/webhooks)
ctx.is("callback_query"); // puregram-style narrowing check`;

	const send = `import { Bot } from "@yaebal/core";

const bot = new Bot(process.env.BOT_TOKEN!);

bot.on("message:text", async (ctx) => {
  await ctx.send("hi");                       // to the current chat
  await ctx.reply("yo");                       // reply_parameters set for you
  await ctx.sendPhoto("AgAC…");                // file_id or url string
  await ctx.send({ text: "hi", disable_notification: true }); // object form
});

bot.on("callback_query", (ctx) =>
  ctx.answerCallbackQuery({ text: "got it" }), // no-op if no query
);`;

	const routing = `import { Bot } from "@yaebal/core";

const bot = new Bot(process.env.BOT_TOKEN!);

// send/reply thread the update's own routing through automatically:
bot.on("message", async (ctx) => {
  await ctx.reply("noted");
  // - inside a forum topic         → stays in that topic (message_thread_id)
  // - in a channel's DM topic      → stays in that topic (direct_messages_topic_id)
  // - via a connected business account → sent AS that account (business_connection_id),
  //   not from the bot's own chat with the user
});

// routing()/businessRouting() are exposed so plugins building their own
// api.call(...) params (editMessageText, deleteMessage, …) get the same
// behavior instead of re-deriving it by hand:
bot.command("pin", async (ctx) => {
  await ctx.api.call("pinChatMessage", {
    chat_id: ctx.chat!.id,
    message_id: ctx.message!.message_id,
    ...ctx.businessRouting(),
  });
});`;

	const filters = `import { Bot } from "@yaebal/core";

const bot = new Bot(process.env.BOT_TOKEN!);

bot.on("message:text", (ctx) => ctx.text);        // string
bot.on("message:caption", (ctx) => ctx.text);     // caption also fills .text
bot.on("message:entities", (ctx) => ctx.entities); // MessageEntity[]
bot.on("callback_query:data", (ctx) => ctx.callbackQuery);
bot.on("message:photo", (ctx) => ctx.message.photo); // PhotoSize[], non-optional
bot.on(":photo", (ctx) => { /* any update with a message.photo, not just "message" */ });`;

	const match = `// matchQuery splits "message:text" into head + fields and checks each
// (always against the raw update — enrichment can't change what matches):
//   head  → must equal ctx.updateType
//   text  → the update's message.text is a non-empty string
//   caption → the update's message.caption is a non-empty string (distinct from :text)
//   data  → update.callback_query.data is set
//   entities → the message's entities (or caption_entities) have length
//   <other> → truthy on the message's [field] (e.g. photo, document, sticker, …)`;

	const l2fields = `photo | video | sticker | audio | voice | document | animation | contact |
location | poll | dice | venue | video_note | game | invoice | successful_payment |
web_app_data`;

	const filtered = `// Filtered<C, Q> — how a query narrows the context type:
//   "…:text" | "…:caption"     →  C & { text: string }
//   "…:data" | "callback_query" →  C & { callbackQuery: CallbackQuery }
//   "…:entities…"               →  C & { entities: MessageEntity[] }
//   "…:photo" | "…:video" | …   →  C & { message: Message & { photo: PhotoSize[] } } (etc.)
//   anything else               →  C  (unchanged)

import { Bot } from "@yaebal/core";
const bot = new Bot(process.env.BOT_TOKEN!);

bot.on("message:text", (ctx) => {
  ctx.text;          // string, not string | undefined
});
bot.on("callback_query:data", (ctx) => {
  ctx.callbackQuery; // CallbackQuery, guaranteed present
});
bot.on("message:photo", (ctx) => {
  ctx.message.photo; // PhotoSize[], guaranteed present — no "?." needed
});`;

	const composableFilters = `import { Composer } from "@yaebal/core";
import { and, filters } from "@yaebal/filters";

// a Filter may be async and *stage* fields (regex stages ctx.match) — nothing
// touches the context until the whole tree matches, so a rejected branch never
// leaks partial data. combine any filters with and()/or()/not().
new Composer()
  .filter(filters.regex(/^ticket (.+)$/i), (ctx) =>
    ctx.reply(\`ticket created: \${ctx.match[1]}\`),
  )
  .filter(and(filters.isPrivate, filters.text), (ctx) =>
    ctx.reply(\`private text from \${ctx.from?.first_name}: \${ctx.text}\`),
  );`;

	const enrich = `import { Bot } from "@yaebal/core";

const bot = new Bot(process.env.BOT_TOKEN!)
  .derive(async (ctx) => ({ user: await Promise.resolve({ id: ctx.from!.id }) })) // per-request
  .decorate({ appVersion: "1.0.0" })                                             // static
  .on("message:text", (ctx) => {
    ctx.user;        // ✅ from derive
    ctx.appVersion;  // ✅ from decorate
    ctx.text;        // ✅ from the filter query
  });`;
</script>

<svelte:head>
	<title>context — yaebal</title>
</svelte:head>

<h1 data-pagefind-meta="title">context &amp; filters</h1>
<p class="lead">
	one object wraps each update, exposes typed accessors, and grows new properties as the chain
	enriches it — while filter queries and composable filters route on the raw update and narrow
	that object's type.
</p>

<h2>the base context</h2>
<p>
	every update is wrapped in a <code>Context</code>. it holds the raw <code>update</code> and a
	detected <code>updateType</code>, and derives the common shapes through getters — so
	<code>ctx.message</code> already resolves across every message-carrying update kind, and
	<code>ctx.text</code>/<code>ctx.entities</code> fall back from the text fields to the caption
	ones.
</p>
<Code code={base} title="handler.ts" />
<p>
	<code>ctx.from</code> and <code>ctx.chat</code> each read from around a dozen different update
	shapes (messages, callback queries, chat member updates, join requests, reactions, …), so a
	handler that only cares "who/where" never has to know which kind of update it's looking at.
	<code>ctx.senderChat</code> is set when the message was posted by an anonymous admin/owner or
	forwarded automatically from a linked channel — <a href="/docs/plugins/guards"
		>@yaebal/guards</a
	>' <code>isAnonymousAdmin</code>/<code>fromLinkedChannel</code> key off exactly this.
</p>

<h2>sending from the context</h2>
<p>
	the context carries a handful of hand-written shortcuts that infer the chat from the current
	update. <code>send</code>/<code>reply</code> accept a plain string plus an extra-params object,
	<em>or</em> a single params object (<code>{'{ text, ...sendMessageParams }'}</code>); the media
	shortcuts accept a <code>MediaSource</code> or a raw <code>file_id</code>/url string, and their
	<code>caption</code> accepts a plain string or a <a href="/docs/plugins/fmt">fmt</a> result the
	same way <code>send</code>'s text does.
</p>
<Code code={send} title="send.ts" />
<div class="note">
	<strong>guard rails.</strong> <code>send</code>/<code>sendPhoto</code>/<code>sendDocument</code>
	reject if the update has no chat, and <code>answerCallbackQuery</code> resolves to
	<code>false</code> when there is no callback query — so they're safe to call unconditionally.
</div>

<h2>where a reply goes</h2>
<p>
	<code>send</code>/<code>reply</code>/<code>sendPhoto</code>/<code>sendDocument</code> don't just
	target the current chat — they carry the update's own routing along automatically, so a reply
	inside a forum topic or a business chat doesn't fall back to General or leak out of the
	connected account.
</p>
<Code code={routing} title="routing.ts" />

<h2>filter queries</h2>
<p>
	grammY-style <code>L1:L2:L3</code> queries route on the update. the first segment must match
	<code>ctx.updateType</code>; each following segment is a field that must be present.
</p>
<Code code={filters} title="filters.ts" />
<Code code={match} title="matchQuery" lang="text" />
<p>the <code>L2</code> field can be any of the recognized names, plus any message content field:</p>
<Code code={l2fields} title="message content fields" lang="text" />

<h2>how Filtered narrows</h2>
<p>
	the same query that routes also <strong>narrows the context type</strong>. <code>Filtered&lt;C,
	Q&gt;</code> is a conditional type: for the queries it knows, it intersects the matching field onto
	the context so your handler sees it as non-optional — including the message content fields
	above, not just <code>text</code>/<code>data</code>/<code>entities</code>.
</p>
<Code code={filtered} title="filtered.ts" />

<h2>composable filters</h2>
<p>
	filter <em>queries</em> cover routing on the update's shape; <a href="/docs/plugins/filters"
		>@yaebal/filters</a
	> covers routing on its <em>content</em>. <code>Composer.filter(filter, ...handlers)</code> runs a
	predicate — sync or async, optionally staging typed data (a matched regex becomes
	<code>ctx.match</code>) — and only commits that data onto the context once the whole filter
	tree matches, so a rejected <code>and</code> branch can never leak partial state. combine
	filters with <code>and</code>/<code>or</code>/<code>not</code>; any bare
	<code>(ctx) =&gt; boolean</code> is already a valid filter.
</p>
<Code code={composableFilters} title="composable-filters.ts" />
<Try id="filters-router" title="try it — feature routes" />

<h2>derive / decorate accumulation</h2>
<p>
	on top of filter-query narrowing, <code>derive</code> and <code>decorate</code> add their own
	properties to the context type, and those carry downstream to every handler after them in the
	chain — see <a href="/docs/core">core concepts</a> for the full derive-vs-decorate rules.
</p>
<Code code={enrich} title="enrich.ts" />

<h2>generated shortcuts</h2>
<p>
	the base <code>Context</code> shown here is intentionally small. the much larger set of
	per-update context classes — with API-method shortcuts generated from the Bot API schema — is the
	autogen layer.
</p>
<ul>
	<li><a href="/docs/contexts/">contexts</a> — the auto-generated context layer (the killer feature)</li>
</ul>
