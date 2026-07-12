<script lang="ts">
	import Code from "$lib/Code.svelte";

	const guardSetup = `import { createBot } from "yaebal";
import { guardOr, isAdmin, membership } from "@yaebal/guards";

export const bot = createBot(process.env.BOT_TOKEN!)
  // caches the getChatMember lookup isAdmin/isOwner/hasPermission need, with
  // event-driven invalidation — without it, every guard check is a live api call.
  .install(membership())
  .use(guardOr(isAdmin, (ctx) => ctx.reply("admins only")));`;

	const ban = `import { createBot } from "yaebal";
import { guardOr, isAdmin, membership } from "@yaebal/guards";

const bot = createBot(process.env.BOT_TOKEN!)
  .install(membership())
  .use(guardOr(isAdmin, (ctx) => ctx.reply("admins only")))
  .command("ban", async (ctx) => {
    const target = ctx.message?.reply_to_message?.from;
    if (!target) return ctx.reply("reply to a user first");

    // chat_id comes from ctx; userId defaults to the sender of *this* message
    // (i.e. the admin) when omitted — always pass it explicitly here.
    await ctx.ban(target.id);
  });`;

	const join = `import { createBot } from "yaebal";

const isAllowed = async (userId: number) => true;
const bot = createBot(process.env.BOT_TOKEN!);

bot.on("chat_join_request", async (ctx) => {
  if (await isAllowed(ctx.from.id)) {
    await ctx.approve();
  } else {
    await ctx.decline();
  }
});`;

	const member = `import { createBot } from "yaebal";

const bot = createBot(process.env.BOT_TOKEN!);

bot.on("chat_member", async (ctx) => {
  const update = ctx.update.chat_member!;
  console.log(update.from.id, update.old_chat_member.status, "->", update.new_chat_member.status);
});`;

	const mute = `import { createBot } from "yaebal";

const bot = createBot(process.env.BOT_TOKEN!);

bot.command("mute", async (ctx) => {
  const target = ctx.message?.reply_to_message?.from;
  if (!target) return ctx.reply("reply to a user first");

  // restricts (no messages) for 10 minutes, then telegram lifts it automatically.
  await ctx.mute(600, { user_id: target.id });
});`;
</script>

<svelte:head>
	<title>chat admin — yaebal</title>
</svelte:head>

<h1>chat admin</h1>
<p class="lead">
	build moderation bots for groups, supergroups, channels, join requests, permissions, and forum
	topics.
</p>

<h2>guard admin commands</h2>
<p>
	don't hand-roll "is this user an admin" per command — <a href="/docs/plugins/guards/">@yaebal/guards</a>
	ships <code>isAdmin</code>/<code>isOwner</code>/<code>hasPermission</code> as live
	<code>getChatMember</code> lookups, <code>membership()</code> to cache them, and
	<code>guardOr</code> to answer a denial instead of silently dropping the command.
</p>
<Code code={guardSetup} title="guard.ts" />

<h2>ban from a reply</h2>
<p>
	a simple admin command usually targets the user in the replied-to message. <code>ctx.ban(userId)</code>
	fills <code>chat_id</code> from the current chat; pass the target id explicitly, since it
	otherwise defaults to whoever sent the command.
</p>
<Code code={ban} title="ban.ts" />

<h2>approve or decline join requests</h2>
<p>
	join requests are opt-in updates. include <code>chat_join_request</code> in
	<code>allowedUpdates</code> when using long polling.
</p>
<Code code={join} title="join-request.ts" />

<h2>track member changes</h2>
<p>
	<code>chat_member</code> updates tell you when users join, leave, get promoted, or are restricted.
	they are useful for audit logs and permission caches.
</p>
<Code code={member} title="chat-member.ts" />

<h2>temporary restrictions</h2>
<p>
	<code>ctx.mute(seconds, params)</code> is sugar over <code>restrictChatMember</code> — telegram
	lifts the restriction itself once the duration elapses, no cron job needed.
</p>
<Code code={mute} title="mute.ts" />

<h2>admin checklist</h2>
<ul>
	<li>ask botfather for the permissions your bot actually needs.</li>
	<li>check <code>botIsAdmin</code>/<code>botHasPermission</code> (also from <code>@yaebal/guards</code>) before promising a moderation feature — the bot needs the right permission, not just the caller.</li>
	<li>handle supergroup migrations if your bot stores old group ids.</li>
	<li>keep audit logs for destructive actions — see <a href="/docs/production/observability/">observability</a>.</li>
	<li>rate-limit public admin commands to avoid accidental spam.</li>
</ul>
