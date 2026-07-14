<script lang="ts">
	import Code from "$lib/Code.svelte";
	import Try from "$lib/Try.svelte";

	const helpers = `import { media } from "@yaebal/core";

declare const bytes: Uint8Array;
declare const readable: ReadableStream<Uint8Array>;

media.path("./photo.jpg");             // local file → uploaded
media.url("https://yaebal.mom/p.png"); // remote url → passed as a string
media.buffer(bytes, "p.png");          // in-memory bytes → uploaded
media.stream(readable, "video.mp4");   // web stream / async iterable → uploaded
media.text("hello", "notes.txt");      // string → uploaded as a text file
media.fileId("AgACAgIAAx");            // already on Telegram → reused`;

	const guard = `import { isMediaSource, media } from "@yaebal/core";

isMediaSource(media.fileId("AgAC"));            // true — branded with a symbol
isMediaSource({ kind: "fileId", fileId: "x" }); // false — not branded`;

	const send = `import { Bot, media } from "@yaebal/core";

const bot = new Bot(process.env.BOT_TOKEN!);

bot.command("photo", (ctx) =>
  ctx.sendPhoto(media.url("https://picsum.photos/400"), {
    caption: "a random picture",
  }),
);

bot.command("doc", (ctx) =>
  ctx.sendDocument(media.path("./report.pdf")),
);

// a raw file_id or url string works too — no wrapper required:
bot.command("cached", (ctx) => ctx.sendPhoto("AgACAgIAAx"));`;

	const captionFmt = `import { Bot, media } from "@yaebal/core";
import { md } from "@yaebal/fmt";

const bot = new Bot(process.env.BOT_TOKEN!);

// caption accepts a plain string OR a fmt/md/html result, exactly like send()'s text
bot.command("photo", (ctx) =>
  ctx.sendPhoto(media.url("https://picsum.photos/400"), {
    caption: md\`**shipped** \\\`v1.2\\\`\`,
  }),
);`;

	const album = `import { Bot, media } from "@yaebal/core";

const bot = new Bot(process.env.BOT_TOKEN!);
const thumb = new Uint8Array([1, 2, 3]);

// nested media works everywhere the Bot API takes it — sendMediaGroup,
// editMessageMedia, sendPaidMedia, createNewStickerSet, stories, …
await bot.api.call("sendMediaGroup", {
  chat_id: 1,
  media: [
    { type: "photo", media: media.path("./one.jpg"), caption: "first" },
    { type: "photo", media: media.fileId("AgAC") },
    {
      type: "video",
      media: media.url("https://example.com/v.mp4"),
      thumbnail: media.buffer(thumb, "t.jpg"),
    },
  ],
});`;

	const json = `import { encodeRequest, media } from "@yaebal/core";

// no uploadable media anywhere → JSON, with url/fileId inlined to strings
await encodeRequest({ chat_id: 1, photo: media.fileId("AgAC") });
//   { body: '{"chat_id":1,"photo":"AgAC"}', contentType: "application/json" }

await encodeRequest({ photo: media.url("https://yaebal.mom/p.png") });
//   { body: '{"photo":"https://yaebal.mom/p.png"}', contentType: "application/json" }`;

	const multipart = `import { encodeRequest, media } from "@yaebal/core";

// an uploadable source present — at any depth — → the whole request
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

	const downloadFile = `import { Bot } from "@yaebal/core";
import { writeFile } from "node:fs/promises";

const bot = new Bot(process.env.BOT_TOKEN!);

