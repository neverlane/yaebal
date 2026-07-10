<script lang="ts">
	import Code from "$lib/Code.svelte";
	import Try from "$lib/Try.svelte";

	const install = `pnpm add @yaebal/cache`;

	const wrapChat = `bot.command("whoami", async (ctx) => {
  const chat = await ctx.cache.wrap(\`chat:\${ctx.chat.id}\`, () => ctx.api.getChat(ctx.chat.id));
  await ctx.reply(chat.title ?? "private chat");
});`;

	const options = `import { cache } from "@yaebal/cache";
import { redisStorage } from "@yaebal/sklad";

bot.install(
  cache({
    storage: redisStorage(client), // defaults to MemoryStorage (in-memory, lost on restart)
    ttl: 60_000, // default ttl in ms; omit for "never expires"
    scope: "bot-1", // key namespace — set when several bots share one persistent storage
    onEvent: (event) => metrics.count(event.type), // hit / miss / store / expire / delete
  }),
);`;

	const standalone = `import { cache, createCache } from "@yaebal/cache";

const apiCache = cache({ ttl: 60_000 });
const bot = createBot(token).install(apiCache);

// outside a handler — bot.onStart, a webhook route, ...
await apiCache.handle.set("feature-flags", flags, 5 * 60_000);

// or build the client first and install that exact instance
const client = createCache({ ttl: 60_000 });
bot.install(cache(client));`;

	const dedup = `// two updates racing the same cold key — fetchChat only runs once
const [a, b] = await Promise.all([
  ctx.cache.wrap("chat:1", fetchChat),
  ctx.cache.wrap("chat:1", fetchChat),
]);`;

	const testing = `import { createTestEnv } from "@yaebal/test";
import { cache } from "@yaebal/cache";

let calls = 0;
const bot = new Composer<Context>()
  .install(cache())
  .command("info", async (ctx) => {
    const info = await ctx.cache.wrap("chat-info", async () => {
      calls++;
      return "info";
    });
    return ctx.reply(info);
  });

const env = createTestEnv(bot);
await env.createUser().sendCommand("info");
await env.createUser().sendCommand("info");
// calls === 1 — the second update hit the cache`;
</script>

<svelte:head>
	<title>@yaebal/cache — yaebal</title>
</svelte:head>

<h1>@yaebal/cache</h1>
<p class="lead">
	ttl memoization for api calls and arbitrary data: <code>ctx.cache.get/set/wrap</code>. built on
	<a href="/docs/plugins/sklad/"><code>@yaebal/sklad</code></a>, so it takes the same storage
	adapters (memory, redis, sqlite, cloudflare kv, json-file) as <code>session</code>/<code
	>scenes</code>. concurrent misses for the same key share one in-flight call, so a burst of
	updates hitting <code>getChat</code>/<code>getChatMember</code> at once never turns into a burst
	of duplicate requests.
</p>

<h2>install</h2>
<Code code={install} title="terminal" lang="sh" />

<h2>usage</h2>
<p>
	install <code>cache()</code> with <code>bot.install()</code>. it adds <code>ctx.cache</code> to
	every handler's context. <code>wrap</code> is read-through: a hit returns the cached value; a
	miss calls the function, caches its result, and returns it. a rejected call is never cached.
</p>
<Try id="cache-wrap" title="bot.ts" />
<Code code={wrapChat} title="bot.ts" />

<h2>options</h2>
<p>
	ttl is enforced by <code>@yaebal/cache</code> itself — each entry carries its own expiry — not
	by the storage adapter, so per-call <code>ttl</code> overrides behave the same on every adapter,
	including ones whose native ttl is fixed at construction time (<code>redisStorage</code>/<code
	>sqliteStorage</code>).
</p>
<Code code={options} title="bot.ts" />

<h2>standalone use</h2>
<p>
	<code>cache()</code> returns the installable plugin itself, with the underlying client on
	<code>.handle</code> — read or pre-warm it outside a handler (<code>bot.onStart</code>, a
	webhook route, …). pass an already-built <code>Cache</code> to <code>cache()</code> to install
	that exact instance instead of building a new one.
