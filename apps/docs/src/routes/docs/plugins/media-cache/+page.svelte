<script lang="ts">
	import Code from "$lib/Code.svelte";

	const install = `pnpm add @yaebal/media-cache`;

	const transparent = `import { createBot, media } from "yaebal";
import { mediaCache } from "@yaebal/media-cache";

const cache = mediaCache();
const bot = createBot(process.env.BOT_TOKEN!)
  .install(cache.plugin());

bot.command("logo", async (ctx) => {
  // first call: uploads and remembers the returned file_id
  // every call after that: sends the cached file_id — no upload
  await ctx.sendPhoto(media.path("./assets/logo.png"));
});`;

	const directApi = `// lower-level form, useful when you only have an Api instance
cache.attach(bot.api);`;

	const groups = `// each album item caches independently — re-sending the album
// uploads only what changed
await ctx.api.sendMediaGroup({
  chat_id: ctx.chat!.id,
  media: [
    { type: "photo", media: media.path("./a.png"), caption: "first" },
    { type: "video", media: media.path("./b.mp4") },
  ],
});

// editMessageMedia is covered too
await ctx.api.editMessageMedia({
  chat_id: ctx.chat!.id,
  message_id,
  media: { type: "photo", media: media.path("./a.png") },
});`;

	const manual = `// name the key yourself when it should survive the file
// moving between paths or urls
bot.command("poster", async (ctx) => {
  await cache.photo(ctx, "poster:v1", media.url("https://cdn.example/poster.png"), {
    caption: "cached under the key, not the url",
  });
});`;

	const invalidation = `await cache.invalidate(media.path("./logo.png")); // by source
await cache.invalidate("poster:v1");              // by manual key

await cache.keyFor(media.path("./logo.png"));     // "path:logo.png"
await cache.keyFor(media.buffer(bytes));          // "sha256:…"`;

	const storage = `const cache = mediaCache({
  storage: myRedisStorage, // any StorageAdapter<string> from @yaebal/sklad
  scope: "my-bot",         // keys become "my-bot:path:…" — see multi-bot note below
});`;

	const observability = `const cache = mediaCache({
  onEvent: (e) => {
    // { type: "hit" | "store", method, key, fileId }
    // { type: "evict", key, reason: "invalidated" | "rejected" }
    metrics.increment(\`media_cache_\${e.type}\`);
  },
});`;

	const testing = `import { createApi, media } from "@yaebal/core";
import { withFetch } from "@yaebal/test";

// the cache lives in api hooks, so test it over a real createApi with a
// scripted fetch — see packages/media-cache/src/index.test.ts for a template
await withFetch(scriptedFetch, async () => {
  const api = createApi("TEST", { readFile: async () => bytes });
  mediaCache().attach(api);
  await api.call("sendPhoto", { chat_id: 1, photo: media.path("./a.png") });
});`;
</script>

<svelte:head>
	<title>@yaebal/media-cache — yaebal</title>
</svelte:head>

<h1>@yaebal/media-cache</h1>
<p class="lead">
	upload a file once, send its <code>file_id</code> forever after. covers every media send —
	including <code>sendMediaGroup</code> items and <code>editMessageMedia</code> — and self-heals
	when telegram rejects a stale id.
</p>

<h2>install</h2>
<Code code={install} lang="sh" title="terminal" />

<h2>transparent mode</h2>
<p>
	install <code>cache.plugin()</code> on the bot. it registers <code>before</code>/<code
		>after</code
	>/<code>onError</code> hooks on the api client: cached sources are swapped to their
	<code>file_id</code> before the request, fresh uploads are remembered from the response. nothing
	about your handlers changes — <code>ctx.sendPhoto(media.path(…))</code> just stops re-uploading.
</p>
<Code code={transparent} title="bot.ts" />
<p>
	covered methods: <code>sendPhoto</code>, <code>sendDocument</code>, <code>sendAudio</code>,
	<code>sendVideo</code>, <code>sendAnimation</code>, <code>sendVoice</code>,
	<code>sendVideoNote</code>, <code>sendSticker</code>, plus each item of a
	<code>sendMediaGroup</code> and the media of an <code>editMessageMedia</code>.
</p>
<Code code={directApi} title="api.ts" />

<h2>what keys what</h2>
<table>
	<thead>
		<tr><th>source</th><th>cache key</th><th>note</th></tr>
	</thead>
	<tbody>
		<tr>
			<td><code>media.path("./a.png")</code></td>
			<td>the path</td>
			<td>zero extra I/O on a hit</td>
		</tr>
		<tr>
			<td><code>media.url("https://…")</code></td>
			<td>the url</td>
			<td>telegram skips re-downloading it</td>
		</tr>
		<tr>
			<td><code>media.buffer(bytes)</code></td>
			<td>sha-256 of the bytes</td>
			<td>same bytes → one upload; changed bytes → new key</td>
		</tr>
		<tr>
			<td><code>media.text("…", "a.txt")</code></td>
			<td>sha-256 of the text</td>
			<td></td>
		</tr>
		<tr>
			<td><code>media.stream(…)</code></td>
			<td>—</td>
			<td>single-shot, passes through uncached</td>
		</tr>
		<tr>
			<td><code>media.fileId("…")</code></td>
			<td>—</td>
			<td>already the cached form</td>
		</tr>
	</tbody>
