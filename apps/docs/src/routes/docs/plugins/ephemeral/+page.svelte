<script lang="ts">
	import Code from "$lib/Code.svelte";

	const install = `pnpm add @yaebal/ephemeral`;

	const usage = `import { Bot } from "@yaebal/core";
import { ephemeral } from "@yaebal/ephemeral";

const bot = new Bot(process.env.BOT_TOKEN!)
  .install(ephemeral());

bot.command("stats", async (ctx) => {
  // in a group: a real ephemeral message, visible only to the sender.
  // in a private chat: a normal message (same visibility), same handle.
  const msg = await ctx.replyEphemeral("crunching…");
  const stats = await computeStats(ctx.from.id);
  await msg.edit(\`you sent \${stats.count} messages this week\`);
});

await bot.start();`;

	const handle = `const msg = await ctx.replyEphemeral("step 1/3…");

await msg.edit("step 2/3…");        // editEphemeralMessageText
await msg.editReplyMarkup(keyboard); // editEphemeralMessageReplyMarkup
await msg.delete();                  // deleteEphemeralMessage; false if already gone

msg.isEphemeral;        // false on the private-chat fallback path
msg.ephemeralMessageId; // may change after an onExpired: "resend" recovery`;

	const sendTo = `// a private nudge to a specific user in the current group — not the update's
// author. never falls back: outside group/supergroup chats it rejects, because
// a normal message there would be visible to everyone.
bot.command("report", async (ctx) => {
  await ctx.sendEphemeral(ADMIN_ID, \`new report from \${ctx.from.first_name}\`);
  await ctx.replyEphemeral("thanks — the admins have been notified");
});`;

	const options = `bot.install(
  ephemeral({
    // replyEphemeral in a private chat: "message" (default) sends a normal
    // message behind the same handle; "error" rejects instead.
    fallback: "message",
    // edit/editReplyMarkup on an expired ephemeral message:
    // "throw" (default), "ignore" (resolve false), or "resend" (send the new
    // content as a fresh ephemeral message and retarget the handle).
    onExpired: "resend",
    // override the "message is gone" detector if telegram's wording changes.
    isExpiredError: (error) => myDetector(error),
  }),
);`;

	const commandsPair = `import { commands } from "@yaebal/commands";

// is_ephemeral in the menu: telegram shows the /stats invocation only to its
// sender and expects an answer within ~15 seconds — answer it ephemerally.
const cmd = commands().ephemeral("stats", "your personal stats", async (ctx) => {
  await ctx.replyEphemeral(\`you: \${await stats(ctx.from.id)}\`);
});

bot.install(ephemeral()).install(cmd.plugin());
await cmd.sync(bot.api);`;

	const standalone = `import { wrapEphemeralMessage } from "@yaebal/ephemeral";

const sent = await bot.api.call("sendMessage", {
  chat_id: chatId,
  receiver_user_id: userId,
  text: "psst",
});
const msg = wrapEphemeralMessage(bot.api, sent, { onExpired: "ignore" });
await msg.edit("psst — updated");`;

	const testing = `const bot = new Composer<Context>()
  .install(ephemeral())
  .command("go", async (ctx) => void (await ctx.replyEphemeral("hi")));

const env = createTestEnv(bot);
// teach the auto-stub telegram's ephemeral answer shape
env.onApi("sendMessage", (params) =>
  params?.receiver_user_id === undefined
    ? { message_id: 42 }
    : { message_id: 0, ephemeral_message_id: 900 });

const group = env.createChat({ type: "supergroup" });
await env.createUser({ id: 7 }).in(group).sendCommand("go");

assert.equal(env.lastApiCall("sendMessage")?.params?.receiver_user_id, 7);`;
</script>

<svelte:head>
	<title>@yaebal/ephemeral - yaebal</title>
</svelte:head>

<h1>@yaebal/ephemeral</h1>
<p class="lead">
	answer in a group so only the asker (and the bot) sees it, via telegram's ephemeral messages
	(bot api 10.2+). <code>ctx.replyEphemeral()</code> returns a typed handle that hides the
	awkward addressing (<code>message_id</code> is <code>0</code> on ephemeral messages — edits go
	through <code>chat_id</code> + <code>receiver_user_id</code> + <code>ephemeral_message_id</code>),
	falls back to a normal message in private chats, and has a policy for the "message already
	expired" case. no more spamming the whole chat with "you are not an admin".
</p>

<h2>install</h2>
<Code code={install} title="terminal" lang="sh" />

<h2>usage</h2>
<p>
	install <code>ephemeral()</code> once. it adds <code>ctx.replyEphemeral</code> and
	<code>ctx.sendEphemeral</code> via <code>derive</code> — no other plugin dependency required.
