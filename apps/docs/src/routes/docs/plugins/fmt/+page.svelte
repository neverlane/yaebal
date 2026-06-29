<script lang="ts">
	import Code from "$lib/Code.svelte";

	const install = `pnpm add @yaebal/fmt`;

	const basic = `import { html, md } from "@yaebal/fmt";

// parses into MessageEntity[] — no parse_mode, nothing to escape
ctx.send(html\`<b>hello</b> <a href="https://yaeb.al">docs</a>\`);
ctx.send(md\`**hello** and \\\`code\\\` and ||spoiler||\`);`;

	const escape = `const name = "<script>**hax**";

// the interpolation is inserted as LITERAL text — never re-parsed
ctx.send(html\`hi <b>\${name}</b>\`);
// → text: "hi <script>**hax**", one bold entity. no injection possible.`;

	const compose = `import { html } from "@yaebal/fmt";
import { bold, link } from "@yaebal/core";

// a FormatResult sub (from core's builders) is MERGED, offsets shifted
ctx.send(html\`welcome \${bold(user.name)} — \${link("open", url)}\`);`;

	const htmlTags = `b / strong          → bold
i / em              → italic
u / ins             → underline
s / strike / del    → strikethrough
code                → code
pre                 → pre
a href="…"          → text_link
span.tg-spoiler     → spoiler
tg-spoiler          → spoiler
blockquote          → blockquote`;

	const mdSyntax = `**bold**       __italic__      ~~strike~~
||spoiler||    \`code\`          [text](url)
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

<h2>auto-escaped interpolation</h2>
<p>
	this is the headline. a <code>${"${string}"}</code> interpolation is inserted as
	<strong>literal text</strong> — its <code>*</code>, <code>&lt;</code>, <code>`</code> are never
	re-parsed as markup. user input cannot inject entities or break the message.
</p>
<Code code={escape} title="safe.ts" />
<div class="note">
	<strong>composes with core.</strong> if an interpolation is itself a <code>FormatResult</code>
	(e.g. from <code>bold()</code> / <code>link()</code>), it's merged in with its offsets shifted —
	so dynamic links don't need attribute parsing, just drop in a <code>link()</code>.
</div>
<Code code={compose} title="compose.ts" />

<h2>html tags</h2>
<Code code={htmlTags} title="supported tags" lang="text" />

<h2>markdown syntax</h2>
<Code code={mdSyntax} title="supported syntax" lang="text" />
<div class="note">
	this is a Telegram-oriented dialect (not full CommonMark): same delimiter can't nest in itself,
	and dynamic links compose via core's <code>link()</code> rather than
	<code>[x](${"${url}"})</code> (the url interpolation would be escaped as text).
</div>

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
