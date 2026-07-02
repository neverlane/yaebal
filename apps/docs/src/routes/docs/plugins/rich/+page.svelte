<script lang="ts">
	import Code from "$lib/Code.svelte";

	const install = `pnpm add @yaebal/rich`;

	const send = `import { document, heading, paragraph, bold, link, sendRichMessage } from "@yaebal/rich";

const input = document([
  heading(1, "release notes"),
  paragraph("yaebal ", bold("0.1"), " is out — see ", link("https://yaeb.al", "the docs"), "."),
]);

await sendRichMessage(ctx.api, ctx.chat.id, input);`;

	const plugin = `import { Bot } from "@yaebal/core";
import { rich, document, paragraph } from "@yaebal/rich";

const bot = new Bot(token)
  .install(rich())
  .command("hi", (ctx) => ctx.sendRichMessage(document([paragraph("hello!")])));`;

	const draft = `import { thinking, document, paragraph } from "@yaebal/rich";

bot.command("ask", async (ctx) => {
  const draft = ctx.richMessageDraft(1); // draft_id, non-zero, per message

  await draft.push(document([thinking("thinking…")])); // draft-only block

  let text = "";
  for await (const chunk of streamAnswer(ctx.text)) {
    text += chunk;
    await draft.push(document([paragraph(text)]));
  }

  // required — a draft never persists on its own.
  await draft.commit(document([paragraph(text)]));
});`;

	const read = `import { richMessageToPlainText, isTable, isPhoto } from "@yaebal/rich";

bot.on("message:rich_message", (ctx) => {
  const plain = richMessageToPlainText(ctx.message.rich_message);
  const tables = ctx.message.rich_message.blocks.filter(isTable);
});`;

	const blocks = `paragraph / heading / preformatted / footer / divider
mathBlock / anchorBlock
blockquote / pullquote / details / list / item / table / cell
collage / slideshow / map / image / video / audio
thinking            (draft-only — see RichMessageDraft)`;

	const inline = `bold / italic / underline / strikethrough / spoiler / code
link / textMention / anchor / anchorLink / customEmoji
marked / subscript / superscript / dateTime / math / reference / referenceLink

// no builder needed — auto-detected from plain text unless skipEntityDetection:
@username  #hashtag  $CASHTAG  /bot_command
https://url  name@email.com  +1 555 0100  4111 1111 1111 1111`;
</script>

<svelte:head>
	<title>@yaebal/rich — yaebal</title>
</svelte:head>

<h1>@yaebal/rich</h1>
<p class="lead">
	<code>sendRichMessage</code> / <code>sendRichMessageDraft</code> — telegram's block-tree message
	format. a typed builder for the extended html dialect, a draft/streaming session that owns the
	30s ttl, and full read-side coverage of everything telegram can hand back on
	<code>message.rich_message</code>.
</p>

<h2>install</h2>
<Code code={install} title="terminal" lang="sh" />

<h2>why this isn't in @yaebal/fmt</h2>
<p>
	<a href="/docs/plugins/fmt/"><code>@yaebal/fmt</code></a> parses classic <code>parse_mode</code>/entities
	— a flat <code>{'{ text, entities }'}</code> pair. a rich message is a different model entirely: a
	block-tree <em>document</em> (paragraphs, headings, tables, lists, collages, slideshows, a
	collapsible <code>&lt;details&gt;</code>, even a <code>&lt;tg-thinking&gt;</code> placeholder for
	a streaming answer). you write extended html (or markdown) once, telegram parses it server-side,
	and the same tree comes back on <code>message.rich_message</code>. different wire format, different
	tag vocabulary, its own streaming protocol — hence its own package.
</p>

<h2>sending</h2>
<Code code={send} title="send.ts" />
<p>or install the plugin for <code>ctx.send</code>-flavored ergonomics:</p>
<Code code={plugin} title="bot.ts" />

<h2>streaming a draft</h2>
<p>
	<code>sendRichMessageDraft</code> streams a partial answer to a private chat — but the draft is
	<strong>ephemeral</strong>: telegram drops it 30 seconds after the last push, and it never turns
	into a real message on its own. <code>RichMessageDraft</code> is the part of this package worth
	the price of admission: it re-pushes the latest draft on a timer so a slow generator (e.g. an llm
	stream) doesn't lose it between chunks, and it refuses to push after you close it.
</p>
<Code code={draft} title="stream.ts" />
<div class="note">
	call <code>draft.cancel()</code> instead of <code>commit()</code> to abandon a draft without
	persisting anything — it expires within 30s regardless.
