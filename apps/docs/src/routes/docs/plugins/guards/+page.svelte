<script lang="ts">
	import Code from "$lib/Code.svelte";
	import Try from "$lib/Try.svelte";

	const install = `pnpm add @yaebal/guards`;

	const basic = `import { and, command } from "@yaebal/filters";
import { isAdmin } from "@yaebal/guards";

// getChatMember only runs for an actual /ban, not for every message that passes through
bot.filter(and(command("ban"), isAdmin), banHandler);`;

	const withFilters = `import { and } from "@yaebal/filters";
import { isAdmin, isGroup } from "@yaebal/guards";

// every guard here also fits Filter<Context>'s shape, so it composes with and/or/not
bot.filter(and(isGroup, isAdmin), (ctx) => ctx.reply("welcome, admin"));`;

	const membership = `import { and, command } from "@yaebal/filters";
import { isAdmin, membership } from "@yaebal/guards";

bot.install(membership({ ttl: 60_000 }));
bot.filter(and(command("ban"), isAdmin), banHandler); // cached for 60s per (chat, user)`;

	const guardOrExample = `import { guardOr, isAdmin } from "@yaebal/guards";

// bot.guard() drops a failing update silently — guardOr answers it instead
bot.use(guardOr(isAdmin, (ctx) => ctx.reply("admins only"))).command("ban", banHandler);`;

	const anonymous = `import { hasMembership, hasPermission, isAdmin, isOwner } from "@yaebal/guards";

// an anonymous admin/owner ("hide my identity") is guaranteed to be at least an
// administrator, without an api call — isAdmin passes, isOwner denies (telegram never
// says which one they are), hasMembership needs both statuses accepted to pass them:
hasMembership("administrator"); // denies an anonymous poster
hasMembership("creator", "administrator"); // passes one — same rule isAdmin/isOwner use

// hasPermission can't check an anonymous poster's actual flags — deny by default, or opt in:
hasPermission("can_restrict_members", { allowAnonymous: true });`;

	const botPermission = `import { and, command } from "@yaebal/filters";
import { botHasPermission } from "@yaebal/guards";

bot.filter(and(command("pin"), botHasPermission("can_pin_messages")), (ctx) =>
  ctx.reply("I don't have permission to pin messages here."),
);`;

	const asGuardExample = `import { isChannel } from "@yaebal/filters";
import { asGuard } from "@yaebal/guards";

// adapt any synchronous, non-staging @yaebal/filters "who/where" predicate
bot.guard(asGuard(isChannel)).on("channel_post", onlyChannelPosts);`;

	const testing = `import { chatMemberUpdate, createTestEnv } from "@yaebal/test";

const env = createTestEnv(bot);
env.onApi("getChatMember", {
  status: "administrator",
  user: { id: 1, is_bot: false, first_name: "admin" },
  can_restrict_members: true,
});

// simulate telegram reporting a promotion/demotion — membership() invalidates on this
await env.dispatch(chatMemberUpdate({ chatId: -1, userId: 1, newStatus: "administrator" }));`;
</script>

<svelte:head>
	<title>@yaebal/guards — yaebal</title>
</svelte:head>

<h1>@yaebal/guards</h1>
<p class="lead">
	reusable <code>bot.guard()</code> predicates so "is this user allowed" checks aren't hand-rolled
	per project: <code>isPrivate</code>/<code>isGroup</code> reuse <a href="/docs/plugins/filters">
	@yaebal/filters</a>' chat-type filters, <code>isAdmin</code>/<code>hasMembership</code>/
	<code>hasPermission</code> do a live <code>getChatMember</code> lookup against the Bot API,
	<code>membership()</code> caches that lookup with event-driven invalidation, and
	<code>guardOr</code> answers a denied check instead of silently dropping the update.
</p>

<h2>install</h2>
<Code code={install} title="terminal" lang="sh" />

<h2>usage</h2>
<p>
	a membership-based guard calls <code>getChatMember</code> — put it behind something narrower
	than "every update" so it isn't called on every message in the chat:
</p>
<Code code={basic} title="bot.ts" />
<Try id="guards-private" title="playground" />

<h2>composes with @yaebal/filters</h2>
<p>
	every guard here fits <code>Filter&lt;Context&gt;</code>'s call shape
	(<code>(ctx) =&gt; boolean | Promise&lt;boolean&gt;</code>), so it works on
	<code>bot.guard()</code> and on <code>bot.filter()</code> combinators the same way.
</p>
<Code code={withFilters} title="bot.ts" />

