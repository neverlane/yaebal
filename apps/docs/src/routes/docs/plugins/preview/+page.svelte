<script lang="ts">
	import Code from "$lib/Code.svelte";
	import Try from "$lib/Try.svelte";

	const install = `pnpm add @yaebal/preview`;

	const usage = `import { renderChat } from "@yaebal/preview";
import { md } from "@yaebal/fmt"; // optional — produces { text, entities }
import { writeFile } from "node:fs/promises";

const svg = renderChat(
  [
    { from: "user", text: "/start", time: "23:33", status: "read" },
    { from: "bot", name: "yaebal", ...md\`Hello, **unknown** person\`, time: "23:33" },
    { from: "bot", name: "yaebal", photo: [], src: "cat.jpg", caption: "a cat" },
    { from: "bot", name: "yaebal", voice: { duration: 7 } },
    { from: "bot", name: "yaebal", buttons: [["Useless button"]] },
  ],
  { theme: "light", width: 400 },
);

await writeFile("chat.svg", svg); // it's just a string`;

	const builder = `import { chat } from "@yaebal/preview";

// a chainable alternative to a raw array literal — handy for quick docs/examples
const svg = chat({ theme: "dark" })
  .user("/start", { time: "23:33", status: "read" })
  .bot("hello, unknown person", { name: "yaebal", time: "23:33" })
  .system("today")
  .render();`;

	const media = `// real @yaebal/types shapes — hand it a ctx.message almost verbatim, or write a
// minimal fixture by hand: media fields accept a Partial<T>, so { duration: 7 }
// is just as valid as a full Voice object.
// for picture-like media add \`src\` (URL/data-URI) to show real pixels;
// a file_id has none, so without \`src\` you get a clean, deterministically-coloured
// placeholder (seeded by the media's own file_unique_id, not by message order).
renderChat([
  { from: "bot", name: "yaebal", photo: [], src: "cat.jpg", spoiler: true },
  { from: "bot", name: "yaebal", video: { width: 640, height: 360, duration: 42 } },
  { from: "bot", name: "yaebal", sticker: { emoji: "🎈" } },
  { from: "bot", name: "yaebal", document: { file_name: "report.pdf", file_size: 81920 } },
  { from: "bot", name: "yaebal", contact: { first_name: "Ann", phone_number: "+1 555" } },
  {
    from: "bot",
    name: "yaebal",
    poll: {
      question: "tabs?",
      options: [
        { text: "yes", voter_count: 7 },
        { text: "no", voter_count: 1 },
      ],
    },
  },
]);`;

	const flagship = `// reply quotes, forwarded headers, reactions, and a link-preview card — all plain
// fields on ChatMessage, no bot required to produce them
renderChat([
  {
    from: "bot",
    name: "yaebal",
    forward: { from: "release notes" },
    text: "@yaebal/preview now speaks reply quotes, reactions, and link previews.",
  },
  {
    from: "bot",
    name: "yaebal",
    reply: { name: "yaebal", text: "@yaebal/preview now speaks reply quotes..." },
    text: "here's the whole tour in one message.",
    reactions: [
      { emoji: "🔥", count: 3, chosen: true },
      { emoji: "👍", count: 1 },
    ],
  },
  {
    from: "bot",
    name: "yaebal",
    webpage: {
      site: "yaebal.mom",
      title: "@yaebal/preview",
      description: "render a telegram-style chat to an svg string — zero deps, zero runtime.",
    },
    text: "docs are here:",
  },
]);`;

	const grouping = `// consecutive messages from the same sender (same "from" + "name") group like
// telegram does: one avatar and one name label for the whole run, and only the
// last bubble in the run gets the pointed tail corner
renderChat([
  { from: "bot", name: "yaebal", text: "first" },
  { from: "bot", name: "yaebal", text: "second" },
  { from: "bot", name: "yaebal", avatar: "🐸", text: "override just this message's avatar" },
]);`;

	const theming = `// theme accepts a preset name, a full custom Palette, or a preset + point overrides
renderChat(messages, { theme: "dark" });
renderChat(messages, { theme: { in: "#202830", inText: "#e8e8e8" } }); // fully custom palette
renderChat(messages, { theme: "dark", palette: { out: "#204020" } }); // preset + overrides
renderChat(messages, { wallpaper: "#0b0b0b" }); // solid background instead of the two-tone gradient
renderChat(messages, { scale: 2 }); // crisp @2x rasterization (viewBox stays 1x)`;
</script>