</table>
<p>
	raw string params (a bare url or file_id) pass through untouched — only
	<code>media.*</code> sources are cached.
</p>

<h2>albums and edits</h2>
<Code code={groups} title="groups.ts" />

<h2>self-healing</h2>
<p>
	a cached <code>file_id</code> can go bad: storage shared with another bot (file_ids are per-bot),
	a wiped test server, a corrupt entry. when telegram answers
	<code>400 wrong file identifier</code>, the entry is evicted and the request retries with the
	original source — the caller never sees the failure. the retried attempt substitutes nothing, so
	a second failure can't loop.
</p>

<h2>manual mode</h2>
<p>
	one method per media kind — <code>photo</code>, <code>document</code>, <code>audio</code>,
	<code>video</code>, <code>animation</code>, <code>voice</code>, <code>videoNote</code>,
	<code>sticker</code> — each sending to the update's chat with the context's business/topic
	routing. manual keys live in their own <code>key:</code> namespace and never collide with
	transparent-mode keys.
</p>
<Code code={manual} title="manual.ts" />

<h2>invalidation</h2>
<Code code={invalidation} title="invalidate.ts" />
<p>
	no ttl by design: file_ids don't expire, they get <em>rejected</em> — and rejection already
	self-heals. content-keyed sources (buffers, text) also self-invalidate: new content is a new key.
</p>

<h2>storage & multi-bot</h2>
<p>
	defaults to in-memory (<code>MemoryStorage</code>, lost on restart). pass any
	<code>StorageAdapter&lt;string&gt;</code> from <code>@yaebal/sklad</code> to persist. set
	<code>scope</code> when several bots share one storage — a <code>file_id</code> only works for
	the bot that uploaded it.
</p>
<Code code={storage} title="storage.ts" />

<h2>observability</h2>
<Code code={observability} title="metrics.ts" />

<h2>api</h2>
<table>
	<thead>
		<tr><th>export</th><th>kind</th><th>description</th></tr>
	</thead>
	<tbody>
		<tr
			><td><code>mediaCache(options?)</code></td><td>function</td><td
				>creates a <code>MediaCache</code></td
			></tr
		>
		<tr
			><td><code>MediaCache</code></td><td>interface</td><td
				>the object returned by <code>mediaCache()</code></td
			></tr
		>
		<tr
			><td><code>MediaCacheOptions</code></td><td>interface</td><td
				><code>storage?</code>, <code>scope?</code>, <code>onEvent?</code></td
			></tr
		>
		<tr
			><td><code>MediaCacheEvent</code></td><td>type</td><td
				><code>hit</code> / <code>store</code> / <code>evict</code> observations</td
			></tr
		>
		<tr
			><td><code>CachedSend</code></td><td>type</td><td
				>the manual-mode sender signature</td
			></tr
		>
	</tbody>
</table>

<h2>MediaCache methods</h2>
<table>
	<thead>
		<tr><th>method</th><th>description</th></tr>
	</thead>
	<tbody>
		<tr>
			<td><code>plugin()</code></td>
			<td>installable form: <code>bot.install(cache.plugin())</code></td>
		</tr>
		<tr>
			<td><code>attach(api)</code></td>
			<td>register the caching hooks on an api client (idempotent)</td>
		</tr>
		<tr>
			<td><code>photo(ctx, key, source, extra?)</code> …</td>
			<td>manual mode — one per media kind, explicit cache key</td>
		</tr>
		<tr>
			<td><code>invalidate(source | key)</code></td>
			<td>forget one cached <code>file_id</code></td>
		</tr>
		<tr>
			<td><code>keyFor(source | key)</code></td>
			<td>the storage key a source caches under (<code>undefined</code> = uncacheable)</td>
		</tr>
	</tbody>
</table>

<h2>testing</h2>
<Code code={testing} title="cache.test.ts" />

<h2>notes</h2>
<ul>
	<li>
		two concurrent first sends of the same source both upload (no request blocks another); the
		cache converges on one file_id.
	</li>
	<li>
		<code>thumbnail</code> params are never cached — telegram doesn't allow reusing thumbnails by
		<code>file_id</code>.
	</li>
	<li>
		pairs well with <a href="/docs/plugins/again">@yaebal/again</a> — its retries re-run the cache
		hooks, so a flood-wait retry still hits the cache.
	</li>
</ul>
<p>
	see the <a href="https://github.com/neverlane/yaebal/tree/master/examples/media-studio"
		>media-studio example</a
	> for a runnable bot.
</p>