<h2>caching: membership()</h2>
<p>
	every guard here also works without any setup, falling back to a direct
	<code>getChatMember</code> call. install <code>membership()</code> to cache that lookup per
	<code>(chat, user)</code>, so a burst of commands from the same admin doesn't cost a burst of
	api calls. cached entries are also dropped the instant telegram reports a real membership
	change (<code>chat_member</code>/<code>my_chat_member</code>) — a fresh promotion or demotion
	is never served stale, which a plain ttl alone can't guarantee.
</p>
<Code code={membership} title="bot.ts" />
<p>
	pass an existing <a href="/docs/plugins/cache"><code>@yaebal/cache</code></a> client via
	<code>{"{ cache }"}</code> to share one cache across plugins, or read
	<code>membership().cache</code> to pre-warm/inspect it directly.
</p>

<h2>answering a denial: guardOr</h2>
<p>
	<code>bot.guard()</code> drops a failing update silently — right for background filtering,
	wrong for a user-facing command, where <code>/ban</code> from a non-admin should get a reply,
	not silence.
</p>
<Code code={guardOrExample} title="bot.ts" />

<h2>anonymous admins &amp; linked channels</h2>
<p>
	an admin/owner posting with "hide my identity" on arrives with <code>from</code> set to
	<code>GroupAnonymousBot</code> and no user id bots can look up — a plain
	<code>getChatMember</code> on that id would just 400. every guard here already handles it:
	<code>isAdmin</code> treats an anonymous poster as at least an administrator (no api call
	needed — telegram guarantees that much), <code>isOwner</code> denies them (telegram never
	says whether they're the owner or "just" an administrator), <code>hasMembership(...)</code>
	grants them only when it would be correct either way, and the permission-checking guards deny
	them by default (their actual flags are unknowable) unless you opt in.
</p>
<Code code={anonymous} title="bot.ts" />
<p>
	<code>isAnonymousAdmin(ctx)</code> and <code>fromLinkedChannel(ctx)</code> (an automatic
	forward from a channel linked to this group — a different, unrelated case that also sets
	<code>ctx.senderChat</code>) are exported directly if you need to branch on either yourself.
</p>

<h2>checking the bot's own permissions</h2>
<p>
	<code>botIsAdmin</code>/<code>botHasPermission(permission)</code> mirror
	<code>isAdmin</code>/<code>hasPermission</code>, but for the bot itself (<code>ctx.me</code>)
	— check before an action that needs standing. <code>ctx.me</code> is only known once the bot
	has resolved its own identity (long polling fills it in after <code>getMe</code>); until then
	these deny.
</p>
<Code code={botPermission} title="bot.ts" />

<h2>asGuard — adapt a filter</h2>
<p>
	adapt any synchronous, non-staging <code>@yaebal/filters</code> "who/where" predicate
	(<code>chatType(...)</code>, <code>fromUser(...)</code>, <code>isChannel</code>,
	<code>isForum</code>, …) into a narrowing <code>bot.guard()</code> predicate.
	<code>isPrivate</code> and <code>isGroup</code> here are just <code>asGuard(...)</code> applied to
	<code>@yaebal/filters</code>' own <code>isPrivate</code>/<code>isGroup</code>. narrowing (and
	any properties enrichment already added upstream) survives no matter how enriched the context
	already is.
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
			<td><code>&lt;C extends Context&gt;(ctx: C) =&gt; ctx is C &amp; {"{ chat: Chat & { type: \"private\" } }"}</code></td>
			<td>chat is a private (1:1) chat — narrows <code>ctx.chat</code></td>
		</tr>
		<tr>
			<td><code>isGroup</code></td>
			<td><code>&lt;C extends Context&gt;(ctx: C) =&gt; ctx is C &amp; {"{ chat: Chat & { type: \"group\" | \"supergroup\" } }"}</code></td>
			<td>chat is a group or supergroup — narrows <code>ctx.chat</code></td>
		</tr>
		<tr>
			<td><code>isAdmin</code></td>
			<td><code>(ctx: Context) =&gt; Promise&lt;boolean&gt;</code></td>
			<td>chat owner, administrator, or an anonymous poster</td>
		</tr>
		<tr>
			<td><code>isOwner</code></td>
			<td><code>(ctx: Context) =&gt; Promise&lt;boolean&gt;</code></td>
			<td>specifically the chat's owner (an anonymous poster is denied)</td>
		</tr>
		<tr>
			<td><code>hasMembership</code></td>
			<td><code>(...statuses: ChatMemberStatus[]) =&gt; (ctx: Context) =&gt; Promise&lt;boolean&gt;</code></td>
			<td>current status is one of the given <code>ChatMemberStatus</code> values</td>
		</tr>
		<tr>
			<td><code>hasPermission</code></td>
			<td><code>(permission: ChatPermission, opts?: PermissionOptions) =&gt; (ctx: Context) =&gt; Promise&lt;boolean&gt;</code></td>
			<td>owner always passes; administrator passes when the flag is set</td>
		</tr>
		<tr>
			<td><code>hasAnyPermission</code></td>
			<td><code>(permissions: ChatPermission[], opts?: PermissionOptions) =&gt; (ctx: Context) =&gt; Promise&lt;boolean&gt;</code></td>
			<td>owner always passes; administrator passes when any listed flag is set</td>
		</tr>
		<tr>
			<td><code>hasAllPermissions</code></td>
			<td><code>(permissions: ChatPermission[], opts?: PermissionOptions) =&gt; (ctx: Context) =&gt; Promise&lt;boolean&gt;</code></td>
			<td>owner always passes; administrator passes when every listed flag is set</td>
		</tr>
		<tr>
			<td><code>botIsAdmin</code></td>
			<td><code>(ctx: Context) =&gt; Promise&lt;boolean&gt;</code></td>
			<td>the bot itself (<code>ctx.me</code>) is owner/administrator</td>
		</tr>
		<tr>
			<td><code>botHasPermission</code></td>
			<td><code>(permission: ChatPermission) =&gt; (ctx: Context) =&gt; Promise&lt;boolean&gt;</code></td>
			<td>the bot itself has the flag set</td>
		</tr>
		<tr>
			<td><code>isAnonymousAdmin</code></td>
			<td><code>(ctx: Context) =&gt; boolean</code></td>
			<td>update is an anonymous admin/owner post</td>
		</tr>
		<tr>
			<td><code>fromLinkedChannel</code></td>
			<td><code>(ctx: Context) =&gt; boolean</code></td>
			<td>update is an automatic forward from a linked channel</td>
		</tr>
		<tr>
			<td><code>resolveMember</code></td>
			<td><code>(ctx: Context, userId?: number) =&gt; Promise&lt;MemberResolution&gt;</code></td>
			<td>the low-level lookup every predicate above is built on</td>
		</tr>
		<tr>
			<td><code>membership</code></td>
			<td><code>(options?: MembershipOptions) =&gt; MembershipPlugin</code></td>
			<td>cache <code>getChatMember</code> lookups, invalidated by <code>chat_member</code>/<code>my_chat_member</code></td>
		</tr>
		<tr>
			<td><code>guardOr</code></td>
			<td><code>&lt;C extends Context&gt;(predicate, onDeny) =&gt; Middleware&lt;C&gt;</code></td>
			<td>gate like <code>guard()</code>, but answer a denial instead of dropping it</td>
		</tr>
		<tr>
			<td><code>asGuard</code></td>
			<td><code>(filter: Filter&lt;Context, Add&gt;) =&gt; &lt;C extends Context&gt;(ctx: C) =&gt; ctx is C &amp; Add</code></td>
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
	a <code>getChatMember</code> lookup that fails as telegram saying "no" (user not found, bot
	isn't in the chat, …) denies access. anything else — a network failure, a malformed response —
	throws through the predicate instead of masquerading as a deny; a permission check that fails
	silently and looks like a permissions bug forever is worse than one that's loud about an actual
	outage. an update's user is never treated as privileged by default.
</p>
<p>
	<code>asGuard</code> only accepts synchronous, non-staging filters — passing an async filter or
	one that stages bag data (<code>command()</code>, <code>regex()</code>, …) throws immediately
	rather than silently misbehaving. reach for <code>bot.filter()</code> for those instead.
</p>

<h2>testing</h2>
<p>
	<a href="/docs/plugins/test"><code>@yaebal/test</code></a> stubs every api call, so seed
	<code>getChatMember</code> directly, and simulate the promotion/demotion events
	<code>membership()</code> listens for with <code>chatMemberUpdate</code>/
	<code>myChatMemberUpdate</code>:
</p>
<Code code={testing} title="guards.test.ts" />

<div class="note">
	<strong>pairs with filters.</strong> <code>isPrivate</code>/<code>isGroup</code> are the same
	checks as <a href="/docs/plugins/filters">@yaebal/filters</a>' <code>isPrivate</code>/
	<code>isGroup</code>, just adapted for <code>bot.guard()</code> — reach for <code>filter()</code>
	instead when you also want the staged data (e.g. <code>command()</code>'s <code>ctx.args</code>).
</div>
