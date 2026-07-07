<script lang="ts">
	import Code from "$lib/Code.svelte";

	const install = `pnpm add @yaebal/files`;

	const registration = `import { Bot } from "@yaebal/core";
import { files } from "@yaebal/files";

const bot = new Bot(token);
bot.install(files());`;

	const usage = `bot.on("message:photo", async (ctx) => {
  // ctx.photo is a size array — the largest size is picked automatically
  const info = await ctx.files.info(ctx.photo);       // getFile metadata, no bytes
  if ((info.file_size ?? 0) > 10 * 1024 * 1024) return ctx.reply("too big");

  await ctx.files.download(ctx.photo).toFile("./last-photo.jpg");
});`;

	const handle = `const dl = ctx.files.download(ctx.document);

await dl.info();              // File metadata (one getFile, memoized)
await dl.url();               // download URL — ⚠️ embeds the bot token by default
await dl.bytes();             // Uint8Array
await dl.text();              // utf-8 string
await dl.json<Config>();      // parsed JSON
await dl.blob();              // Blob
await dl.stream();            // ReadableStream — pipe huge files, no buffering
await dl.toFile("./a.pdf");   // save to disk, returns the path
const bytes = await dl;       // PromiseLike — awaiting yields Uint8Array`;

	const standalone = `import { createFiles } from "@yaebal/files";

const files = createFiles(bot.api);

// onStart, cron jobs, workers, scripts — no ctx required
await files.download(fileId).toFile("./backup.bin");`;

	const localServer = `bot.install(
  files({
    local: {
      dir: "/var/lib/telegram-bot-api",  // the server's working dir (default)
      mount: "/data",                    // where that volume is mounted for the bot
      baseUrl: "https://files.my.app",   // serve the dir over HTTP → token-less url()
    },
  }),
);`;

	const testing = `const env = createTestEnv(bot);
env.onApi("getFile", { file_id: "DOC", file_unique_id: "U", file_path: "documents/d.pdf" });

// byte downloads are injectable too:
bot.install(files({ fetch: myFakeFetch }));`;
</script>

<svelte:head>
	<title>@yaebal/files — yaebal</title>
</svelte:head>

<h1>@yaebal/files</h1>
<p class="lead">inspect, link, stream and download telegram files. adds <code>ctx.files</code> with three entry points — <code>info</code>, <code>url</code> and a lazy <code>download()</code> handle with <code>Response</code>-style readers — plus <code>createFiles(api)</code> for use outside middleware. understands self-hosted Bot API servers (<code>--local</code>).</p>

<h2>install</h2>
<Code code={install} title="terminal" lang="sh" />

<h2>registration</h2>
<p>call <code>bot.install(files())</code> once. the plugin adds <code>ctx.files</code> to every subsequent handler in the chain. the control is built once per api client — per-update cost is a single property.</p>
<Code code={registration} title="bot.ts" />

<h2>usage</h2>
<p><code>info</code> / <code>url</code> / <code>download</code> accept a <code>file_id</code> string, any api object with a <code>file_id</code> (<code>Document</code>, <code>Audio</code>, <code>Voice</code>, <code>Sticker</code>, …) or a <code>PhotoSize[]</code> array — the largest size wins.</p>
<Code code={usage} title="download-photo.ts" />

<h2>the download handle</h2>
<p><code>download()</code> returns a lazy <code>FileDownload</code>: nothing is fetched until you read from it. <code>info()</code> costs one <code>getFile</code> (memoized); the body readers additionally fetch the bytes. like a <code>Response</code>, the body is single-use — read it once, call <code>download()</code> again for another pass. <code>info()</code>, <code>url()</code> and disk-sourced <code>toFile()</code> don't consume it.</p>
<Code code={handle} title="handle.ts" />

<h2>outside middleware</h2>
<Code code={standalone} title="standalone.ts" />

<h2>self-hosted bot api server</h2>
<p>with <code>--local</code> the server reports absolute disk paths instead of CDN paths. strategy is picked per file (<code>source: "auto"</code>): relative path → classic URL; absolute path → <code>baseUrl</code> rewrite when configured, else a direct disk read (copy-on-disk <code>toFile</code>, zero transfer). force one with <code>source: "url" | "disk" | "rewrite"</code>, or pass a function <code>(file) =&gt; Promise&lt;Uint8Array&gt;</code>.</p>
<Code code={localServer} title="local-server.ts" />

