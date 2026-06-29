<script lang="ts">
	import Code from "$lib/Code.svelte";

	const install = `import { Bot } from "@yaebal/core";
import { mediaCache } from "@yaebal/media-cache";
import { media } from "@yaebal/core";

const bot = new Bot(token);
const cache = mediaCache(); // defaults to in-memory storage

bot.command("logo", async (ctx) => {
  // first call: uploads the file and stores its file_id under "logo"
  // subsequent calls: skips the upload, sends the cached file_id instead
  await cache.photo(ctx, "logo", media.path("./assets/logo.png"));
});`;

	const customStorage = `import { mediaCache } from "@yaebal/media-cache";
import { RedisStorage } from "./my-redis-storage.js"; // your StorageAdapter<string>

const cache = mediaCache({ storage: new RedisStorage() });`;

	const document = `import { media } from "@yaebal/core";

// send a PDF and cache it under "report-2024"
await cache.document(ctx, "report-2024", media.path("./report.pdf"), {
  caption: "Q4 report",
});`;

	const keyConcept = `// "logo-en" and "logo-ru" are independent — distinct keys cache independently
await cache.photo(ctx, "logo-en", media.path("./logo-en.png"));
await cache.photo(ctx, "logo-ru", media.path("./logo-ru.png"));`;

	const transparent = `import { Bot } from "@yaebal/core";
import { mediaCache } from "@yaebal/media-cache";
import { media } from "@yaebal/core";

const bot = new Bot(token);
const cache = mediaCache();

// hook into the API client — now ctx.sendPhoto/Document/etc auto-cache
cache.hook(bot.api);

bot.command("logo", async (ctx) => {
  // first call uploads the file and caches its file_id
  // subsequent calls reuse the cached file_id automatically
  await ctx.sendPhoto(media.path("./assets/logo.png"));
});

bot.command("report", async (ctx) => {
  await ctx.sendDocument(media.path("./report.pdf"));
});`;
</script>

<svelte:head>
	<title>@yaebal/media-cache — yaebal</title>
</svelte:head>

<h1>@yaebal/media-cache</h1>
<p class="lead">
	reuse a <code>file_id</code> instead of re-uploading the same file. the first send uploads the
	local file and stores the returned <code>file_id</code>; every subsequent send under the same key
	skips the upload entirely.
</p>

<h2>installation</h2>
<Code code={`pnpm add @yaebal/media-cache`} lang="sh" title="terminal" />

<h2>transparent mode</h2>
<p>
	call <code>cache.hook(bot.api)</code> after creating the cache. this registers hooks on the bot's
	API client that automatically cache <code>file_id</code>s — no need to use
	<code>cache.photo</code>/<code>cache.document</code> explicitly. works with
	<code>ctx.sendPhoto</code>, <code>ctx.sendDocument</code>,
	<code>ctx.sendAudio</code>, <code>ctx.sendVideo</code>, <code>ctx.sendAnimation</code>,
	<code>ctx.sendVoice</code>, <code>ctx.sendVideoNote</code>, and <code>ctx.sendSticker</code>.
	keys are inferred from the source path or URL.
</p>
<Code code={transparent} title="bot.ts" />

<h2>manual mode</h2>
<p>
	create a <code>MediaCache</code> instance with <code>mediaCache()</code>, then call
	<code>cache.photo</code> or <code>cache.document</code> instead of <code>ctx.sendPhoto</code> /
	<code>ctx.sendDocument</code> directly. supply a stable string key to identify each asset.
</p>
<Code code={install} title="bot.ts" />

<h2>how caching works</h2>
<p>
	on the first call for a key the source is sent as-is (a path, url, or buffer). telegram returns a
	message containing the uploaded file's <code>file_id</code>. <code>media-cache</code> stores that
	id under your key. on the next call it calls <code>media.fileId(cached)</code> instead — no
	upload, just the id.
</p>
<p>
	for photos, the <em>last</em> (largest) size in the array is cached — that's the highest-quality
	variant telegram returns.
</p>

<h2>persistent storage</h2>
<p>
	the default storage is in-memory and lost on restart. pass any
	<code>StorageAdapter&lt;string&gt;</code> from <code>@yaebal/session</code> to persist across
	restarts.
</p>
<Code code={customStorage} title="bot.ts" />

<h2>documents</h2>
<Code code={document} title="send-doc.ts" />

<h2>independent keys</h2>
<p>
	keys are caller-supplied strings. distinct keys always cache independently — useful for per-locale
	or per-variant assets.
</p>
<Code code={keyConcept} title="keys.ts" />

<h2>api</h2>
<table>
	<thead>
		<tr><th>export</th><th>kind</th><th>description</th></tr>
	</thead>
	<tbody>
		<tr><td><code>mediaCache(options?)</code></td><td>function</td><td>creates a <code>MediaCache</code> instance</td></tr>
		<tr><td><code>MediaCache</code></td><td>interface</td><td>the object returned by <code>mediaCache()</code></td></tr>
		<tr><td><code>MediaCacheOptions</code></td><td>interface</td><td><code>storage?: StorageAdapter&lt;string&gt;</code></td></tr>
	</tbody>
</table>

<h2>MediaCache methods</h2>
	<table>
		<thead>
			<tr><th>method</th><th>description</th></tr>
		</thead>
		<tbody>
			<tr>
				<td><code>photo(ctx, key, source, extra?)</code></td>
				<td>send a photo, caching the <code>file_id</code> under <code>key</code></td>
			</tr>
			<tr>
				<td><code>document(ctx, key, source, extra?)</code></td>
				<td>send a document, caching its <code>file_id</code> under <code>key</code></td>
			</tr>
			<tr>
				<td><code>hook(api)</code></td>
				<td>register transparent caching hooks on the bot's API client</td>
			</tr>
		</tbody>
	</table>

<div class="note">
	<code>source</code> accepts anything <code>@yaebal/core</code>'s <code>MediaSource</code> accepts
	— <code>media.path()</code>, <code>media.url()</code>, <code>media.buffer()</code>, or a bare
	<code>file_id</code> string. <code>extra</code> is forwarded as send options (caption, parse_mode,
	etc.).
</div>
