<script lang="ts">
	import Code from "$lib/Code.svelte";

	const ban = `bot.command("ban", async (ctx) => {
  const target = ctx.reply_to_message?.from;
  if (!target) return ctx.reply("reply to a user first");

  await ctx.ban(target.id); // chat_id comes from ctx; defaults to the sender without an id
});`;

	const join = `bot.on("chat_join_request", async (ctx) => {
  if (await isAllowed(ctx.from.id)) {
    await ctx.approve();
  } else {
    await ctx.decline();
  }
});`;

	const member = `bot.on("chat_member", async (ctx) => {
  const update = ctx.update.chat_member!;
  console.log(update.from.id, update.old_chat_member.status, "->", update.new_chat_member.status);
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

<h2>ban from a reply</h2>
<p>
	a simple admin command usually targets the user in the replied-to message. check permissions in
	your own guard before calling moderation methods.
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

<h2>admin checklist</h2>
<ul>
	<li>ask botfather for the permissions your bot actually needs.</li>
	<li>check that the bot is an admin before promising moderation features.</li>
	<li>handle supergroup migrations if your bot stores old group ids.</li>
	<li>keep audit logs for destructive actions.</li>
	<li>rate-limit public admin commands to avoid accidental spam.</li>
</ul>
