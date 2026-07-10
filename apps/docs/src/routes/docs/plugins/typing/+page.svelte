<script lang="ts">
	import Code from "$lib/Code.svelte";

	const install = `pnpm add @yaebal/typing`;

	const usage = `import { Bot } from "@yaebal/core";
import { typing } from "@yaebal/typing";

const bot = new Bot(process.env.BOT_TOKEN!)
  .install(typing());

bot.on("message:text", async (ctx) => {
  const reply = await ctx.typing(() => llm.complete(ctx.message.text));
  await ctx.reply(reply);
});

await bot.start();`;

	const oneOff = `// the plain, one-off form — a single sendChatAction call
await ctx.typing(); // defaults to "typing"
await ctx.typing("upload_photo");`;

	const keepAlive = `// sent immediately, re-sent every intervalMs so it survives telegram's ~5s
// expiry, cleared the instant fn() settles — resolved or rejected
const image = await ctx.typing(() => generateImage(prompt), {
  action: "upload_photo",
});`;

	const options = `bot.install(
  typing({
    action: "typing", // default chat action, overridable per call
    intervalMs: 4000, // re-send cadence, in ms — stay under telegram's ~5s expiry
    onError: (error) => logger.warn("typing keep-alive failed", error),
  }),
);`;

	const noChat = `// an update with no chat (e.g. inline_query) can't show an indicator:
// the fn form just runs fn() plain — the operation itself still matters
bot.on("inline_query", async (ctx) => {
  const results = await ctx.typing(() => search(ctx.inlineQuery.query));
  await ctx.answerInlineQuery(results);
});`;
</script>

<svelte:head>
	<title>@yaebal/typing - yaebal</title>
</svelte:head>

<h1>@yaebal/typing</h1>
<p class="lead">
	keeps the "is typing…" indicator alive for the duration of an async operation — no manual
	<code>sendChatAction</code> calls, no forgotten indicator left stuck after telegram's ~5s
	expiry. built for long LLM/API calls where the reply takes a noticeable amount of time to
	arrive.
</p>

<h2>install</h2>
<Code code={install} title="terminal" lang="sh" />

<h2>usage</h2>
<p>
	install <code>typing()</code> once. it adds <code>ctx.typing</code> via <code>derive</code> — no
	other plugin dependency required.
</p>
<Code code={usage} title="bot.ts" />

<h2>two forms</h2>
<p>
	<code>ctx.typing(action?)</code> sends a single chat action and resolves to the api's
	<code>boolean</code> result — the same one-off indicator <code>ctx.typing()</code> already
	offers on message contexts, just installable on any context.
</p>
<Code code={oneOff} title="bot.ts" />
<p>
	<code>ctx.typing(fn, options?)</code> wraps an async operation: sends the chat action right
	away, keeps it alive on an interval, and clears it the instant <code>fn()</code> settles.
</p>
<Code code={keepAlive} title="bot.ts" />

<h2>options</h2>
<p>
	set defaults at install time, override any of them per call — a per-call
	<code>action</code>/<code>intervalMs</code>/<code>onError</code> always wins.
</p>
<Code code={options} title="bot.ts" />

<h2>no chat, no indicator</h2>
<p>
	updates without a chat (<code>inline_query</code>, …) can't show an indicator. the one-off form
	rejects — there's nothing to send. the <code>fn</code> form just runs <code>fn()</code> plain,
	since the operation itself still matters even without a chat to animate.
</p>
<Code code={noChat} title="bot.ts" />

<h2>api</h2>
<table>
	<thead>
		<tr><th>export</th><th>signature</th><th>description</th></tr>
	</thead>
	<tbody>
		<tr>
			<td><code>typing</code></td>
			<td><code>(defaults?: TypingOptions) =&gt; Plugin&lt;Context, TypingControl&gt;</code></td>
			<td>installable plugin — adds <code>ctx.typing</code></td>
		</tr>
	</tbody>
</table>

<h3>TypingControl</h3>
<table>
	<thead>
		<tr><th>member</th><th>signature</th><th>description</th></tr>
	</thead>
	<tbody>
		<tr>
			<td><code>typing</code></td>
			<td><code>(action?: ChatAction) =&gt; Promise&lt;boolean&gt;</code></td>
			<td>send a chat action once, defaults to <code>"typing"</code></td>
		</tr>
		<tr>
			<td><code>typing</code></td>
			<td><code>&lt;T&gt;(fn: () =&gt; Promise&lt;T&gt;, options?: TypingOptions) =&gt; Promise&lt;T&gt;</code></td>
			<td>keep the action alive for as long as <code>fn</code> is pending</td>
		</tr>
	</tbody>
</table>

<h3>TypingOptions</h3>
<table>
	<thead>
		<tr><th>field</th><th>type</th><th>default</th><th>description</th></tr>
	</thead>
	<tbody>
		<tr><td><code>action</code></td><td><code>ChatAction</code></td><td><code>"typing"</code></td><td>chat action to display while <code>fn</code> runs</td></tr>
		<tr><td><code>intervalMs</code></td><td><code>number</code></td><td><code>4000</code></td><td>re-send cadence, in ms — must stay under telegram's ~5s expiry</td></tr>
		<tr><td><code>onError</code></td><td><code>(error: unknown) =&gt; unknown</code></td><td>-</td><td>observe a failed keep-alive ping — swallowed either way, never aborts <code>fn</code></td></tr>
	</tbody>
</table>

<h2>testing</h2>
<p>
	<a href="/docs/plugins/test"><code>@yaebal/test</code></a> stubs
	<code>sendChatAction</code> to <code>true</code> by default, so assert on the recorded calls.
	the keep-alive interval needs the
	<a href="/docs/plugins/test#the-virtual-clock--skip-real-time">virtual clock</a>
	to fast-forward without a real wait:
</p>
<Code
	code={`const env = createTestEnv(bot);
env.useFakeTimers(); // arm before the handler schedules its interval

const dispatched = env.createUser().sendMessage("hi");
await env.advanceTime(5000);
await dispatched;

assert.ok(env.callsTo("sendChatAction").length > 1);`}
	title="typing.test.ts"
/>

<div class="note">
	<strong>doesn't replace ctx.typing(action) on message contexts.</strong> the built-in one-off
	sugar (<code>ctx.typing("upload_photo")</code> on message-bearing contexts) still exists —
	this plugin overloads the same name so both forms keep working together: call it with an
	action for a single ping, or with a function to keep it alive across an async call.
</div>
