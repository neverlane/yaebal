<script lang="ts">
	import Code from "$lib/Code.svelte";
	import Try from "$lib/Try.svelte";

	const install = `pnpm add @yaebal/split`;

	const formatted = `import { bold, format } from "@yaebal/core";

bot.command("changelog", async (ctx) => {
  // bold spans the whole 10 000-character text; entities are clipped
  // and re-based per part, so the formatting survives every boundary
  const messages = await ctx.sendLong(format\`\${bold(changelog)}\`);
  // messages: Message[] — one per part, sent in order
});`;

	const options = `await ctx.replyLong(text, { reply_markup: keyboard }, {
  markup: "last",   // default — keyboard goes on the final message ("first" | "all")
  replyTo: "first", // default — only the first part quotes the origin ("all")
  delayMs: 300,     // pause between parts — plays nice with flood limits
  signal,           // AbortSignal — stop sending the remaining parts
});

// plugin-level defaults, overridable per call; a bare number means { max }
bot.install(splitter({ max: 2000, delayMs: 300 }));`;

	const photoLong = `// caption strategy: first part becomes the photo caption (≤ 1024),
// the rest go out as regular messages (≤ 4096)
await ctx.sendPhotoLong(media.url(poster), format\`\${bold(longDescription)}\`);`;

	const failure = `import { SplitSendError } from "@yaebal/split";

try {
  await ctx.sendLong(text);
} catch (error) {
  if (error instanceof SplitSendError) {
    error.sent;  // Message[] — the parts that were delivered
    error.part;  // index of the part that failed
    error.cause; // the underlying error (network, 429, …)
  }
}`;

	const agnostic = `import { split, splitParts, splitSend, splitText } from "@yaebal/split";

// framework-agnostic delivery: each part is { text, entities } —
// a valid format result, so (part) => ctx.send(part) just works
const results = await splitSend(longText, ({ text, entities }) =>
  someOtherFramework.sendMessage(chatId, text, { entities }),
);

splitText(formatResult);  // eager: { text, entities }[]
split("plain\\ntext");     // plain strings: string[]
for (const part of splitParts(text)) { /* lazy generator */ }`;

	const rules = `import { split } from "@yaebal/split";

// prefers newline boundaries, then spaces, then a hard cut
split("line1\\nline2\\nline3", 12); // → ["line1\\nline2", "line3"]

// a single overlong word is hard-split — but never through a surrogate
// pair, so emoji survive intact
split("a".repeat(250), 100); // → [100 a's, 100 a's, 50 a's]

// whitespace-only parts are dropped (telegram rejects empty messages)
split(""); // → []`;
</script>

<svelte:head>
	<title>@yaebal/split — yaebal</title>
</svelte:head>

<h1>@yaebal/split</h1>
<p class="lead">
	send text of any length as a chain of telegram-sized messages. adds
	<code>ctx.sendLong</code>, <code>ctx.replyLong</code> and <code>ctx.sendPhotoLong</code> to the
	context; splits on newlines and spaces, carries <code>format</code> entities across part
	boundaries, keeps keyboards on the right message, and reports partial failures.
</p>

<h2>installation</h2>
<Code code={install} lang="sh" title="terminal" />

<h2>basic usage</h2>
<p>
	install the <code>splitter()</code> plugin with <code>bot.install()</code>. it adds
	<code>sendLong</code> / <code>replyLong</code> / <code>sendPhotoLong</code> to every handler's
	context — same shape as <code>ctx.send</code> / <code>ctx.reply</code>, but returning
	<code>Promise&lt;Message[]&gt;</code>, one <code>Message</code> per part.
</p>
<Try id="split-long" title="bot.ts" />

<h2>formatted text</h2>
<p>
	build the text with <code>format</code> (or <code>@yaebal/fmt</code>) and entities are split
	correctly: an entity crossing a boundary is clipped on one side and re-based on the other.
</p>
<Code code={formatted} title="changelog.ts" />
<div class="note">
	<code>parse_mode</code> markup cannot survive a split — a <code>&lt;b&gt;</code> opened in part
	one would 400 in part two — so a multi-part send with <code>parse_mode</code> in
	<code>extra</code> throws up front, before anything hits the network. single-part sends pass it
	through untouched. prefer entity-based formatting; that is what it is for.
</div>

<h2>keyboards, quoting, pacing</h2>
<p>
	the third argument tunes delivery. by default the <code>reply_markup</code> from
	<code>extra</code> lands only on the last part (a keyboard belongs on the final message), and
	<code>replyLong</code> quotes the origin only with its first part.
</p>
<Code code={options} title="options.ts" />

<h2>captions</h2>
<p>
	<code>sendPhotoLong</code> implements the caption strategy — the first part fits the media
	caption limit, the rest are plain messages. caption entities included.
</p>
<Code code={photoLong} title="poster.ts" />

<h2>partial failure</h2>
<p>
	parts are sent sequentially; if one fails midway the promise rejects with
	<code>SplitSendError</code> carrying everything that already went out, so you can resume, edit,
	or clean up instead of guessing.
