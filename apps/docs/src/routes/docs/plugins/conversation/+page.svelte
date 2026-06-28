<script lang="ts">
	import Code from "$lib/Code.svelte";

	const install = `pnpm add @yaebal/conversation`;

	const basic = `import { Bot } from "@yaebal/core";
import { conversation, createConversation } from "@yaebal/conversation";

const greet = createConversation("greet", async (cv, ctx) => {
  await ctx.send("what's your name?");
  const a = await cv.wait();              // next update for this chat
  await a.send(\`age, \${a.text}?\`);
  const b = await cv.wait();
  await b.send(\`\${a.text} is \${b.text}\`);
});

const bot = new Bot(process.env.BOT_TOKEN!)
  .install(conversation([greet]));

bot.command("greet", (ctx) => ctx.conversation.enter("greet"));
bot.start();`;

	const control = `// ctx.conversation is available on every update after .install(conversation([...]))

// start a registered conversation for this chat
ctx.conversation.enter("greet");

// is one currently running for this chat?
if (ctx.conversation.active()) return;

// abandon the active conversation (its coroutine is left parked)
ctx.conversation.leave();`;

	const options = `bot.install(conversation([greet], {
  // partition by user instead of chat
  getKey: (ctx) => ctx.from?.id?.toString(),
  // called if a builder throws
  onError: (error, ctx) => {
    console.error("conversation failed", error);
  },
}));`;

	const cvCtx = `const survey = createConversation("survey", async (cv, ctx) => {
  await ctx.send("step 1?");
  await cv.wait();

  // cv.ctx is the most recent waited context — handy in helpers
  await cv.ctx.send("step 2?");
  await cv.wait();
});`;
</script>

<svelte:head>
	<title>@yaebal/conversation — yaebal</title>
</svelte:head>

<h1>@yaebal/conversation</h1>
<p class="lead">
	write multi-step dialogs as a straight line — <code>await cv.wait()</code> resolves with the next
	update for that chat. a coroutine, not a replay engine.
</p>

<h2>install</h2>
<Code code={install} title="terminal" lang="sh" />

<h2>usage</h2>
<p>
	define each conversation with <code>createConversation(name, builder)</code>, pass the array to
	<code>conversation()</code>, and install it with <code>.install()</code>. enter a conversation
	from any handler with <code>ctx.conversation.enter(name)</code>.
</p>
<Code code={basic} title="bot.ts" />

<h2>how it works</h2>
<p>
	unlike grammY's replay-based conversations, this is a <strong>coroutine</strong>: the builder runs
	once, detached, and <code>cv.wait()</code> parks until the next update arrives. while a
	conversation is active it <strong>owns the chat's updates</strong> — they are routed to
	<code>wait()</code> instead of reaching other handlers. no replay means no duplicated side
	effects. updates that arrive while the builder is busy (not parked in <code>wait()</code>) are
	queued and delivered to the next <code>wait()</code> in order.
</p>

<h2>ctx.conversation</h2>
<Code code={control} title="control.ts" />

<h2>api</h2>
<table>
	<thead>
		<tr><th>export</th><th>signature</th><th>description</th></tr>
	</thead>
	<tbody>
		<tr>
			<td><code>createConversation</code></td>
			<td><code>(name, builder) =&gt; ConversationDef</code></td>
			<td>define a conversation</td>
		</tr>
		<tr>
			<td><code>conversation</code></td>
			<td><code>(defs, options?) =&gt; Plugin&lt;Context, &#123; conversation: ConversationControl &#125;&gt;</code></td>
			<td>creates the plugin; adds <code>ctx.conversation</code></td>
		</tr>
		<tr>
			<td><code>Conversation</code></td>
			<td>interface</td>
			<td>the <code>cv</code> handle passed to a builder</td>
		</tr>
		<tr>
			<td><code>ConversationBuilder</code></td>
			<td><code>(cv: Conversation, ctx: Context) =&gt; void | Promise&lt;void&gt;</code></td>
			<td>the function that drives one conversation</td>
		</tr>
		<tr>
			<td><code>ConversationDef</code></td>
			<td><code>&#123; name: string; builder: ConversationBuilder &#125;</code></td>
			<td>the value returned by <code>createConversation</code></td>
		</tr>
		<tr>
			<td><code>ConversationControl</code></td>
			<td>interface</td>
			<td>the control object on <code>ctx.conversation</code></td>
		</tr>
		<tr>
			<td><code>ConversationOptions</code></td>
			<td>interface</td>
			<td>options passed to <code>conversation()</code></td>
		</tr>
	</tbody>
</table>

<h3>Conversation (cv)</h3>
<table>
	<thead>
		<tr><th>member</th><th>type</th><th>description</th></tr>
	</thead>
	<tbody>
		<tr>
			<td><code>wait()</code></td>
			<td><code>() =&gt; Promise&lt;Context&gt;</code></td>
			<td>resolve with the next update's context for this chat</td>
		</tr>
		<tr>
			<td><code>ctx</code></td>
			<td><code>Context</code> (readonly)</td>
			<td>the most recent context — the entering update, then each waited one</td>
		</tr>
	</tbody>
</table>
<Code code={cvCtx} title="cv-ctx.ts" />

<h3>ConversationControl (ctx.conversation)</h3>
<table>
	<thead>
		<tr><th>member</th><th>type</th><th>description</th></tr>
	</thead>
	<tbody>
		<tr>
			<td><code>enter(name)</code></td>
			<td><code>(name: string) =&gt; void</code></td>
			<td>start a registered conversation for this chat; throws if <code>name</code> is unknown</td>
		</tr>
		<tr>
			<td><code>active()</code></td>
			<td><code>() =&gt; boolean</code></td>
			<td>whether a conversation is currently running for this chat</td>
		</tr>
		<tr>
			<td><code>leave()</code></td>
			<td><code>() =&gt; void</code></td>
			<td>abandon the active conversation; its coroutine is left parked</td>
		</tr>
	</tbody>
</table>

<h3>ConversationOptions</h3>
<table>
	<thead>
		<tr><th>field</th><th>type</th><th>required</th><th>description</th></tr>
	</thead>
	<tbody>
		<tr>
			<td><code>getKey</code></td>
			<td><code>(ctx: Context) =&gt; string | undefined</code></td>
			<td>no</td>
			<td>key for the update. defaults to <code>ctx.chat?.id?.toString()</code></td>
		</tr>
		<tr>
			<td><code>onError</code></td>
			<td><code>(error: unknown, ctx: Context) =&gt; void</code></td>
			<td>no</td>
			<td>called if a conversation builder throws</td>
		</tr>
	</tbody>
</table>
<Code code={options} title="options.ts" />

<div class="note">
	state is in-memory (lost on restart), like <a href="/docs/plugins/prompt/">prompt</a> and
	<a href="/docs/plugins/scenes/">scenes</a>. for a single follow-up use <code>prompt</code>; for a
	branching wizard use <code>scenes</code>; for a straight-line script use this.
</div>

<div class="note">
	<strong>works with or without <a href="/docs/runner/">@yaebal/runner</a>.</strong> no
	deadlock in the sequential loop, because the builder is detached and updates are routed to it —
	not awaited inside <code>handleUpdate</code>.
	<br /><br />
	<strong>leave() does not stop the parked coroutine.</strong> it only detaches the session so new
	updates fall through to normal handlers; a coroutine parked in <code>wait()</code> stays parked
	and never resolves. the same applies when a builder completes — the session is cleaned up
	automatically.
</div>