</p>
<Code code={standalone} title="standalone.ts" />

<h2>dedup</h2>
<p>
	<code>wrap</code> tracks in-flight calls per key. if two updates call
	<code>wrap("chat:1", fetchChat)</code> before either finishes, the second one awaits the
	first's promise instead of calling <code>fetchChat</code> again.
</p>
<Code code={dedup} title="dedup.ts" />

<h2>api</h2>
<table>
	<thead>
		<tr><th>export</th><th>signature</th><th>description</th></tr>
	</thead>
	<tbody>
		<tr>
			<td><code>cache</code></td>
			<td><code>(source?: CacheOptions | Cache) =&gt; CachePlugin</code></td>
			<td>installs <code>ctx.cache</code>; the returned function also carries <code>.handle</code></td>
		</tr>
		<tr>
			<td><code>createCache</code></td>
			<td><code>(options?: CacheOptions) =&gt; Cache</code></td>
			<td>standalone client, independent of any bot or <code>ctx</code></td>
		</tr>
	</tbody>
</table>

<h3>CacheControl interface (ctx.cache and the standalone client)</h3>
<table>
	<thead>
		<tr><th>method</th><th>returns</th><th>description</th></tr>
	</thead>
	<tbody>
		<tr><td><code>get&lt;T&gt;(key)</code></td><td><code>Promise&lt;T | undefined&gt;</code></td><td>cached value, or <code>undefined</code> on a miss / expired entry</td></tr>
		<tr><td><code>set&lt;T&gt;(key, value, ttl?)</code></td><td><code>Promise&lt;void&gt;</code></td><td>write a value; <code>ttl</code> (ms) overrides the cache's default</td></tr>
		<tr><td><code>delete(key)</code></td><td><code>Promise&lt;void&gt;</code></td><td>drop one entry</td></tr>
		<tr><td><code>has(key)</code></td><td><code>Promise&lt;boolean&gt;</code></td><td>whether a live entry exists, without reading it</td></tr>
		<tr><td><code>wrap&lt;T&gt;(key, fn, ttl?)</code></td><td><code>Promise&lt;T&gt;</code></td><td>cached value, or call <code>fn</code>, cache and return its result — dedupes concurrent misses</td></tr>
	</tbody>
</table>

<h3>CacheOptions</h3>
<table>
	<thead>
		<tr><th>field</th><th>type</th><th>default</th><th>description</th></tr>
	</thead>
	<tbody>
		<tr><td><code>storage</code></td><td><code>StorageAdapter&lt;CacheEntry&gt;</code></td><td><code>MemoryStorage</code></td><td>where entries live — any <code>@yaebal/sklad</code> adapter</td></tr>
		<tr><td><code>ttl</code></td><td><code>number</code></td><td>—</td><td>default ttl in ms for entries that don't pass their own; omit for "never expires"</td></tr>
		<tr><td><code>scope</code></td><td><code>string</code></td><td>—</td><td>key namespace — set when several bots share one persistent storage</td></tr>
		<tr><td><code>now</code></td><td><code>() =&gt; number</code></td><td><code>Date.now</code></td><td>clock override, mainly for tests</td></tr>
		<tr><td><code>onEvent</code></td><td><code>(event: CacheEvent) =&gt; unknown</code></td><td>—</td><td>observe hits / misses / stores / expirations / deletes</td></tr>
	</tbody>
</table>

<h2>testing</h2>
<p>
	<code>@yaebal/cache</code> doesn't touch <code>ctx</code> beyond the decorated object, so drive
	it with <a href="/docs/plugins/test/"><code>@yaebal/test</code></a> as usual and assert on how
	many times your wrapped function actually ran.
</p>
<Code code={testing} title="cache.test.ts" />

<div class="note">
	<strong>pairs with sklad.</strong> swap <code>MemoryStorage</code> for
	<a href="/docs/plugins/sklad/"><code>redisStorage</code></a>/<code>sqliteStorage</code> to share
	a cache across processes or survive restarts — <code>@yaebal/cache</code> layers ttl and dedup
	on top, so the same options work no matter which adapter is behind it.
</div>