<h2>api</h2>
<table>
	<thead>
		<tr><th>export</th><th>kind</th><th>description</th></tr>
	</thead>
	<tbody>
		<tr>
			<td><code>files</code></td>
			<td>function</td>
			<td><code>(options?: FilesOptions) =&gt; Plugin</code> — returns the plugin.</td>
		</tr>
		<tr>
			<td><code>createFiles</code></td>
			<td>function</td>
			<td><code>(api, options?) =&gt; FilesControl</code> — the same control without middleware.</td>
		</tr>
		<tr>
			<td><code>FilesControl</code></td>
			<td>interface</td>
			<td>the type of <code>ctx.files</code>: <code>info</code> / <code>url</code> / <code>download</code>.</td>
		</tr>
		<tr>
			<td><code>FileDownload</code></td>
			<td>class</td>
			<td>the lazy handle: <code>info</code>, <code>url</code>, <code>arrayBuffer</code>, <code>bytes</code>, <code>blob</code>, <code>text</code>, <code>json</code>, <code>stream</code>, <code>toFile</code>; <code>PromiseLike&lt;Uint8Array&gt;</code>.</td>
		</tr>
		<tr>
			<td><code>FilesError</code></td>
			<td>class</td>
			<td>every failure, with a machine-readable <code>reason</code>: <code>"bad-input"</code>, <code>"no-file-path"</code>, <code>"download-failed"</code> (carries <code>status</code>), <code>"no-url"</code>, <code>"no-filesystem"</code>, <code>"config"</code>.</td>
		</tr>
		<tr>
			<td><code>resolveFileId</code></td>
			<td>function</td>
			<td>collapse a <code>FileInput</code> (string / object / size array) to its <code>file_id</code>.</td>
		</tr>
		<tr>
			<td><code>FileInput</code>, <code>FilesOptions</code>, <code>FileSource</code>, <code>FileCallOptions</code></td>
			<td>types</td>
			<td>inputs, plugin options, strategy union, per-call options (<code>signal</code>).</td>
		</tr>
	</tbody>
</table>

<h2>options</h2>
<table>
	<thead>
		<tr><th>option</th><th>default</th><th>what it does</th></tr>
	</thead>
	<tbody>
		<tr><td><code>source</code></td><td><code>"auto"</code></td><td>byte-fetching strategy: <code>"auto"</code> / <code>"url"</code> / <code>"disk"</code> / <code>"rewrite"</code> / custom function.</td></tr>
		<tr><td><code>local.dir</code></td><td><code>/var/lib/telegram-bot-api</code></td><td>server working dir — the prefix of absolute <code>file_path</code>s it reports.</td></tr>
		<tr><td><code>local.mount</code></td><td>= <code>dir</code></td><td>bot-side mount point of the shared volume (<code>dir</code> → <code>mount</code> remap before disk reads).</td></tr>
		<tr><td><code>local.baseUrl</code></td><td>—</td><td>public URL of the working dir — enables token-less links and <code>"rewrite"</code>.</td></tr>
		<tr><td><code>fetch</code></td><td><code>globalThis.fetch</code></td><td>fetch override for byte downloads (proxy, instrumentation, tests).</td></tr>
	</tbody>
</table>
<p>per call: <code>ctx.files.download(file, {'{'} signal {'}'})</code> — the <code>AbortSignal</code> reaches both <code>getFile</code> and the byte fetch.</p>

<h2>production notes</h2>
<ul>
	<li>the classic download URL <strong>embeds the bot token</strong> — don't show it to users or log it. configure <code>local.baseUrl</code> for token-less links.</li>
	<li>the hosted Bot API caps <code>getFile</code> downloads at <strong>20 MB</strong>; a local server lifts that to 2 GB.</li>
	<li>byte downloads go straight through <code>fetch</code>, not through <code>api</code> hooks — <a href="/docs/plugins/again">@yaebal/again</a> retries the <code>getFile</code> call, not the transfer itself.</li>
	<li>prefer <code>stream()</code> / <code>toFile()</code> over <code>bytes()</code> for large files — the buffered readers hold the whole file in memory.</li>
</ul>

<h2>testing</h2>
<p>stub <code>getFile</code> with <code>@yaebal/test</code>; inject <code>fetch</code> for the byte transfer.</p>
<Code code={testing} title="files.test.ts" />

<h2>related</h2>
<ul>
	<li><a href="/docs/media">media &amp; files guide</a> — uploading with the core <code>media.*</code> sources.</li>
	<li><a href="/docs/plugins/file-id">@yaebal/file-id</a> — look <em>inside</em> a <code>file_id</code>: datacenter, access hash, dedupe key.</li>
	<li><a href="/docs/plugins/media-cache">@yaebal/media-cache</a> — reuse a <code>file_id</code> instead of re-uploading.</li>
</ul>
