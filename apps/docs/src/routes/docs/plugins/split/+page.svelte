<script lang="ts">
	import Code from "$lib/Code.svelte";

	const install = `pnpm add @yaebal/split`;

	const basic = `import { Bot } from "@yaebal/core";
import { splitter } from "@yaebal/split";

const bot = new Bot(token);
bot.install(splitter()); // adds ctx.sendLong / ctx.replyLong

bot.command("essay", async (ctx) => {
  const text = await fetchLongArticle(); // might be 10 000+ characters
  await ctx.replyLong(text);             // sent as multiple messages automatically
});`;

	const customMax = `// default max is 4096 (telegram's limit); lower it for testing or padding
const bot = new Bot(token);
bot.install(splitter(2000));`;

	const sendLong = `bot.on("message:text", async (ctx) => {
  const messages = await ctx.sendLong(bigText, { parse_mode: "HTML" });
  // messages: Message[] — one entry per chunk sent
});`;

	const pureFn = `import { split } from "@yaebal/split";

const chunks = split("hello\\nworld\\n" + "x".repeat(5000));
// chunks is string[] — no bot, no context needed`;

	const splitBehavior = `import { split } from "@yaebal/split";

// prefers breaking on newlines
split("line1\\nline2\\nline3", 10);
// → ["line1\\nline2", "line3"]  (joined until limit, then flushed)

// hard-splits a single line longer than max
split("a".repeat(250), 100);
// → ["a".repeat(100), "a".repeat(100), "a".repeat(50)]`;
</script>

<svelte:head>
	<title>split — yaebal</title>
</svelte:head>

<h1>split</h1>
<p class="lead">
	break long messages into telegram-sized chunks. adds <code>ctx.sendLong</code> and
	<code>ctx.replyLong</code> to the context, and also exports a pure <code>split()</code> function
	for use outside a handler.
</p>

<h2>installation</h2>
<Code code={install} lang="sh" title="terminal" />

<h2>basic usage</h2>
<p>
	install the <code>splitter()</code> plugin with <code>bot.use()</code>. it adds
	<code>sendLong</code> and <code>replyLong</code> to every handler's context. both accept the same
	options as <code>ctx.send</code> / <code>ctx.reply</code>.
</p>
<Code code={basic} title="bot.ts" />

<h2>custom chunk size</h2>
<p>
	pass a number to <code>splitter()</code> to override the default 4096-character limit. useful for
	adding padding (captions, parse overhead) or during tests.
</p>
<Code code={customMax} title="bot.ts" />

<h2>ctx.sendLong and ctx.replyLong</h2>
<p>both return <code>Promise&lt;Message[]&gt;</code> — one <code>Message</code> per chunk sent.</p>
<Code code={sendLong} title="handler.ts" />

<h2>the pure split() function</h2>
<p>
	<code>split(text, max?)</code> is exported separately so you can use the splitting logic without
	a bot context — in tests, pre-processing pipelines, or anywhere you just need the chunks.
</p>
<Code code={pureFn} title="util.ts" />

<h2>splitting rules</h2>
<p>the algorithm prefers line breaks over hard cuts:</p>
<ul>
	<li>text shorter than or equal to <code>max</code> is returned as a single-element array</li>
	<li>lines are accumulated until the next line would exceed the limit, then a chunk is flushed</li>
	<li>a single line that is itself longer than <code>max</code> is hard-split at the byte boundary</li>
	<li>rejoining all chunks with <code>"\n"</code> reconstructs the original text exactly</li>
</ul>
<Code code={splitBehavior} title="split-rules.ts" />

<h2>api</h2>
<table>
	<thead>
		<tr><th>export</th><th>kind</th><th>description</th></tr>
	</thead>
	<tbody>
		<tr><td><code>splitter(max?)</code></td><td>Plugin</td><td>installs <code>sendLong</code> / <code>replyLong</code> on the context</td></tr>
		<tr><td><code>split(text, max?)</code></td><td>function</td><td>pure splitter — returns <code>string[]</code></td></tr>
		<tr><td><code>MAX_MESSAGE_LENGTH</code></td><td>const</td><td><code>4096</code> — telegram's per-message text limit</td></tr>
		<tr><td><code>SplitControl</code></td><td>interface</td><td>the shape added to the context by <code>splitter()</code></td></tr>
	</tbody>
</table>

<h2>SplitControl interface</h2>
<table>
	<thead>
		<tr><th>method</th><th>returns</th><th>description</th></tr>
	</thead>
	<tbody>
		<tr>
			<td><code>sendLong(text, extra?)</code></td>
			<td><code>Promise&lt;Message[]&gt;</code></td>
			<td>send <code>text</code> split into chunks via <code>ctx.send</code></td>
		</tr>
		<tr>
			<td><code>replyLong(text, extra?)</code></td>
			<td><code>Promise&lt;Message[]&gt;</code></td>
			<td>reply with <code>text</code> split into chunks via <code>ctx.reply</code></td>
		</tr>
	</tbody>
</table>

<div class="note">
	chunks are sent sequentially, not in parallel — telegram preserves message order within a chat
	but parallel sends from one bot can arrive out of order.
</div>
