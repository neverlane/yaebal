<script lang="ts">
	import Code from "$lib/Code.svelte";
	import Try from "$lib/Try.svelte";

	const install = `pnpm add @yaebal/filters`;

	const basic = `import { and, or, not, command, regex, deeplink, isPrivate, photo, video, fromUser } from "@yaebal/filters";

bot.filter(and(isPrivate, command("buy")), (ctx) => ctx.args);   // ctx.command, ctx.args, ctx.payload
bot.filter(regex(/^\\d+$/), (ctx) => ctx.match[0]);              // ctx.match: RegExpMatchArray
bot.filter(deeplink(/^ref_(\\d+)$/), (ctx) => ctx.match[1]);     // t.me/bot?start=ref_42
bot.filter(or(photo, video), (ctx) => ctx.message);              // narrowed message
bot.filter(not(fromUser(BANNED_ID)), handler);`;

	const method = `// composer.filter(filter, ...handlers) — runs handlers only when the filter matches.
// additions flow into the handler type, so everything a filter stages is typed:
bot.filter(command("add"), (ctx) => {
  ctx.command; // string
  ctx.args;    // string[]
  ctx.payload; // string — the raw text after the command
});

// any bare predicate is already a filter — async included:
bot.filter(async (ctx) => await isAllowed(ctx.from?.id), handler);`;

	const custom = `import { defineFilter } from "@yaebal/filters";

// stage typed data in the bag; it lands on ctx only if the whole tree matches
const vip = defineFilter<{ profile: Profile }>(async (ctx, bag) => {
  const profile = await db.profile(ctx.from?.id);
  if (!profile?.vip) return false;
  bag.profile = profile;
  return true;
});

bot.filter(and(vip, command("redeem")), (ctx) => {
  ctx.profile; // Profile — from vip
  ctx.args;    // string[] — from command
});`;

	const commands = `import { command } from "@yaebal/filters";

command("start");                             // /start, /START (case-insensitive)
command(["stop", "halt"]);                    // any of the names
command(/set_(\\d+)/);                         // regex name — groups in ctx.match
command("ban", { prefixes: ["!", "."] });     // !ban, .ban
command("exact", { caseSensitive: true });`;
</script>

<svelte:head>
	<title>@yaebal/filters — yaebal</title>
</svelte:head>

<h1>@yaebal/filters</h1>
<p class="lead">
	composable, type-narrowing update filters (the mtcute idea, made two-phase) for the core
	<code>composer.filter(...)</code> method. filters are plain predicates — sync or async — that
	may <em>stage</em> typed data; combine them with <code>and</code> / <code>or</code> /
	<code>not</code> and the additions flow through, for any number of filters.
</p>

<h2>install</h2>
<Code code={install} title="terminal" lang="sh" />

<h2>the filter() method</h2>
<p>
	<code>filter()</code> lives in core. a filter stages extra fields in a bag instead of touching
	the context; the bag is committed onto <code>ctx</code> only after the whole filter tree
	matched. a failing <code>and</code> branch or a matching filter inside <code>not</code> can
	never leak or corrupt anything — and because commit is centralized, filters can be
	<code>async</code>.
</p>
<Code code={method} title="filter.ts" />

<h2>usage</h2>
<Code code={basic} title="bot.ts" />
<Try id="filters-router" title="playground" />

<h2>commands and deep links</h2>
<p>
	<code>command()</code> follows the same routing rules as <code>composer.command()</code> —
	fresh messages only (an edited <code>/cmd</code> doesn't re-fire), message text only (a caption
	is not a command), <code>/cmd@other_bot</code> is skipped when <code>ctx.me</code> is known —
	and adds multiple names, regex names and custom prefixes on top.
</p>
<Code code={commands} title="commands.ts" />
<p>
	<code>start</code> matches <code>/start</code> in private chats, <code>startGroup</code> in
	groups, and <code>deeplink(param)</code> matches the <code>/start</code> payload
	(<code>t.me/bot?start=…</code>) against a string or regex.
</p>