</div>

<h2>reading</h2>
<p>
	every <code>RichBlock</code>/<code>RichText</code> variant has a matching <code>isX</code> type
	guard, and <code>richMessageToPlainText</code> / <code>richBlockToPlainText</code> /
	<code>richTextToPlainText</code> flatten the whole tree (or one node) to plain characters — useful
	for search indices, logs, or notification previews.
</p>
<Code code={read} title="read.ts" />

<h2>coverage</h2>
<p>
	every one of telegram's ~50 <code>Rich*</code> types is covered on both sides — a builder (or
	documented auto-detection) and a type guard + plain-text branch for every block and inline mark.
</p>

<h3>blocks</h3>
<Code code={blocks} title="block builders" lang="text" />

<h3>inline marks</h3>
<Code code={inline} title="inline builders" lang="text" />

<div class="note">
	<strong>tag confidence varies.</strong> most tags are <strong>confirmed</strong> straight from
	telegram's schema (<code>&lt;p&gt;</code>, <code>&lt;h1&gt;</code>–<code>&lt;h6&gt;</code>,
	<code>&lt;pre&gt;&lt;code&gt;</code>, <code>&lt;hr/&gt;</code>, <code>&lt;footer&gt;</code>,
	<code>&lt;blockquote&gt;</code>, <code>&lt;aside&gt;</code>, <code>&lt;details&gt;</code>,
	<code>&lt;table&gt;</code>, <code>&lt;tg-collage&gt;</code>, <code>&lt;tg-slideshow&gt;</code>,
	<code>&lt;tg-map&gt;</code>, <code>&lt;tg-math-block&gt;</code>, <code>&lt;tg-thinking&gt;</code>,
	the classic <code>&lt;b&gt;</code>/<code>&lt;i&gt;</code>/<code>&lt;u&gt;</code>/<code>&lt;s&gt;</code>/<code>&lt;code&gt;</code>/<code>&lt;tg-spoiler&gt;</code>/<code>&lt;tg-emoji&gt;</code>
	set, and <code>tg://user?id=…</code>). a handful (<code>marked</code>, <code>subscript</code>,
	<code>superscript</code>, <code>dateTime</code>, inline <code>math</code>,
	<code>reference</code>/<code>referenceLink</code>, table borders) have
	<strong>no documented tag</strong> in the schema at all — those are best-effort guesses, flagged in
	their doc comments in <code>inline.ts</code>/<code>blocks.ts</code>. verify against the live
	"rich message formatting options" docs before depending on the exact spelling in production.
	<br /><br />
	<code>sendRichMessage</code> has no <code>attach://</code>/multipart upload path (unlike
	<code>sendPhoto</code>) — media blocks take a hosted url, not a local file.
</div>

<h2>api</h2>
<table>
	<thead>
		<tr><th>export</th><th>what</th></tr>
	</thead>
	<tbody>
		<tr><td><code>document</code> / <code>markdown</code></td><td>assemble blocks into an <code>InputRichMessage</code></td></tr>
		<tr><td><code>sendRichMessage</code> / <code>sendRichMessageDraft</code></td><td>standalone send functions, no plugin required</td></tr>
		<tr><td><code>rich()</code></td><td>plugin — adds <code>ctx.sendRichMessage</code> / <code>ctx.richMessageDraft</code></td></tr>
		<tr><td><code>RichMessageDraft</code></td><td>the draft/streaming session class (<code>push</code> / <code>commit</code> / <code>cancel</code>)</td></tr>
		<tr><td><code>html</code></td><td>tagged template for the extended-html dialect, auto-escaped interpolation</td></tr>
		<tr><td><code>isParagraph</code>, <code>isTable</code>, <code>isCustomEmoji</code>, …</td><td>one type guard per <code>RichBlock</code>/<code>RichText</code> variant</td></tr>
		<tr><td><code>richTextToPlainText</code> / <code>richBlockToPlainText</code> / <code>richMessageToPlainText</code></td><td>flatten to plain text</td></tr>
	</tbody>
</table>
<p>
	plus the full generated type surface (<code>RichMessage</code>, <code>RichBlock</code>,
	<code>RichText</code>, and every <code>RichBlock*</code>/<code>RichText*</code> interface)
	re-exported from <code>@yaebal/types</code> for convenience.
</p>

<h2>example</h2>
<p>
	a runnable bot covering all of the above lives at
	<a href="https://github.com/neverlane/yaebal/tree/main/examples/rich-messages"><code>examples/rich-messages</code></a>.
</p>