bot.on("message:photo", async (ctx) => {
  const fileId = ctx.message.photo.at(-1)?.file_id; // largest size last
  if (!fileId) return;

  // getFile(fileId) + a fetch of the result, one call — no runtime-specific fs needed
  const { filePath, bytes } = await bot.api.downloadFile(fileId);
  await writeFile(\`./downloads/\${filePath.split("/").pop()}\`, bytes);
  await ctx.reply("saved");
});`;

	const fileUrl = `import { Bot } from "@yaebal/core";

const bot = new Bot(process.env.BOT_TOKEN!);

bot.on("message:document", async (ctx) => {
  const file = await bot.api.getFile({ file_id: ctx.message.document.file_id });
  if (!file.file_path) return; // file exceeds the 20MB download cap — see the table above

  const url = bot.api.fileUrl(file.file_path);
  // https://api.telegram.org/file/bot<token>/<file_path>
  //                                  ^^^^^^^ contains the bot token — never log it, never
  //                                  hand it to an untrusted client
  void url;
});`;
</script>

<svelte:head>
	<title>media — yaebal</title>
</svelte:head>

<h1 data-pagefind-meta="title">media &amp; files</h1>
<p class="lead">
	one uniform way to point at a file — local path, url, in-memory buffer, stream, inline text, or
	an existing Telegram file_id — and the Api layer picks the right wire form, at any nesting
	depth. plus the read side: downloading, limits, and where local Bot API changes things.
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
<div class="note">
	<strong>name your uploads.</strong> <code>media.buffer</code>/<code>media.stream</code> default
	to a bare <code>"file"</code> filename when you don't pass one — always give one with a real
	extension (<code>media.buffer(bytes, "report.pdf")</code>); Telegram infers the content type
	from it.
</div>

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
<p>
	<code>caption</code> accepts a plain string or a <a href="/docs/plugins/fmt">fmt/md/html</a>
	result, exactly like <code>send</code>'s own text argument:
</p>
<Code code={captionFmt} title="caption-fmt.ts" />

<h2>albums and nested media</h2>
<p>
	the encoder walks the params — a <code>MediaSource</code> nested inside
	<code>media[]</code> items, <code>thumbnail</code>/<code>cover</code> fields, sticker sets or
	story content is rewritten to an <code>attach://</code> reference automatically. the generated
	types accept <code>InputFile | string</code> exactly where the runtime handles it. (this uses
	<code>bot.api.call</code> directly — <code>sendMediaGroup</code> and friends aren't <code>ctx</code>
	shortcuts on the base context; see <a href="/docs/contexts">contexts</a> for the richer,
	per-update API where they are.)
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
<Code code={multipart} title="multipart.ts" />

<div class="note">
	<strong>runtime note.</strong> <code>media.path()</code> needs a filesystem — the
	<code>yaebal</code> meta package injects one automatically on node/bun/deno; on edge runtimes
	pass <code>media.buffer()</code>/<code>media.url()</code> instead, or pass your own
	<code>readFile</code> to <code>new Bot(token, {'{ readFile }'})</code> from bare
	<code>@yaebal/core</code>. <code>media.stream()</code> is buffered before sending: multipart
	needs a sized body.
</div>

<h2>telegram's limits</h2>
<table>
	<thead><tr><th>direction</th><th>limit</th></tr></thead>
	<tbody>
		<tr><td>sending a photo</td><td>10 MB</td></tr>
		<tr><td>sending anything else (document, video, …)</td><td>50 MB</td></tr>
		<tr><td>downloading any file, via the public Bot API</td><td>20 MB</td></tr>
		<tr>
			<td>either direction, via a <a href="/docs/production/local-bot-api">local bot api server</a></td>
			<td>2 GB</td>
		</tr>
	</tbody>
</table>
<div class="note">
	hit the 20 MB download cap often? that's exactly what a local bot api server lifts — see
	<a href="/docs/production/local-bot-api">local bot api</a>.
</div>

<h2>downloading</h2>
<p>
	<code>bot.api.downloadFile(fileId)</code> is <code>getFile</code> + a fetch of the result, in one
	call — no runtime-specific filesystem module needed, so it works the same on node, bun, deno and
	edge. it throws if Telegram reports no <code>file_path</code> (the file exceeds the 20 MB
	download cap above) or the download itself fails.
</p>
<Code code={downloadFile} title="download.ts" />
<p>
	need just the URL (say, to hand to something else that fetches it)? <code>fileUrl</code> builds
	it from a <code>file_path</code> you already have:
</p>
<Code code={fileUrl} title="file-url.ts" />
<div class="note">
	<strong>contains the token.</strong> the file download URL embeds the bot token. never log it,
	and never hand it to an untrusted client — anyone with it controls the bot.
</div>
<p>
	for a higher-level read side — metadata, links, streaming downloads, save-to-disk helpers, local
	Bot API server strategies — see <a href="/docs/plugins/files">@yaebal/files</a>. to look
	<em>inside</em> a <code>file_id</code> (datacenter, access hash, dedupe key) without any api
	call, use <a href="/docs/plugins/file-id">@yaebal/file-id</a>.
</p>
<Try id="media-poll" title="try it — media and poll" />