<h2>built-in filters</h2>
<table>
	<thead>
		<tr><th>filter</th><th>matches</th><th>adds to ctx</th></tr>
	</thead>
	<tbody>
		<tr><td colspan="3"><strong>text</strong></td></tr>
		<tr><td><code>text</code></td><td>non-empty text or caption</td><td><code>text: string</code></td></tr>
		<tr><td><code>equals(s)</code> / <code>contains(s)</code> / <code>startsWith(s)</code> / <code>endsWith(s)</code></td><td>text comparison, optional <code>{"{ ignoreCase: true }"}</code></td><td><code>text: string</code></td></tr>
		<tr><td><code>regex(re)</code></td><td>text matches <code>re</code></td><td><code>match: RegExpMatchArray</code></td></tr>
		<tr><td colspan="3"><strong>commands</strong></td></tr>
		<tr><td><code>command(name?, opts?)</code></td><td>a <code>/command</code> — string, array or regex name</td><td><code>command</code>, <code>args</code>, <code>payload</code></td></tr>
		<tr><td><code>start</code> / <code>startGroup</code></td><td><code>/start</code> in private / group</td><td>command additions + narrowed <code>chat</code></td></tr>
		<tr><td><code>deeplink(param)</code></td><td><code>/start</code> payload equals or matches</td><td>command additions, <code>match</code> for regex</td></tr>
		<tr><td colspan="3"><strong>who / where</strong></td></tr>
		<tr><td><code>chatType(...t)</code></td><td>chat type in <code>t</code> (typed literals)</td><td>narrows <code>chat.type</code></td></tr>
		<tr><td><code>isPrivate</code> / <code>isGroup</code> / <code>isChannel</code> / <code>isForum</code></td><td>shorthand chat kinds</td><td>narrows <code>chat</code></td></tr>
		<tr><td><code>chatId(...ids)</code> / <code>fromUser(...ids)</code></td><td>ids or <code>@usernames</code> — messages, callback/inline queries, member updates, reactions, …</td><td>narrows <code>chat</code> / <code>from</code></td></tr>
		<tr><td><code>fromBot</code> / <code>isPremium</code></td><td>sender is a bot / premium user</td><td>narrows <code>from</code></td></tr>
		<tr><td colspan="3"><strong>message shape</strong></td></tr>
		<tr><td><code>media</code> / <code>mediaType(...k)</code></td><td>any media / given kinds — includes <code>paid_media</code> and <code>story</code></td><td>narrows <code>message</code></td></tr>
		<tr><td><code>photo</code>, <code>video</code>, <code>audio</code>, <code>voice</code>, <code>sticker</code>, <code>document</code>, <code>animation</code>, <code>videoNote</code>, <code>paidMedia</code>, <code>story</code></td><td>media shorthands</td><td>narrows <code>message</code></td></tr>
		<tr><td><code>location</code>, <code>contact</code>, <code>venue</code>, <code>poll</code>, <code>dice</code>, <code>game</code>, <code>invoice</code>, <code>successfulPayment</code></td><td>message payloads</td><td>narrows <code>message</code></td></tr>
		<tr><td><code>reply</code> / <code>forward</code> / <code>forwardOrigin(...t)</code> / <code>viaBot(...ids)</code></td><td>replies, forwards, inline-bot messages</td><td>narrows <code>message</code></td></tr>
		<tr><td><code>hasEntity(type?)</code></td><td>entity in text <em>or</em> caption</td><td><code>entities: MessageEntity[]</code> (the matching ones)</td></tr>
		<tr><td><code>service</code>, <code>newChatMembers</code>, <code>leftChatMember</code>, <code>pinnedMessage</code></td><td>service messages</td><td>narrows <code>message</code></td></tr>
		<tr><td colspan="3"><strong>other updates</strong></td></tr>
		<tr><td><code>callbackData(trigger)</code></td><td>callback data equals / matches</td><td><code>match</code> for regex, narrows <code>callbackQuery</code></td></tr>
		<tr><td><code>inlineQuery(trigger?)</code></td><td>inline query, optional text match</td><td><code>inlineQuery</code>, <code>match</code> for regex</td></tr>
		<tr><td><code>edited</code></td><td>edited message / post</td><td>—</td></tr>
		<tr><td><code>chatMemberStatus({"{ from?, to? }"})</code></td><td>member status transition</td><td><code>chatMember: ChatMemberUpdated</code></td></tr>
	</tbody>
</table>

<h2>combinators</h2>
<ul>
	<li><code>and(a, b, …)</code> — all must match; additions <strong>intersect</strong>. later members see what earlier ones staged. typed for any arity.</li>
	<li><code>or(a, b, …)</code> — first match wins; additions <strong>unite</strong> — when every branch stages the same field (e.g. <code>or(regex(a), regex(b))</code>), it stays plainly typed. a failed branch's staged data is discarded.</li>
	<li><code>not(a)</code> — inverts; no additions.</li>
</ul>
<div class="note">
	<code>and()</code> of nothing matches everything; <code>or()</code> of nothing matches nothing.
	everything is also under one namespace, mtcute-style:
	<code>import {"{ filters }"} from "@yaebal/filters"</code> then <code>filters.command(...)</code>.
</div>

<h2>custom filters</h2>
<p>
	a filter is just a function <code>(ctx, bag) =&gt; boolean | Promise&lt;boolean&gt;</code>. a
	bare predicate already works; use <code>defineFilter</code> to stage typed data — set every
	declared field on <code>bag</code> before returning <code>true</code>.
</p>
<Code code={custom} title="custom.ts" />

<div class="note">
	filter queries (<code>on("message:text")</code>) still exist and are great for the common case —
	<code>filter()</code> adds composition, async predicates, and typed data staging on top.
</div>
