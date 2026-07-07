<script lang="ts">
	import Code from "$lib/Code.svelte";

	const install = `pnpm add @yaebal/file-id`;

	const usage = `import { FileId, FileType, isPhotoFileId } from "@yaebal/file-id";

const file = FileId.from(ctx.document.file_id);

file.kind          // "photo" | "document" | "web"
file.fileType      // FileType.Sticker, FileType.Video, …
file.dcId          // 1..5 — which telegram datacenter stores the file
file.accessHash    // bigint
file.hasReference  // carries a fresh file_reference?

// full discriminated union for narrowing
if (isPhotoFileId(file.raw)) {
  file.raw.photoSize; // legacy | thumbnail | dialog_photo_* | sticker_set_thumbnail*
}

file.toString(); // re-serializes — round-trips the original string byte-for-byte`;

	const dedupe = `// file_id is bot-scoped and may rotate; file_unique_id is the stable identity.
// it's derivable from the full id — same unique id ⇒ same underlying file:
const uniqueKey = FileId.from(msg.document.file_id).toUniqueId().toString();

// or parse one you already have:
import { FileUniqueId } from "@yaebal/file-id";
const unique = FileUniqueId.from(msg.document.file_unique_id);
unique.kind; // "photo" | "document" | "web" | "secure" | "encrypted" | "temp"`;

	const dcExample = `import { FileId } from "@yaebal/file-id";

const DC_NAMES: Record<number, string> = {
  1: "Miami, FL, USA",
  2: "Amsterdam, NL",
  3: "Miami, FL, USA",
  4: "Amsterdam, NL",
  5: "Singapore",
};

bot.on("message:photo", (ctx) => {
  const file = FileId.from(ctx.photo.at(-1)!.file_id);
  return ctx.reply(\`stored on DC \${file.dcId} (\${DC_NAMES[file.dcId] ?? "?"})\`);
});`;
</script>

<svelte:head>
	<title>@yaebal/file-id — yaebal</title>
</svelte:head>

<h1>@yaebal/file-id</h1>
<p class="lead">parse, inspect and re-serialize telegram <code>file_id</code> and <code>file_unique_id</code> strings. a <code>file_id</code> isn't opaque — it's a TL-serialized TDLib blob (behind zero-byte RLE and url-safe base64) carrying the file's datacenter, type, access hash, file reference and photo-size source. zero dependencies, pure js, runs anywhere — not a plugin, just a parser.</p>

<h2>install</h2>
<Code code={install} title="terminal" lang="sh" />

<h2>usage</h2>
<Code code={usage} title="inspect.ts" />

<h2>dedupe with file_unique_id</h2>
<Code code={dedupe} title="dedupe.ts" />

<h2>example: which datacenter?</h2>
<p>forwards keep the original upload's <code>file_id</code> internals, so this works on forwarded media too.</p>
<Code code={dcExample} title="dc-bot.ts" />

<h2>api</h2>
<table>
	<thead>
		<tr><th>export</th><th>kind</th><th>description</th></tr>
	</thead>
	<tbody>
		<tr>
			<td><code>FileId</code></td>
			<td>class</td>
			<td><code>FileId.from(string)</code> parses; getters for the common fields; <code>.raw</code> is the discriminated union; <code>.toString()</code> re-serializes; <code>.toUniqueId()</code> derives the dedupe key.</td>
		</tr>
		<tr>
			<td><code>FileUniqueId</code></td>
			<td>class</td>
			<td>the same treatment for <code>file_unique_id</code> strings.</td>
		</tr>
		<tr>
			<td><code>parseFileId</code> / <code>serializeFileId</code> / <code>parseFileUniqueId</code> / <code>serializeFileUniqueId</code> / <code>fileUniqueIdFromFileId</code></td>
			<td>functions</td>
			<td>the functional api — every class entry point without the wrapper.</td>
		</tr>
		<tr>
			<td><code>isPhotoFileId</code>, <code>isDocumentFileId</code>, <code>isWebFileId</code>, <code>isStickerFileId</code>, …</td>
			<td>guards</td>
			<td>type-narrowing predicates for <code>.raw</code> (file ids, unique ids and photo-size sources).</td>
		</tr>
		<tr>
			<td><code>FileType</code>, <code>PhotoSizeSourceType</code>, <code>FileUniqueType</code></td>
			<td>constants</td>
			<td>TDLib-mirroring tag spaces (<code>FileType.Sticker === 8</code>, …).</td>
		</tr>
		<tr>
			<td><code>base64urlEncode/Decode</code>, <code>rleEncode/Decode</code>, <code>packTlString/unpackTlString</code>, <code>BinaryReader</code>, <code>BinaryWriter</code></td>
			<td>low-level</td>
			<td>the encoding primitives the parser is built on — for custom TDLib-flavored formats.</td>
		</tr>
	</tbody>
</table>

<h2>errors</h2>
<ul>
	<li><code>FileIdParseError</code> — malformed input (bad base64url, truncated payload, unknown tags). carries <code>.input</code>.</li>
	<li><code>UnsupportedFileIdVersionError</code> — telegram bumped the format past what this parser knows (<code>.version</code> / <code>.subVersion</code>). open an issue when you hit it.</li>
</ul>

<h2>notes</h2>
<ul>
	<li>parse → serialize round-trips the original string byte-for-byte — safe to store the parsed form.</li>
	<li><code>accessHash</code> and ids are <code>bigint</code>s; serialize them yourself before <code>JSON.stringify</code>.</li>
	<li>this package reads ids; it never talks to telegram. downloading is <a href="/docs/plugins/files">@yaebal/files</a>.</li>
</ul>

<h2>related</h2>
<ul>
	<li><a href="/docs/plugins/files">@yaebal/files</a> — resolve and download the file behind an id.</li>
	<li><a href="/docs/plugins/media-cache">@yaebal/media-cache</a> — cache <code>file_id</code>s to skip re-uploads.</li>
</ul>