</p>
<Code code={failure} title="failure.ts" />

<h2>outside the context</h2>
<p>
	the splitters are pure and exported — use them in tests, pipelines, or other frameworks.
	<code>splitSend</code> is the delivery loop without the context sugar.
</p>
<Code code={agnostic} title="anywhere.ts" />

<h2>splitting rules</h2>
<ul>
	<li>text at or under the limit is a single part, returned as-is</li>
	<li>the cut prefers the last newline in the window, then the last space or tab</li>
	<li>an overlong word is hard-cut — never through a surrogate pair, so emoji stay intact</li>
	<li>boundary whitespace is trimmed; whitespace-only parts are dropped entirely</li>
	<li>limits count utf-16 code units — the same units telegram uses for entity offsets</li>
</ul>
<Code code={rules} title="split-rules.ts" />

<h2>api</h2>
<table>
	<thead>
		<tr><th>export</th><th>kind</th><th>description</th></tr>
	</thead>
	<tbody>
		<tr><td><code>splitter(max? | options?)</code></td><td>Plugin</td><td>installs <code>sendLong</code> / <code>replyLong</code> / <code>sendPhotoLong</code> on the context</td></tr>
		<tr><td><code>splitSend(text, action, options?)</code></td><td>function</td><td>framework-agnostic sequential delivery — returns the action results</td></tr>
		<tr><td><code>splitText(text, max?)</code></td><td>function</td><td>eager split into <code>{'{ text, entities }'}</code> parts</td></tr>
		<tr><td><code>splitParts(text, max?)</code></td><td>generator</td><td>lazy <code>splitText</code></td></tr>
		<tr><td><code>split(text, max?)</code></td><td>function</td><td>plain-string split — <code>string[]</code></td></tr>
		<tr><td><code>splitCaption(text, options?)</code></td><td>function</td><td>first part ≤ <code>captionMax</code>, the rest ≤ <code>max</code></td></tr>
		<tr><td><code>SplitSendError</code></td><td>class</td><td>mid-chain failure — <code>sent</code>, <code>part</code>, <code>parts</code>, <code>cause</code></td></tr>
		<tr><td><code>MAX_MESSAGE_LENGTH</code></td><td>const</td><td><code>4096</code> — telegram's per-message text limit</td></tr>
		<tr><td><code>MAX_CAPTION_LENGTH</code></td><td>const</td><td><code>1024</code> — telegram's media caption limit</td></tr>
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
			<td><code>sendLong(text, extra?, options?)</code></td>
			<td><code>Promise&lt;Message[]&gt;</code></td>
			<td>send a string or <code>format</code> result split into parts via <code>ctx.send</code></td>
		</tr>
		<tr>
			<td><code>replyLong(text, extra?, options?)</code></td>
			<td><code>Promise&lt;Message[]&gt;</code></td>
			<td>like <code>sendLong</code>; the first part quotes the triggering message</td>
		</tr>
		<tr>
			<td><code>sendPhotoLong(photo, caption, extra?, options?)</code></td>
			<td><code>Promise&lt;Message[]&gt;</code></td>
			<td>photo with the first part as caption, the rest as messages</td>
		</tr>
	</tbody>
</table>

<h2>options</h2>
<table>
	<thead>
		<tr><th>option</th><th>default</th><th>description</th></tr>
	</thead>
	<tbody>
		<tr><td><code>max</code></td><td><code>4096</code></td><td>per-part limit in utf-16 code units</td></tr>
		<tr><td><code>captionMax</code></td><td><code>1024</code></td><td>first-part limit for <code>sendPhotoLong</code></td></tr>
		<tr><td><code>markup</code></td><td><code>"last"</code></td><td>which parts get <code>extra.reply_markup</code> — <code>"last" | "first" | "all"</code></td></tr>
		<tr><td><code>replyTo</code></td><td><code>"first"</code></td><td>which parts quote the origin in <code>replyLong</code> — <code>"first" | "all"</code></td></tr>
		<tr><td><code>delayMs</code></td><td><code>0</code></td><td>pause between parts in milliseconds</td></tr>
		<tr><td><code>signal</code></td><td>—</td><td><code>AbortSignal</code> — abort the remaining parts</td></tr>
	</tbody>
</table>

<h2>production notes</h2>
<div class="note">
	telegram allows roughly one message per second per chat; a very long text is a burst of
	messages. set <code>delayMs</code>, or install <code>@yaebal/again</code> so a mid-chain
	<code>429</code> is retried transparently — <code>SplitSendError.sent</code> tells you what got
	through when it isn't.
</div>

<h2>testing</h2>
<p>
	the splitters are pure — assert on <code>splitText(...)</code> directly. for the context
	methods, drive a bot with <code>@yaebal/test</code> and assert on the recorded
	<code>sendMessage</code> calls; see <code>packages/split/src/index.test.ts</code> for the full
	pattern.
</p>
