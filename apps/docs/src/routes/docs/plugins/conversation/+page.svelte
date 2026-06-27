<script lang="ts">
	import Code from "$lib/Code.svelte";

	const install = `pnpm add @yaebal/conversation`;

	const basic = `import { conversation, createConversation } from "@yaebal/conversation";

const greet = createConversation("greet", async (cv, ctx) => {
  await ctx.send("what's your name?");
  const a = await cv.wait();              // next update for this chat
  await a.send(\`age, \${a.text}?\`);
  const b = await cv.wait();
  await b.send(\`\${a.text} is \${b.text}\`);
});

bot.install(conversation([greet]));
bot.command("greet", (ctx) => ctx.conversation.enter("greet"));`;
</script>

<svelte:head>
	<title>@yaebal/conversation — yaebal</title>
</svelte:head>

<h1>@yaebal/conversation</h1>
<p class="lead">
	write multi-step dialogs as a straight line — <code>await cv.wait()</code> resolves with the next
	update for that chat. A coroutine, not a replay engine.
</p>

<h2>install</h2>
<Code code={install} title="terminal" lang="sh" />

<h2>usage</h2>
<Code code={basic} title="bot.ts" />

<h2>how it works</h2>
<p>
	Unlike grammY's replay-based conversations, this is a <strong>coroutine</strong>: the builder runs
	once, detached, and <code>cv.wait()</code> parks until the next update arrives. While a conversation
	is active it <strong>owns the chat's updates</strong> — they're routed to <code>wait()</code>
	instead of reaching other handlers. No replay means no duplicated side effects.
</p>

<h2>api</h2>
<table>
	<thead>
		<tr><th>member</th><th>what</th></tr>
	</thead>
	<tbody>
		<tr><td><code>createConversation(name, builder)</code></td><td>define a dialog; <code>builder(cv, ctx)</code></td></tr>
		<tr><td><code>conversation(defs, options?)</code></td><td>plugin adding <code>ctx.conversation</code></td></tr>
		<tr><td><code>cv.wait()</code></td><td>resolve with the next update's context</td></tr>
		<tr><td><code>cv.ctx</code></td><td>the most recent context</td></tr>
		<tr><td><code>ctx.conversation.enter(name)</code></td><td>start a conversation for this chat</td></tr>
		<tr><td><code>ctx.conversation.active()</code></td><td>whether one is running</td></tr>
		<tr><td><code>ctx.conversation.leave()</code></td><td>abandon the active one</td></tr>
	</tbody>
</table>

<div class="note">
	State is in-memory (lost on restart), like <a href="/docs/plugins/prompt/">prompt</a> and
	<a href="/docs/plugins/scenes/">scenes</a>. For a single follow-up use <code>prompt</code>; for a
	branching wizard use <code>scenes</code>; for a straight-line script use this.
</div>

<div class="note">
	<strong>Works with or without <a href="/docs/runner/">@yaebal/runner</a>.</strong> No deadlock in the
	sequential loop, because the builder is detached and updates are routed to it — not awaited inside
	<code>handleUpdate</code>.
</div>
