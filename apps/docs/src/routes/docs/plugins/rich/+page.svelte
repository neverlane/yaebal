<script lang="ts">
	import Code from "$lib/Code.svelte";

	const install = `pnpm add @yaebal/rich`;

	const dual = `import { html, md, heading, paragraph, bold, link, sendRichMessage } from "@yaebal/rich";

const title = "release notes";
const body = [
  heading(1, title),
  paragraph("yaebal ", bold("0.1"), " is out — see ", link("https://yaeb.al", "the docs"), "."),
];

await sendRichMessage(ctx.api, ctx.chat.id, html(body)); // <h1>…</h1><p>…</p>
await sendRichMessage(ctx.api, ctx.chat.id, md(body));   // # …\\n\\n…`;

	const template = `const doc = html\`
  \${heading(1, title)}

  \${paragraph("yaebal ", bold("0.1"), " is out — see ", link("https://yaeb.al", "the docs"), ".")}
\`;

await sendRichMessage(ctx.api, ctx.chat.id, doc);`;

	const document = `html([heading(1, title), list(items.map((i) => paragraph(i.text)))]);`;

	const richDocument = `const doc = html\`\${paragraph("right-to-left, no auto-linking")}\`
  .rtl()
  .noEntityDetection();

await sendRichMessage(ctx.api, ctx.chat.id, doc);`;

	const plugin = `import { Bot } from "@yaebal/core";
import { rich, html, paragraph } from "@yaebal/rich";

const bot = new Bot(token)
  .install(rich())
  .command("hi", (ctx) => ctx.sendRichMessage(html\`\${paragraph("hello!")}\`));`;

	const draft = `import { thinking, html, paragraph, divider, footer } from "@yaebal/rich";

bot.command("ask", async (ctx) => {
  const draft = ctx.richMessageDraft(1); // draft_id, non-zero, per message

  await draft.rewrite(html\`\${thinking("thinking…")}\`); // draft-only block

  let text = "";
  for await (const chunk of streamAnswer(ctx.text)) {
    text += chunk;
    await draft.rewrite(html\`\${paragraph(text)}\`); // full replace — same growing paragraph
  }

  await draft.write(html\`\${divider()}\${footer("streamed")}\`); // append, no need to re-supply \`text\`

  // required — a draft never persists on its own. send() with no argument
  // auto-assembles from the rewrite()/write() calls above.
  await draft.send();
});`;

	const read = `import { richMessageToPlainText, isTable, isPhoto } from "@yaebal/rich";

bot.on("message:rich_message", (ctx) => {
  const plain = richMessageToPlainText(ctx.message.rich_message);
  const tables = ctx.message.rich_message.blocks.filter(isTable);
});`;

	const tables = `table(
  [
    [cell("day", { header: true }), cell("count", { header: true, align: "right" })],
    [cell("mon"), cell(128, { align: "right", colspan: 2 })],
  ],
  { bordered: true, caption: "week" },
);
// html:     a full <table> — colspan/rowspan/valign, per-cell <th>/<td>
// markdown: a gfm table — header-first, alignment kept, spans dropped (no gfm equivalent)`;

	const blocks = `paragraph / heading / h1…h6 / preformatted / footer / divider
mathBlock / anchorBlock
blockquote / pullquote / details / list / item / table / cell / join
collage / slideshow / map / image / video / audio
thinking            (draft-only — see RichMessageDraft)`;

	const inline = `bold / italic / underline / strikethrough / spoiler / code / br
link / textMention / anchor / anchorLink / customEmoji
marked / subscript / superscript / dateTime / math / reference / referenceLink

// no builder needed — auto-detected from plain text unless .noEntityDetection():
@username  #hashtag  $CASHTAG  /bot_command
https://url  name@email.com  +1 555 0100  4111 1111 1111 1111`;
</script>

<svelte:head>
	<title>@yaebal/rich — yaebal</title>
</svelte:head>

<h1>@yaebal/rich</h1>
<p class="lead">
	<code>sendRichMessage</code> / <code>sendRichMessageDraft</code> — telegram's block-tree message
	format. one dual-dialect builder set, a draft/streaming session that owns the 30s ttl, and full
	read-side coverage of everything telegram can hand back on <code>message.rich_message</code>.
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

<h2>one builder, two dialects</h2>
<p>
	telegram accepts a rich message as either <code>InputRichMessage.html</code> or
	<code>.markdown</code>. most rich-message libraries pick one dialect to build for and bolt the
	other on as a parallel, hand-duplicated set of functions. <code>@yaebal/rich</code> doesn't: every
	builder — <code>bold</code>, <code>paragraph</code>, <code>table</code>, <code>list</code>, all
	~40 of them — returns a <code>RichNode</code> that doesn't know its own output format yet. it
	renders itself only when it lands inside a template:
</p>
<Code code={dual} title="dual-dialect.ts" />
<p>
	there is no <code>md.bold</code>/<code>md.paragraph</code> shadow api to learn, nothing to keep in
	sync, and nothing that silently drifts between dialects — <code>bold(...)</code> is
	<code>bold(...)</code> everywhere. <code>html</code>/<code>md</code> are tagged templates first:
