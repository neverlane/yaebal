<script lang="ts">
	import Code from "$lib/Code.svelte";
	import Try from "$lib/Try.svelte";

	const install = `pnpm add @yaebal/fmt`;

	const basic = `import { html, md } from "@yaebal/fmt";

// parses into MessageEntity[] — no parse_mode, nothing to escape
ctx.send(html\`<b>hello</b> <a href="https://yaebal.mom">docs</a>\`);
ctx.send(md\`**hello** and *italic* and \\\`code\\\` and ||spoiler||\`);`;

	const escape = `const name = "<script>**hax**";

// the interpolation is inserted as LITERAL text — never re-parsed
ctx.send(html\`hi <b>\${name}</b>\`);
// → text: "hi <script>**hax**", one bold entity. no injection possible.`;

	const compose = `import { html, md } from "@yaebal/fmt";
import { bold, link } from "@yaebal/core";

// a FormatResult sub (from core's builders) is MERGED, offsets shifted
ctx.send(html\`welcome \${bold(user.name)} — \${link("open", url)}\`);

// interpolation inside an attribute or a link url is substituted textually
ctx.send(html\`<a href="\${url}">open</a>\`);
ctx.send(md\`[open](\${url})\`);`;

	const htmlTags = `b / strong                    → bold
i / em                        → italic
u / ins                       → underline
s / strike / del              → strikethrough
tg-spoiler, span.tg-spoiler   → spoiler
code                          → code
pre                           → pre
pre > code class="language-x" → one pre entity with language "x"
blockquote                    → blockquote
blockquote expandable         → expandable_blockquote
a href="…"                    → text_link
tg-emoji emoji-id="…"         → custom_emoji
br / br/                      → newline`;

	const mdSyntax = `**bold**            *italic* / _italic_      __underline__
~~strike~~          ||spoiler||              \`code\`
[text](url)         > blockquote lines
\\\`\\\`\\\`lang
multi-line pre
\\\`\\\`\\\``;
</script>

<svelte:head>
	<title>@yaebal/fmt — yaebal</title>
</svelte:head>

<h1>@yaebal/fmt</h1>
<p class="lead">
	<code>html</code> and <code>md</code> tagged templates that parse Telegram's markup subset into
	real entities — with interpolations auto-escaped so user input can never break your formatting.
</p>

<h2>install</h2>
<Code code={install} title="terminal" lang="sh" />

<h2>why</h2>
<p>
	core ships <code>format</code> (entity <em>builders</em>: <code>bold()</code>,
	<code>link()</code>). <code>@yaebal/fmt</code> adds the <em>parser</em> angle — write familiar
	markdown or HTML, get the same <code>{"{ text, entities }"}</code> back. Both avoid
	<code>parse_mode</code> entirely, so there is nothing to escape.
</p>
<Code code={basic} title="basic.ts" />
<Try id="fmt-html" title="formatting.ts" />
<div class="note">
	<strong>scope, honestly:</strong> these are <em>template dialects</em> for authoring bot messages,
	not document converters. they cover telegram's own entity vocabulary and nothing beyond it — no
	headings, lists or tables. to render an arbitrary markdown/html document (LLM output), use a real
	markdown parser and map its AST onto entities; for telegram's block-tree rich messages see
	<a href="/docs/plugins/rich/">@yaebal/rich</a>.
</div>

<h2>auto-escaped interpolation</h2>
<p>
	this is the headline. a <code>${"${string}"}</code> interpolation is inserted as
	<strong>literal text</strong> — its <code>*</code>, <code>&lt;</code>, <code>`</code> are never
	re-parsed as markup. user input cannot inject entities or break the message.
	<code>null</code>/<code>undefined</code>/booleans render as empty text, so
	<code>{"${cond && bold(\"on\")}"}</code> just works.
</p>
<Code code={escape} title="safe.ts" />
<div class="note">
	<strong>composes with core.</strong> if an interpolation is itself a <code>FormatResult</code>
	(e.g. from <code>bold()</code> / <code>link()</code>), it's merged in with its offsets shifted.
	interpolating into an attribute value (<code>{'href="${url}"'}</code>) or a markdown link url
	substitutes the value textually.
</div>
<Code code={compose} title="compose.ts" />

<h2>html dialect</h2>
<p>
	telegram's full html vocabulary. tags left unclosed at the end of input are auto-closed,
	unmatched closing tags are dropped, and anything unrecognized (<code>&lt;div&gt;</code>,
	unquoted attributes) stays literal text.
</p>
<Code code={htmlTags} title="supported tags" lang="text" />

<h2>md dialect</h2>
<p>
	a backslash escapes the next character (<code>2 \* 3</code>), including inside a run
	(<code>**a \** b**</code>). single <code>*</code>/<code>_</code> don't trigger mid-word —
	<code>snake_case</code> and <code>2 * 3</code> are safe — and their content can't start or end
	with whitespace. consecutive <code>&gt;</code>-prefixed lines merge into one blockquote entity.
	for <code>expandable_blockquote</code> and <code>custom_emoji</code>, use the html dialect or
	core's helpers.
</p>
<Code code={mdSyntax} title="supported syntax" lang="text" />

<h2>api</h2>
<table>
	<thead>
		<tr><th>export</th><th>signature</th><th>returns</th></tr>
	</thead>
	<tbody>
		<tr><td><code>html</code></td><td>tagged template</td><td><code>FormatResult</code></td></tr>
		<tr><td><code>md</code></td><td>tagged template</td><td><code>FormatResult</code></td></tr>
		<tr><td><code>htmlToEntities</code></td><td><code>(s: string)</code></td><td><code>FormatResult</code></td></tr>
		<tr><td><code>mdToEntities</code></td><td><code>(s: string)</code></td><td><code>FormatResult</code></td></tr>
	</tbody>
</table>
<p>
	the result is accepted anywhere core sends text: <code>ctx.send</code>/<code>reply</code>,
	captions, and — via the schema-generated format map — every <code>bot.api.*</code> method with an
	<code>*_entities</code> sibling, including nested spots like
	<code>reply_parameters.quote</code>, poll options and media groups.
</p>
