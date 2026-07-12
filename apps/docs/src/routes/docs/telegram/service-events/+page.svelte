<script lang="ts">
	import Code from "$lib/Code.svelte";

	const joins = `import { createBot } from "yaebal";

const bot = createBot(process.env.BOT_TOKEN!);

bot.on("message", async (ctx) => {
  const members = ctx.message?.new_chat_members;
  if (!members?.length) return;

  await ctx.reply("welcome " + members.map((u) => u.first_name).join(", "));
});`;

	const reactions = `import { createBot } from "yaebal";

const bot = createBot(process.env.BOT_TOKEN!);

bot.on("message_reaction", async (ctx) => {
  const reaction = ctx.update.message_reaction!;
  console.log(reaction.user?.id, reaction.old_reaction, reaction.new_reaction);
});`;

	const pinned = `import { createBot } from "yaebal";

const bot = createBot(process.env.BOT_TOKEN!);

bot.on("message", async (ctx) => {
  if (!ctx.message?.pinned_message) return;
  await ctx.reply("new pinned message");
});`;

	const boost = `import { createBot } from "yaebal";

const bot = createBot(process.env.BOT_TOKEN!);

bot.on("chat_boost", async (ctx) => {
  const boost = ctx.update.chat_boost!.boost;
  console.log("boosted until", new Date(boost.expiration_date * 1000));
});`;
</script>

<svelte:head>
	<title>service events — yaebal</title>
</svelte:head>

<h1>service events</h1>
<p class="lead">
	telegram sends many changes as updates or service messages: joins, leaves, reactions, pins,
	payments, forum topic changes, boosts, and chat migrations.
</p>

<h2>new members</h2>
<Code code={joins} title="joins.ts" />

<h2>reactions</h2>
<p>
	reaction updates are not part of the default update set. add <code>message_reaction</code> to
	<code>allowedUpdates</code> when polling.
</p>
<Code code={reactions} title="reactions.ts" />

<h2>pinned messages</h2>
<Code code={pinned} title="pinned.ts" />

<h2>chat boosts</h2>
<p>
	<code>chat_boost</code> and <code>removed_chat_boost</code> are also opt-in — add both to
	<code>allowedUpdates</code> if boost-gated features matter to your bot.
</p>
<Code code={boost} title="boost.ts" />

<h2>common service fields</h2>
<table>
	<thead><tr><th>field/update</th><th>what it means</th></tr></thead>
	<tbody>
		<tr><td><code>new_chat_members</code></td><td>users joined a group</td></tr>
		<tr><td><code>left_chat_member</code></td><td>a user left or was removed</td></tr>
		<tr><td><code>pinned_message</code></td><td>a message was pinned</td></tr>
		<tr><td><code>successful_payment</code></td><td>a payment completed — see <a href="/docs/telegram/payments/">payments</a></td></tr>
		<tr><td><code>forum_topic_created</code></td><td>a forum topic was created</td></tr>
		<tr><td><code>message_reaction</code></td><td>a user changed reactions on a message</td></tr>
		<tr><td><code>chat_boost</code> / <code>removed_chat_boost</code></td><td>a boost was added to, or removed from, the chat</td></tr>
		<tr><td><code>migrate_to_chat_id</code></td><td>a group was upgraded to a supergroup — the chat id changed</td></tr>
	</tbody>
</table>
<p>
	<code>message:&lt;field&gt;</code> filter queries narrow some of these (<code>photo</code>,
	<code>successful_payment</code>, <code>web_app_data</code>, …) onto a typed
	<code>ctx.message</code> — see <a href="/docs/core/">core concepts</a>. the rest (
	<code>new_chat_members</code>, <code>left_chat_member</code>, <code>pinned_message</code>) aren't
	in that narrowing list yet, so check them with a plain <code>if</code> as shown above.
</p>

<div class="note">
	<strong>service events are normal bot logic.</strong> route them, test them with
	<a href="/docs/plugins/test/">@yaebal/test</a>, and include them in <code>allowedUpdates</code>
	when telegram does not send them by default.
</div>