<svelte:head>
	<title>@yaebal/preview — yaebal</title>
</svelte:head>

<h1>@yaebal/preview</h1>
<p class="lead">render a telegram-style chat from plain objects to an svg string</p>

<div class="note">
	<strong>experimental / wip.</strong> the api and rendering may change without notice. not ready
	for production — pin a version if you depend on the output.
</div>

<h2>install</h2>
<Code code={install} title="terminal" lang="sh" />

<h2>usage</h2>
<p>
	<code>renderChat(messages, options)</code> returns an svg <em>string</em> — rich text, every common
	media type, reply quotes, forwarded headers, reactions, link previews, custom themes, and
	telegram-style message grouping. zero runtime, no <code>&lt;foreignObject&gt;</code> (so it
	rasterizes and survives github's svg sanitizer). drop the result into docs, a readme, or a
	landing page.
</p>
<Code code={usage} title="preview.ts" />

<p>
	<code>chat(options)</code> is a chainable alternative to building the array by hand:
</p>
<Code code={builder} title="builder.ts" />

<h2>try it</h2>
<p>
	a live bot that quotes, reacts to, and forwards whatever you send it — each renders as the real
	thing, not a debug annotation:
</p>
<Try id="quote-react-forward" title="bot.ts" />

<h2>messages</h2>
<p>
	each entry is a <code>ChatMessage</code>. <code>from</code> is the only required field:
	<code>"user"</code> renders outgoing (right-aligned, with ticks), <code>"bot"</code> renders incoming
	(left-aligned, with an avatar), <code>"system"</code> renders a centered pill (e.g. a date divider).
</p>
<table>
	<thead>
		<tr><th>field</th><th>type</th><th>description</th></tr>
	</thead>
	<tbody>
		<tr><td><code>from</code></td><td><code>Side</code> (<code>"user" | "bot" | "system"</code>)</td><td>required. outgoing vs incoming vs a centered notice</td></tr>
		<tr><td><code>name</code></td><td><code>string</code></td><td>sender label (incoming); also drives the avatar initial + colour</td></tr>
		<tr><td><code>avatar</code></td><td><code>string</code></td><td>override just this message's avatar glyph (else <code>RenderOptions.avatar</code>/the name's initial)</td></tr>
		<tr><td><code>time</code></td><td><code>string</code></td><td>timestamp shown in the message meta</td></tr>
		<tr><td><code>status</code></td><td><code>TickStatus</code> (<code>"sent" | "delivered" | "read"</code>)</td><td>outgoing read receipt (ticks). ignored for incoming</td></tr>
		<tr><td><code>edited</code></td><td><code>boolean</code></td><td>shows "edited" next to the time</td></tr>
		<tr><td><code>buttons</code></td><td><code>string[][]</code></td><td>keyboard rows rendered as buttons under the message</td></tr>
		<tr><td><code>reply</code></td><td><code>ReplyQuote</code></td><td>reply-to quote block (name, quoted text/entities, accent colour) rendered above the content</td></tr>
		<tr><td><code>forward</code></td><td><code>ForwardHeader</code></td><td>"Forwarded from …" header rendered above the content</td></tr>
		<tr><td><code>reactions</code></td><td><code>Reaction[]</code></td><td>reaction pills (<code>emoji</code>, <code>count</code>, <code>chosen</code>) rendered under the bubble</td></tr>
		<tr><td><code>webpage</code></td><td><code>WebpagePreview</code></td><td>link-preview card (<code>site</code>, <code>title</code>, <code>description</code>, <code>src</code>)</td></tr>
		<tr><td><code>debug</code></td><td><code>string | string[]</code></td><td>compact diagnostic text rendered above the bubble</td></tr>
		<tr><td><code>messageId</code></td><td><code>string | number</code></td><td>shown in the time/meta slot when <code>time</code> isn't set</td></tr>
		<tr><td><code>text</code></td><td><code>string</code></td><td>message text. wrapped automatically (unicode-aware — cjk/emoji measure at their real display width)</td></tr>
		<tr><td><code>entities</code></td><td><code>MessageEntity[]</code></td><td>entities for <code>text</code> (bold/italic/underline/strike/code/spoiler/link/…). spread <code>@yaebal/fmt</code>'s <code>md</code>/<code>html</code> to get these for free</td></tr>
		<tr><td><code>caption</code></td><td><code>string</code></td><td>caption for a media message</td></tr>
		<tr><td><code>captionEntities</code></td><td><code>MessageEntity[]</code></td><td>entities for <code>caption</code></td></tr>
		<tr><td><code>src</code></td><td><code>string</code></td><td>real image/thumb url or data-uri for the picture-like media (a <code>file_id</code> can't render)</td></tr>
		<tr><td><code>spoiler</code></td><td><code>boolean</code></td><td>cover the media with a spoiler</td></tr>
		<tr><td><code>photo</code> / <code>sticker</code> / <code>animation</code> / <code>video</code> / <code>voice</code> / <code>audio</code> / <code>document</code> / <code>venue</code> / <code>location</code> / <code>contact</code> / <code>poll</code></td><td>the real <code>@yaebal/types</code> shape, or a hand-written partial fixture</td><td>see <a href="#media">media</a> below</td></tr>
	</tbody>
</table>

<h2>media</h2>
<p>
	every media field accepts the real <code>@yaebal/types</code> shape (the array/objects you'd get
	off an <code>Update</code>) <em>or</em> a hand-written partial fixture with just the fields the
	renderer draws — <code>voice: {'{'} duration: 7 {'}'}</code> is valid, not just a full
	<code>Voice</code>. add <code>spoiler: true</code> to cover picture media. long names/titles
	truncate with an ellipsis instead of overflowing their card.
</p>
<Code code={media} title="media.ts" />

<table>
	<thead>
		<tr><th>field</th><th>renders as</th></tr>
	</thead>
	<tbody>
		<tr><td><code>photo</code></td><td>image (or a deterministic placeholder) + optional <code>caption</code></td></tr>
		<tr><td><code>sticker</code></td><td>standalone image or its <code>emoji</code> big — falls back to a boxed bubble if paired with text/buttons/reply/forward instead of dropping them</td></tr>
		<tr><td><code>animation</code></td><td>image + <code>GIF</code> badge</td></tr>
		<tr><td><code>video</code></td><td>image + play button + duration</td></tr>
		<tr><td><code>voice</code></td><td>waveform + duration</td></tr>
		<tr><td><code>audio</code></td><td>play disc + title / performer</td></tr>
		<tr><td><code>document</code></td><td>file icon + name + size</td></tr>
		<tr><td><code>venue</code> / <code>location</code></td><td>map tile + pin (+ title/address)</td></tr>
		<tr><td><code>contact</code></td><td>avatar + name + phone</td></tr>
		<tr><td><code>poll</code></td><td>question + options with percentage bars (sums to a clean 100%); shows the winning option on closed/quiz polls</td></tr>
	</tbody>
</table>

<h2>reply, forward, reactions, link previews</h2>
<p>
	the four flagship decorations are just fields on <code>ChatMessage</code> — no bot required to
	produce them, though the live example above shows them driven by a real bot
	(<code>ctx.quote()</code>, <code>ctx.react()</code>, <code>forwardMessage</code>).
</p>
<Code code={flagship} title="flagship.ts" />

<h2>message grouping</h2>
<p>
	consecutive messages from the same sender group like telegram does: one avatar and one name
	label for the whole run, a smaller gap between them, and only the last bubble gets the pointed
	tail corner. override just one message's avatar with <code>avatar</code> without breaking the
	group.
</p>
<Code code={grouping} title="grouping.ts" />

<h2>theming</h2>
<p>
	<code>theme</code> accepts <code>"light"</code>/<code>"dark"</code>, a fully custom
	<code>Palette</code>, or a preset with point <code>palette</code> overrides. <code>wallpaper</code>
	swaps the two-tone gradient background for a solid fill, and <code>scale</code> renders at a
	higher pixel density while keeping the same layout (<code>viewBox</code> stays 1x).
</p>
<Code code={theming} title="theme.ts" />

<h2>accessibility</h2>
<p>
	the root <code>&lt;svg&gt;</code> always carries <code>role="img"</code> and an auto-generated
	<code>&lt;title&gt;</code>/<code>&lt;desc&gt;</code> (spoiler text is masked before it can reach
	the description) — pass <code>a11yTitle</code>/<code>a11yDesc</code> to override them.
</p>

<h2>api</h2>
<table>
	<thead>
		<tr><th>export</th><th>signature</th><th>description</th></tr>
	</thead>
	<tbody>
		<tr><td><code>renderChat</code></td><td><code>(messages: ChatMessage[], options?: RenderOptions) =&gt; string</code></td><td>render a telegram-style chat to an svg string</td></tr>
		<tr><td><code>chat</code></td><td><code>(options?: RenderOptions) =&gt; ChatBuilder</code></td><td>chainable <code>.user()</code>/<code>.bot()</code>/<code>.system()</code>/<code>.push()</code>/<code>.render()</code> alternative to a raw array</td></tr>
		<tr><td><code>ChatMessage</code></td><td>interface</td><td>one message — see the table above</td></tr>
		<tr><td><code>RenderOptions</code></td><td>interface</td><td>render-wide options — see below</td></tr>
		<tr><td><code>ReplyQuote</code> / <code>ForwardHeader</code> / <code>Reaction</code> / <code>WebpagePreview</code></td><td>interfaces</td><td>the flagship decoration shapes</td></tr>
		<tr><td><code>Palette</code></td><td>interface</td><td>every themeable colour — pass a full or partial one via <code>theme</code>/<code>palette</code></td></tr>
		<tr><td><code>Theme</code></td><td><code>"light" | "dark" | Partial&lt;Palette&gt;</code></td><td>what <code>RenderOptions.theme</code> accepts</td></tr>
		<tr><td><code>Side</code></td><td><code>"user" | "bot" | "system"</code></td><td>message direction</td></tr>
		<tr><td><code>TickStatus</code></td><td><code>"sent" | "delivered" | "read"</code></td><td>outgoing read receipt</td></tr>
	</tbody>
</table>

<h3>RenderOptions</h3>
<table>
	<thead>
		<tr><th>option</th><th>type</th><th>default</th><th>description</th></tr>
	</thead>
	<tbody>
		<tr><td><code>theme</code></td><td><code>Theme</code></td><td><code>"light"</code></td><td>the green-wallpaper look, dark, or a fully custom palette</td></tr>
		<tr><td><code>palette</code></td><td><code>Partial&lt;Palette&gt;</code></td><td>—</td><td>point overrides layered on top of <code>theme</code></td></tr>
		<tr><td><code>width</code></td><td><code>number</code></td><td><code>380</code></td><td>canvas width in px</td></tr>
		<tr><td><code>scale</code></td><td><code>number</code></td><td><code>1</code></td><td>scales the rendered width/height (crisp @2x/@3x); <code>viewBox</code> stays 1x</td></tr>
		<tr><td><code>avatar</code></td><td><code>string</code></td><td>name initial</td><td>default avatar glyph for incoming messages — override per-message via <code>ChatMessage.avatar</code></td></tr>
		<tr><td><code>wallpaper</code></td><td><code>string</code></td><td>theme gradient</td><td>solid override for the chat background</td></tr>
		<tr><td><code>idPrefix</code></td><td><code>string</code></td><td>random per call</td><td>fixed id prefix for deterministic output (tests/snapshots) — otherwise every render gets its own unique ids, so two svgs on one page never collide</td></tr>
		<tr><td><code>a11yTitle</code> / <code>a11yDesc</code></td><td><code>string</code></td><td>auto-generated</td><td>override the <code>&lt;title&gt;</code>/<code>&lt;desc&gt;</code></td></tr>
	</tbody>
</table>

<p>
	part of the same suite as <a href="/docs/plugins/link-preview/">@yaebal/link-preview</a>
	(<code>link_preview_options</code> for real outgoing messages) and
	<a href="/docs/plugins/fmt/">@yaebal/fmt</a> (<code>md</code>/<code>html</code> produce the
	<code>{'{'} text, entities {'}'}</code> shape <code>renderChat</code> expects).
</p>
