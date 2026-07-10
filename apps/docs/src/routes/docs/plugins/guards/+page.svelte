<script lang="ts">
	import Code from "$lib/Code.svelte";
	import Try from "$lib/Try.svelte";

	const install = `pnpm add @yaebal/guards`;

	const basic = `import { hasPermission, isAdmin, isGroup } from "@yaebal/guards";

bot.guard(isGroup).guard(isAdmin).command("ban", banHandler);

bot.guard(hasPermission("can_restrict_members")).command("mute", muteHandler);`;

	const withFilters = `import { and } from "@yaebal/filters";
import { isAdmin, isGroup } from "@yaebal/guards";

// every guard here also fits Filter<Context>'s shape, so it composes with and/or/not
bot.filter(and(isGroup, isAdmin), (ctx) => ctx.reply("welcome, admin"));`;

	const membership = `import { hasMembership } from "@yaebal/guards";

// live getChatMember lookup, not the chat_member update payload
bot.guard(hasMembership("member", "administrator", "creator")).on("message", membersOnly);`;

	const asGuardExample = `import { isChannel } from "@yaebal/filters";
import { asGuard } from "@yaebal/guards";

// adapt any synchronous, non-staging @yaebal/filters "who/where" predicate
bot.guard(asGuard(isChannel)).on("channel_post", onlyChannelPosts);`;

	const testing = `import { createTestEnv } from "@yaebal/test";

const env = createTestEnv(bot);
env.onApi("getChatMember", {
  status: "administrator",
  user: { id: 1, is_bot: false, first_name: "admin" },
  can_restrict_members: true,
});`;
</script>

<svelte:head>
	<title>@yaebal/guards — yaebal</title>
</svelte:head>

<h1>@yaebal/guards</h1>
<p class="lead">
	reusable <code>bot.guard()</code> predicates so "is this user allowed" checks aren't hand-rolled
	per project: <code>isPrivate</code>/<code>isGroup</code> reuse <a href="/docs/plugins/filters">
	@yaebal/filters</a>' chat-type filters, <code>isAdmin</code>/<code>hasMembership</code>/
	<code>hasPermission</code> do a live <code>getChatMember</code> lookup against the Bot API.
</p>

<h2>install</h2>
<Code code={install} title="terminal" lang="sh" />

<h2>usage</h2>
<Code code={basic} title="bot.ts" />
<Try id="guards-private" title="playground" />

<h2>composes with @yaebal/filters</h2>
<p>
	every guard here fits <code>Filter&lt;Context&gt;</code>'s call shape
	(<code>(ctx) =&gt; boolean | Promise&lt;boolean&gt;</code>), so it works on
	<code>bot.guard()</code> and on <code>bot.filter()</code> combinators the same way.
</p>
<Code code={withFilters} title="bot.ts" />

<h2>live membership checks</h2>
<p>
	<code>isAdmin</code>, <code>hasMembership</code> and <code>hasPermission</code> call
	<code>ctx.api.getChatMember({"{ chat_id, user_id }"})</code> — the chat member's <em>current</em>
	status, not the <code>chat_member</code> update payload
	(see <a href="/docs/plugins/filters"><code>chatMemberStatus</code></a> in
	<code>@yaebal/filters</code> for that transition-based check).
</p>
<Code code={membership} title="bot.ts" />

<h2>asGuard — adapt a filter</h2>
<p>
	adapt any synchronous, non-staging <code>@yaebal/filters</code> "who/where" predicate
	(<code>chatType(...)</code>, <code>fromUser(...)</code>, <code>isChannel</code>,
	<code>isForum</code>, …) into a narrowing <code>bot.guard()</code> predicate.
	<code>isPrivate</code> and <code>isGroup</code> here are just <code>asGuard(...)</code> applied to
	<code>@yaebal/filters</code>' own <code>isPrivate</code>/<code>isGroup</code>.
</p>
<Code code={asGuardExample} title="bot.ts" />

<h2>api</h2>
<table>
	<thead>
		<tr><th>export</th><th>signature</th><th>description</th></tr>
	</thead>
	<tbody>
		<tr>
			<td><code>isPrivate</code></td>
			<td><code>(ctx: Context) =&gt; ctx is Context & {"{ chat: Chat & { type: \"private\" } }"}</code></td>
			<td>chat is a private (1:1) chat — narrows <code>ctx.chat</code></td>
		</tr>
		<tr>
			<td><code>isGroup</code></td>
			<td><code>(ctx: Context) =&gt; ctx is Context & {"{ chat: Chat & { type: \"group\" | \"supergroup\" } }"}</code></td>
			<td>chat is a group or supergroup — narrows <code>ctx.chat</code></td>
		</tr>
		<tr>
			<td><code>isAdmin</code></td>
			<td><code>(ctx: Context) =&gt; Promise&lt;boolean&gt;</code></td>
			<td>chat owner or administrator — one live <code>getChatMember</code> call</td>
		</tr>
		<tr>
			<td><code>hasMembership</code></td>
			<td><code>(...statuses: ChatMemberStatus[]) =&gt; (ctx: Context) =&gt; Promise&lt;boolean&gt;</code></td>
			<td>current status is one of the given <code>ChatMemberStatus</code> values</td>
		</tr>
		<tr>
			<td><code>hasPermission</code></td>
			<td><code>(permission: ChatPermission) =&gt; (ctx: Context) =&gt; Promise&lt;boolean&gt;</code></td>
			<td>owner always passes; administrator passes when the flag is set</td>
		</tr>
		<tr>
			<td><code>asGuard</code></td>
			<td><code>(filter: Filter&lt;C, Add&gt;) =&gt; (ctx: C) =&gt; ctx is C & Add</code></td>
			<td>adapt a sync, non-staging <code>@yaebal/filters</code> predicate into a guard</td>
		</tr>
	</tbody>
</table>

<h3>ChatPermission</h3>
<p>
	derived from <code>ChatMemberAdministrator</code>'s <code>can_*</code> flags (minus
	<code>can_be_edited</code> and <code>is_anonymous</code>), so it always matches the current Bot
	API schema: <code>can_manage_chat</code>, <code>can_delete_messages</code>,
	<code>can_manage_video_chats</code>, <code>can_restrict_members</code>,
	<code>can_promote_members</code>, <code>can_change_info</code>, <code>can_invite_users</code>,
	<code>can_post_stories</code>, <code>can_edit_stories</code>, <code>can_delete_stories</code>,
	<code>can_post_messages</code>, <code>can_edit_messages</code>, <code>can_pin_messages</code>,
	<code>can_manage_topics</code>, <code>can_manage_direct_messages</code>,
	<code>can_manage_tags</code>.
</p>

<h2>behavior</h2>
<p>
	a failed <code>getChatMember</code> lookup — no <code>chat</code>/<code>from</code> on the update,
	or the bot can't see the chat — denies access rather than throwing. an update's user is never
	treated as privileged by default.
</p>

<h2>testing</h2>
<p>
	<a href="/docs/plugins/test"><code>@yaebal/test</code></a> stubs every api call, so seed
	<code>getChatMember</code> directly:
</p>
<Code code={testing} title="guards.test.ts" />

<div class="note">
	<strong>pairs with filters.</strong> <code>isPrivate</code>/<code>isGroup</code> are the same
	checks as <a href="/docs/plugins/filters">@yaebal/filters</a>' <code>isPrivate</code>/
	<code>isGroup</code>, just adapted for <code>bot.guard()</code> — reach for <code>filter()</code>
	instead when you also want the staged data (e.g. <code>command()</code>'s <code>ctx.args</code>).
</div>