</p>
<Code code={usage} title="bot.ts" />

<h2>the handle</h2>
<p>
	both senders resolve to an <code>EphemeralMessage</code> — one interface whether the message
	is a real ephemeral one or the private-chat fallback (then backed by
	<code>editMessageText</code> / <code>editMessageReplyMarkup</code> / <code>deleteMessage</code>).
</p>
<Code code={handle} title="bot.ts" />

<h2>targeting another user</h2>
<Code code={sendTo} title="bot.ts" />

<h2>options</h2>
<Code code={options} title="bot.ts" />
<p>
	<code>delete()</code> is always idempotent: an already-gone message resolves
	<code>false</code> instead of throwing, whatever <code>onExpired</code> is set to.
</p>

<h2>ephemeral commands</h2>
<p>
	pair with <a href="/docs/plugins/commands"><code>@yaebal/commands</code></a>' —
	<code>ephemeral()</code> there marks the menu entry <code>is_ephemeral</code>, this plugin
	makes the answer private too:
</p>
<Code code={commandsPair} title="bot.ts" />

<h2>standalone</h2>
<p>sent an ephemeral message through the raw api? wrap it:</p>
<Code code={standalone} title="bot.ts" />

<h2>api</h2>
<table>
	<thead>
		<tr><th>export</th><th>signature</th><th>description</th></tr>
	</thead>
	<tbody>
		<tr>
			<td><code>ephemeral</code></td>
			<td><code>(options?: EphemeralOptions) =&gt; Plugin&lt;Context, EphemeralControl&gt;</code></td>
			<td>installable plugin — adds <code>ctx.replyEphemeral</code> / <code>ctx.sendEphemeral</code></td>
		</tr>
		<tr>
			<td><code>wrapEphemeralMessage</code></td>
			<td><code>(api, sent: Message, options?) =&gt; EphemeralMessage</code></td>
			<td>wrap an already-sent ephemeral message in a handle</td>
		</tr>
		<tr>
			<td><code>supportsEphemeral</code></td>
			<td><code>(chat?: Pick&lt;Chat, "type"&gt;) =&gt; boolean</code></td>
			<td>group/supergroup check</td>
		</tr>
		<tr>
			<td><code>isExpiredEphemeralError</code></td>
			<td><code>(error: unknown) =&gt; boolean</code></td>
			<td>the default "message is gone" detector (a telegram 400 saying not found / expired / invalid)</td>
		</tr>
	</tbody>
</table>

<h3>EphemeralControl</h3>
<table>
	<thead>
		<tr><th>member</th><th>signature</th><th>description</th></tr>
	</thead>
	<tbody>
		<tr>
			<td><code>replyEphemeral</code></td>
			<td><code>(text, extra?) =&gt; Promise&lt;EphemeralMessage&gt;</code></td>
			<td>answer the update's author privately; falls back per <code>fallback</code> in private chats</td>
		</tr>
		<tr>
			<td><code>sendEphemeral</code></td>
			<td><code>(receiverUserId, text, extra?) =&gt; Promise&lt;EphemeralMessage&gt;</code></td>
			<td>ephemeral message to a specific user in the current group; never falls back</td>
		</tr>
	</tbody>
</table>

<h3>EphemeralOptions</h3>
<table>
	<thead>
		<tr><th>field</th><th>type</th><th>default</th><th>description</th></tr>
	</thead>
	<tbody>
		<tr><td><code>fallback</code></td><td><code>"message" | "error"</code></td><td><code>"message"</code></td><td>what <code>replyEphemeral</code> does in a private chat</td></tr>
		<tr><td><code>onExpired</code></td><td><code>"throw" | "ignore" | "resend"</code></td><td><code>"throw"</code></td><td>what <code>edit</code>/<code>editReplyMarkup</code> do when the message already expired</td></tr>
		<tr><td><code>isExpiredError</code></td><td><code>(error: unknown) =&gt; boolean</code></td><td><code>isExpiredEphemeralError</code></td><td>override the expiry detector</td></tr>
	</tbody>
</table>

<h2>testing</h2>
<p>
	<a href="/docs/plugins/test"><code>@yaebal/test</code></a>'s auto-stub answers every
	<code>send*</code> with a plain <code>message_id</code> — teach it the ephemeral answer shape
	with <code>onApi</code>, then assert on the recorded calls:
</p>
<Code code={testing} title="ephemeral.test.ts" />

<div class="note">
	<strong>best-effort by design.</strong> delivery to offline users is not guaranteed, edits and
	deletes may never reach the receiver, and telegram reuses
	<code>ephemeral_message_id</code>s after expiry — never persist a handle (or its ids) in a
	session or database, and never gate a required flow on an ephemeral reply. treat ephemeral
	messages as UI sugar, not as state.
</div>