</p>
<Code code={template} title="template.ts" />
<p>
	literal template text passes through unchanged; only <code>{'${…}'}</code> interpolation is
	touched — a string is dialect-escaped (so user input can never inject formatting), a builder node
	renders itself into the template's dialect, a nested document inlines as-is if the dialects match
	(and throws <code>RichError</code> if they don't), an array concatenates, and
	<code>null</code>/<code>undefined</code>/<code>false</code> vanish so
	<code>{'cond && bold("x")'}</code> composes cleanly. multi-line templates are dedented (common
	leading indentation stripped). <code>html</code>/<code>md</code> also accept a plain string
	(passed through as-is, no escaping/dedent — for already-formatted content) or an array of blocks —
	the form for composing from data instead of prose:
</p>
<Code code={document} title="from-data.ts" />
<p>
	<code>document(blocks, {'{ dialect, rtl, skipEntityDetection }'})</code> is the options-object
	equivalent, for when the dialect is a runtime variable rather than a call-site choice.
</p>

<h3>RichDocument — the sendable result</h3>
<p>
	<code>html</code>/<code>md</code>/<code>document()</code> all return a <code>RichDocument</code>: a
	rendered string plus the <code>InputRichMessage</code> flags, settable fluently.
</p>
<Code code={richDocument} title="flags.ts" />
<p>
	<code>sendRichMessage</code>/<code>sendRichMessageDraft</code>/<code>RichMessageDraft</code> all
	accept a <code>RichDocument</code>, a raw <code>InputRichMessage</code>, or a plain html string
	interchangeably — <code>toJSON()</code> also delegates to <code>toInputRichMessage()</code>, so a
	<code>RichDocument</code> serializes correctly even nested inside a hand-built payload.
</p>
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
<p>
	two ways to grow a draft: <code>rewrite()</code> replaces the whole thing — right for a token
	stream, where every chunk is a longer version of the <em>same</em> paragraph.
	<code>write()</code> appends to it (plain string concatenation) — right for tacking on a block
	after content that's already there, without re-supplying it.
</p>
<Code code={draft} title="stream.ts" />
<div class="note">
	<code>send()</code> with no argument auto-assembles from the accumulated
	<code>rewrite()</code>/<code>write()</code> calls — pass an explicit override when the persisted
	message should differ from the last draft snapshot. call <code>draft.cancel()</code> instead of
	<code>send()</code> to abandon a draft without persisting anything — it expires within 30s
	regardless.
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
	documented auto-detection) and a type guard + plain-text branch for every block and inline mark,
	in both dialects at once.
</p>

<h3>blocks</h3>
<Code code={blocks} title="block builders" lang="text" />

<h3>inline marks</h3>
<Code code={inline} title="inline builders" lang="text" />

<h3>tables and lists carry their full field set</h3>
<p>
	<code>cell()</code> and <code>item()</code> aren't afterthoughts bolted onto a plain-array api —
	they're first-class <code>RichNode</code>s that also carry the options <code>table()</code>/<code
		>list()</code
	> need to do the right thing per dialect:
</p>
<Code code={tables} title="tables.ts" />
<p>
	<code>list()</code> accepts bare values directly (auto-wrapped in a plain item) or explicit
	<code>item()</code>s for checkboxes and ordered-list numbering overrides (<code>value</code>,
	<code>type</code>) — no separate wrapper step required either way.
</p>

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
	"rich message formatting options" docs before depending on the exact spelling in production. where
	rich-markdown has no native token for a block at all (<code>footer</code>, pull-quote,
	collage/slideshow, map, <code>details</code>, <code>underline</code>, <code>subscript</code>,
	<code>superscript</code>), the raw html tag is embedded as-is in the markdown output too —
	telegram's markdown parser accepts embedded html blocks as long as they're blank-line-separated,
	which the block builders already handle.
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
		<tr><td><code>html</code> / <code>md</code></td><td>tagged templates — same builders, either dialect, auto-escaped interpolation</td></tr>
		<tr><td><code>document</code></td><td>options-object form: assemble blocks into a <code>RichDocument</code> with an explicit dialect</td></tr>
		<tr><td><code>RichDocument</code></td><td>the sendable result — <code>.rtl()</code>/<code>.noEntityDetection()</code>, <code>toInputRichMessage()</code>/<code>toJSON()</code></td></tr>
		<tr><td><code>sendRichMessage</code> / <code>sendRichMessageDraft</code></td><td>standalone send functions, no plugin required</td></tr>
		<tr><td><code>rich()</code></td><td>plugin — adds <code>ctx.sendRichMessage</code> / <code>ctx.richMessageDraft</code></td></tr>
		<tr><td><code>RichMessageDraft</code></td><td>the draft/streaming session class (<code>rewrite</code> / <code>write</code> / <code>send</code> / <code>cancel</code>)</td></tr>
		<tr><td><code>RichNode</code> / <code>isRichNode</code> / <code>makeNode</code></td><td>the node contract, for writing your own dual-dialect builder</td></tr>
		<tr><td><code>escapeMarkdown</code> / <code>escapeMarkdownUrl</code></td><td>the raw markdown escapers the builders use internally</td></tr>
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
	<a href="https://github.com/neverlane/yaebal/tree/master/examples/rich-messages"><code>examples/rich-messages</code></a>.
</p>
