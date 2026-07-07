<script lang="ts">
	import Code from "$lib/Code.svelte";

	const helpers = `import { media } from "@yaebal/core";

media.path("./photo.jpg");                  // local file → uploaded
media.url("https://yaebal.mom/p.png");         // remote url → passed as a string
media.buffer(new Uint8Array([…]), "p.png"); // in-memory bytes → uploaded
media.stream(readable, "video.mp4");        // web stream / async iterable → uploaded
media.text("hello", "notes.txt");           // string → uploaded as a text file
media.fileId("AgACAgIAAx…");                // already on Telegram → reused`;

	const guard = `import { isMediaSource, media } from "@yaebal/core";

isMediaSource(media.fileId("AgAC"));            // true — branded with a symbol
isMediaSource({ kind: "fileId", fileId: "x" }); // false — not branded`;

	const send = `bot.command("photo", (ctx) =>
  ctx.sendPhoto(media.url("https://picsum.photos/400"), {
    caption: "a random picture",
  }),
);

bot.command("doc", (ctx) =>
  ctx.sendDocument(media.path("./report.pdf")),
);

// a raw file_id or url string works too — no wrapper required:
ctx.sendPhoto("AgACAgIAAx…");`;

	const album = `// nested media works everywhere the Bot API takes it — sendMediaGroup,
// editMessageMedia, sendPaidMedia, createNewStickerSet, stories, …
await ctx.sendMediaGroup({
  media: [
    { type: "photo", media: media.path("./one.jpg"), caption: "first" },
    { type: "photo", media: media.fileId("AgAC…") },
    { type: "video", media: media.url("https://…/v.mp4"), thumbnail: media.buffer(thumb, "t.jpg") },
  ],
});`;

	const json = `// no uploadable media anywhere → JSON, with url/fileId inlined to strings
await encodeRequest({ chat_id: 1, photo: media.fileId("AgAC") });
//   { body: '{"chat_id":1,"photo":"AgAC"}', contentType: "application/json" }

await encodeRequest({ photo: media.url("https://yaebal.mom/p.png") });
//   { body: '{"photo":"https://yaebal.mom/p.png"}', contentType: "application/json" }`;

	const multipart = `// an uploadable source present — at any depth — → the whole request
// becomes multipart. each upload is attached under a generated field
// and referenced via attach://
await encodeRequest({
  chat_id: 7,
  media: [{ type: "photo", media: media.buffer(new Uint8Array([1, 2, 3]), "pic.png") }],
});
// FormData:
//   media   = '[{"type":"photo","media":"attach://_file0"}]'
//   _file0  = <Blob "pic.png">
//   chat_id = "7"`;
</script>

<svelte:head>
	<title>media — yaebal</title>
</svelte:head>

<h1>media</h1>
<p class="lead">
	one uniform way to point at a file — local path, url, in-memory buffer, stream, inline text, or
	an existing Telegram file_id — and the Api layer picks the right wire form, at any nesting
	depth.
</p>

<h2>the six sources</h2>
<p>
	a <code>MediaSource</code> is a small discriminated, branded object. you never build one by hand —
	use the <code>media.*</code> helpers:
</p>
<Code code={helpers} title="media.ts" />
<table>
	<thead>
		<tr><th>helper</th><th>kind</th><th>on the wire</th></tr>
	</thead>
	<tbody>
		<tr><td><code>media.path</code></td><td><code>path</code></td><td>read from disk, uploaded as multipart</td></tr>
		<tr><td><code>media.buffer</code></td><td><code>buffer</code></td><td>bytes uploaded as multipart (with optional filename)</td></tr>
		<tr><td><code>media.stream</code></td><td><code>stream</code></td><td>web <code>ReadableStream</code> or async iterable, buffered right before the request</td></tr>
		<tr><td><code>media.text</code></td><td><code>text</code></td><td>string uploaded as a text file (default name <code>text.txt</code>)</td></tr>
		<tr><td><code>media.url</code></td><td><code>url</code></td><td>sent as a plain url string</td></tr>
		<tr><td><code>media.fileId</code></td><td><code>fileId</code></td><td>sent as the file_id string</td></tr>
	</tbody>
</table>

<h2>isMediaSource</h2>
<p>
	every helper brands its result with a unique symbol. <code>isMediaSource</code> checks that brand,
	so a plain object that merely looks like one is rejected — the Api layer uses this to decide what
	to encode.
</p>
<Code code={guard} title="guard.ts" />

<h2>sending media</h2>
<p>
	<code>ctx.sendPhoto</code> and <code>ctx.sendDocument</code> accept a <code>MediaSource</code> or a
	raw <code>file_id</code>/url string directly. extra params (caption, reply markup, …) go in the
	second argument.
</p>
<Code code={send} title="handler.ts" />

<h2>albums and nested media</h2>
<p>
	the encoder walks the params — a <code>MediaSource</code> nested inside
	<code>media[]</code> items, <code>thumbnail</code>/<code>cover</code> fields, sticker sets or
	story content is rewritten to an <code>attach://</code> reference automatically. the generated
	types accept <code>InputFile | string</code> exactly where the runtime handles it.
</p>
<Code code={album} title="album.ts" />

<h2>how upload works</h2>
<p>
	<code>encodeRequest</code> decides the encoding per request. if no uploadable source is present,
	the body is JSON and any <code>url</code>/<code>fileId</code> media is inlined to its string:
</p>
<Code code={json} title="api.ts" />
<p>
	the moment an uploadable source (<code>path</code>, <code>buffer</code>, <code>stream</code>,
	<code>text</code>) appears anywhere in the params, the whole request switches to
	<code>multipart/form-data</code>. each upload is written to a generated field and the param
	points at it with <code>attach://</code>:
</p>
<Code code={multipart} title="api.ts" />

<div class="note">
	<strong>runtime note.</strong> <code>media.path()</code> needs a filesystem — the
	<code>yaebal</code> meta package injects one automatically on node/bun/deno; on edge runtimes
	pass <code>media.buffer()</code>/<code>media.url()</code> instead. <code>media.stream()</code> is
	buffered before sending: multipart needs a sized body.
</div>

<h2>downloading</h2>
<p>
	the read side lives in <a href="/docs/plugins/files">@yaebal/files</a> — metadata, links,
	streaming downloads, save-to-disk, local Bot API server strategies. to look
	<em>inside</em> a <code>file_id</code> (datacenter, access hash, dedupe key) without any api
	call, use <a href="/docs/plugins/file-id">@yaebal/file-id</a>.
</p>
