<script lang="ts">
	import Code from "$lib/Code.svelte";

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

	const media = `// real @yaebal/types shapes — hand it a ctx.message almost verbatim.
// for picture-like media add \`src\` (URL/data-URI) to show real pixels;
// a file_id has none, so without \`src\` you get a clean placeholder.
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
	media type, the lot. zero runtime, no <code>&lt;foreignObject&gt;</code> (so it rasterizes and survives
	github's svg sanitizer). drop the result into docs, a readme, or a landing page.
</p>
<Code code={usage} title="preview.ts" />

<h2>messages</h2>
<p>
	each entry is a <code>ChatMessage</code>. <code>from</code> is the only required field:
	<code>"user"</code> renders outgoing (right-aligned, with ticks), <code>"bot"</code> renders incoming
	(left-aligned, with an avatar).
</p>
<table>
	<thead>
		<tr><th>field</th><th>type</th><th>description</th></tr>
	</thead>
	<tbody>
		<tr><td><code>from</code></td><td><code>Side</code> (<code>"user" | "bot"</code>)</td><td>required. outgoing vs incoming</td></tr>
		<tr><td><code>name</code></td><td><code>string</code></td><td>sender label (incoming); also drives the avatar initial + colour</td></tr>
		<tr><td><code>time</code></td><td><code>string</code></td><td>timestamp shown in the message meta</td></tr>
		<tr><td><code>status</code></td><td><code>TickStatus</code> (<code>"sent" | "delivered" | "read"</code>)</td><td>outgoing read receipt (ticks). ignored for incoming</td></tr>
		<tr><td><code>buttons</code></td><td><code>string[][]</code></td><td>keyboard rows rendered as buttons under the message</td></tr>
		<tr><td><code>text</code></td><td><code>string</code></td><td>message text. wrapped automatically</td></tr>
		<tr><td><code>entities</code></td><td><code>MessageEntity[]</code></td><td>entities for <code>text</code> (bold/italic/code/link/spoiler/…). spread <code>@yaebal/fmt</code>'s <code>md</code>/<code>html</code> to get these for free</td></tr>
		<tr><td><code>caption</code></td><td><code>string</code></td><td>caption for a media message</td></tr>
		<tr><td><code>captionEntities</code></td><td><code>MessageEntity[]</code></td><td>entities for <code>caption</code></td></tr>
		<tr><td><code>src</code></td><td><code>string</code></td><td>real image/thumb url or data-uri for the picture-like media (a <code>file_id</code> can't render)</td></tr>
		<tr><td><code>spoiler</code></td><td><code>boolean</code></td><td>cover the media with a spoiler</td></tr>
		<tr><td><code>photo</code></td><td><code>PhotoSize[]</code></td><td>image (or placeholder) + optional <code>caption</code></td></tr>
		<tr><td><code>sticker</code></td><td><code>Sticker</code></td><td>standalone image, or its <code>emoji</code> big</td></tr>
		<tr><td><code>animation</code></td><td><code>Animation</code></td><td>image + <code>GIF</code> badge</td></tr>
		<tr><td><code>video</code></td><td><code>Video</code></td><td>image + play button + duration</td></tr>
		<tr><td><code>voice</code></td><td><code>Voice</code></td><td>waveform + duration</td></tr>
		<tr><td><code>audio</code></td><td><code>Audio</code></td><td>play disc + title / performer</td></tr>
		<tr><td><code>document</code></td><td><code>Document</code></td><td>file icon + name + size</td></tr>
		<tr><td><code>venue</code></td><td><code>Venue</code></td><td>map tile + pin + title/address</td></tr>
		<tr><td><code>location</code></td><td><code>Location</code></td><td>map tile + pin</td></tr>
		<tr><td><code>contact</code></td><td><code>Contact</code></td><td>avatar + name + phone</td></tr>
		<tr><td><code>poll</code></td><td><code>Poll</code></td><td>question + options with percentage bars</td></tr>
	</tbody>
</table>

<h2>media</h2>
<p>
	all media fields use the real <code>@yaebal/types</code> shapes (the array/objects you'd get off an
	<code>Update</code>). add <code>spoiler: true</code> to cover picture media.
</p>
<Code code={media} title="media.ts" />

<h2>api</h2>
<table>
	<thead>
		<tr><th>export</th><th>signature</th><th>description</th></tr>
	</thead>
	<tbody>
		<tr><td><code>renderChat</code></td><td><code>(messages: ChatMessage[], options?: RenderOptions) =&gt; string</code></td><td>render a telegram-style chat to an svg string</td></tr>
		<tr><td><code>ChatMessage</code></td><td>interface</td><td>one message — see the table above</td></tr>
		<tr><td><code>RenderOptions</code></td><td>interface</td><td>render-wide options — see below</td></tr>
		<tr><td><code>Side</code></td><td><code>"user" | "bot"</code></td><td>message direction</td></tr>
		<tr><td><code>TickStatus</code></td><td><code>"sent" | "delivered" | "read"</code></td><td>outgoing read receipt</td></tr>
	</tbody>
</table>

<h3>RenderOptions</h3>
<table>
	<thead>
		<tr><th>option</th><th>type</th><th>default</th><th>description</th></tr>
	</thead>
	<tbody>
		<tr><td><code>theme</code></td><td><code>"dark" | "light"</code></td><td><code>"light"</code></td><td>the green-wallpaper look, or dark</td></tr>
		<tr><td><code>width</code></td><td><code>number</code></td><td><code>380</code></td><td>canvas width in px</td></tr>
		<tr><td><code>avatar</code></td><td><code>string</code></td><td>name initial</td><td>override the avatar glyph for incoming messages</td></tr>
	</tbody>
</table>
