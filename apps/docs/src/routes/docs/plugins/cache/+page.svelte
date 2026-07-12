<script lang="ts">
	import Code from "$lib/Code.svelte";
	import Try from "$lib/Try.svelte";

	const install = `pnpm add @yaebal/cache`;

	const wrapChat = `bot.command("whoami", async (ctx) => {
  const chat = await ctx.cache.wrap(\`chat:\${ctx.chat.id}\`, () => ctx.getChat());
  await ctx.reply(chat.title ?? "private chat");
});`;

	const options = `import { cache } from "@yaebal/cache";
import { redisStorage } from "@yaebal/sklad";

bot.install(
  cache({
    storage: redisStorage(client), // defaults to a bounded MemoryStorage — see "memory" below
    ttl: 60_000, // default ttl in ms; omit for "never expires"
    scope: "bot-1", // key namespace — set when several bots share one persistent storage
    sliding: false, // default for \`sliding\` on set/wrap calls that don't pass their own
    max: 1000, // LRU cap on the default in-memory store; ignored when \`storage\` is given
    sweepIntervalMs: 60_000, // active ttl sweep for the default store; \`false\` disables it
    onEvent: (event) => metrics.count(event.type), // hit / miss / store / stale / dedupe / …
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

	const swr = `// serves the stale forecast immediately once ttl elapses, refreshing it in the
// background — callers never pay the fetch latency, only the first "expiry" tick does
const forecast = await ctx.cache.wrap("weather:london", fetchWeather, {
  ttl: 60_000,
  staleTtl: 300_000, // stay servable-stale for up to 5 more minutes while it refreshes
});`;

	const sliding = `// "expires 5 minutes after the *last* read", not 5 minutes after the write
await ctx.cache.set(\`session:\${userId}\`, data, { ttl: 300_000, sliding: true });`;

	const negative = `// a burst of updates hitting a dead upstream all get the remembered rejection
// instead of retrying it themselves
const chat = await ctx.cache.wrap("chat:1", fetchChat, { errorTtl: 10_000 });`;

	const invalidation = `await ctx.cache.invalidatePrefix("chat:"); // drop every "chat:*" key
await ctx.cache.clear(); // drop everything under this cache's scope`;

	const batch = `await ctx.cache.setMany([
  { key: "a", value: 1 },
  { key: "b", value: 2, ttl: 10_000 },
]);
const values = await ctx.cache.getMany(["a", "b", "missing"]); // Map<string, T> — only live keys`;

	const namespaces = `const chatCache = ctx.cache.forChat(ctx.chat.id); // sugar for namespace(\`chat:\${id}:\`)
await chatCache.set("info", chat); // physically "chat:<id>:info"
await chatCache.clear(); // drops only this chat's entries`;

	const typedCatalog = `interface Schema {
  flags: { newUi: boolean };
  [key: \`chat:\${number}\`]: ChatFullInfo;
}

const c = createCache<Schema>();
await c.get("chat:1"); // Promise<ChatFullInfo | undefined>
await c.set("chat:1", "nope"); // ✗ type error — value must be ChatFullInfo
await c.get("anything"); // Promise<unknown | undefined> — keys outside the catalog stay free-form

// or typed straight on the bot:
bot.install(cache<Schema>({ ttl: 60_000 }));`;

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
	ttl memoization for api calls and arbitrary data: <code>ctx.cache.get/set/wrap</code>, plus
	stale-while-revalidate, sliding expiry, negative caching, prefix invalidation, batching,
	namespaces, and an optional typed key catalog. built on
	<a href="/docs/plugins/sklad/"><code>@yaebal/sklad</code></a>, so it takes the same storage
	adapters (memory, redis, sqlite, cloudflare kv, json-file) as <code>session</code>/<code
		>scenes</code
	>. concurrent misses for the same key share one in-flight call, so a burst of updates hitting
	<code>getChat</code>/<code>getChatMember</code> at once never turns into a burst of duplicate
	requests.
</p>

<h2>install</h2>
<Code code={install} title="terminal" lang="sh" />

<h2>usage</h2>
<p>
	install <code>cache()</code> with <code>bot.install()</code>. it adds <code>ctx.cache</code> to
	every handler's context. <code>wrap</code> is read-through: a hit returns the cached value; a
	miss calls the function, caches its result, and returns it. a rejected call is never cached,
	unless you opt into <a href="#negative-caching">negative caching</a>.
</p>
<Try id="cache-wrap" title="bot.ts" />
<Code code={wrapChat} title="bot.ts" />

<h2>options</h2>
<p>
	ttl is enforced by <code>@yaebal/cache</code> itself — each entry carries its own expiry — not
	by the storage adapter, so per-call <code>ttl</code> overrides behave the same on every adapter,
	including ones whose native ttl is fixed at construction time (<code>redisStorage</code>/<code
		>sqliteStorage</code
	>). a non-finite or non-positive <code>ttl</code> throws a <code>RangeError</code> — it never
	means "expires now" or "never expires" by accident.
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

<h2 id="stale-while-revalidate">stale-while-revalidate</h2>
<p>
	<code>staleTtl</code> keeps serving a value after <code>ttl</code> elapses, while one background
	call to <code>fn</code> refreshes it — every caller in the stale window gets the old value
	immediately, with no fetch latency. only the first caller in the window triggers the refresh; a
	failed background refresh never surfaces to the caller (it already has a value) — it's reported
	via <code>onEvent</code>'s <code>"error"</code> event, and the stale entry is left in place for
	the next call to retry.
</p>
<Code code={swr} title="bot.ts" />

<h2>sliding expiry</h2>
<p>
	<code>sliding: true</code> refreshes an entry's ttl on every hit instead of a fixed absolute
	expiry. works with <code>set</code> and <code>wrap</code>, per-call or as
	<code>CacheOptions.sliding</code>'s default. requires a resolvable ttl (per-call or
	<code>CacheOptions.ttl</code>) — sliding a "never expires" entry throws a
	<code>RangeError</code> instead of silently doing nothing.
</p>
<Code code={sliding} title="bot.ts" />

<h2 id="negative-caching">negative caching</h2>
<p>
	<code>errorTtl</code> remembers a rejection and re-throws it for that long instead of calling
	<code>fn</code> again. the tombstone is invisible to <code>get</code>/<code>peek</code>/<code
		>has</code
	> — they report a miss, not the error; <code>onEvent</code> reports <code>"negative-hit"</code>
	when a call hits it. omit <code>errorTtl</code> (the default) for the pre-1.0 behavior: a
	rejection is never cached.
</p>
<Code code={negative} title="bot.ts" />

<h2>invalidation</h2>
<p>
	both need the underlying storage adapter to enumerate its keys — <code>MemoryStorage</code>,
	<code>sqliteStorage</code>, and <code>fileStorage</code> always can;
	<code>redisStorage</code>/<code>kvStorage</code> can when their client exposes
	<code>KEYS</code>/<code>list()</code>. an adapter that can't throws a clear error instead of
	silently no-opping.
</p>
<Code code={invalidation} title="bot.ts" />

<h2>batch</h2>
<Code code={batch} title="bot.ts" />

<h2>namespaces</h2>
<p>
	<code>namespace(prefix)</code> returns a view over the same cache with every key prefixed —
	reads, writes, and <code>clear()</code>/<code>invalidatePrefix()</code> all stay within it.
	<code>forChat(chatId)</code> is sugar for the dominant real-world key pattern. namespaces nest
	and compose with <code>CacheOptions.scope</code>.
</p>
<Code code={namespaces} title="bot.ts" />

<h2>typed key catalog</h2>
<p>
	pass a schema to <code>createCache</code>/<code>cache</code> for <code>get</code>/<code
		>set</code
	>/<code>wrap</code>/<code>peek</code>/<code>getMany</code> inferring the value type from the
	key — template-literal key patterns included. entirely a compile-time contract: there's no
	catalog object to pass at runtime, unlike
	<a href="/docs/plugins/feature-flags/"><code>@yaebal/feature-flags</code></a>'
	<code>flags</code>.
</p>
<Code code={typedCatalog} title="bot.ts" />

<h2>events</h2>
<p>
	<code>onEvent</code> observes every operation. a throwing observer is caught and logged; it never
	fails the cache call that triggered it. every event carries both <code>key</code> (the logical
	key you passed in) and <code>scopedKey</code> (<code>key</code> prefixed by
	<code>CacheOptions.scope</code>, if any).
</p>
<table>
	<thead>
		<tr><th>event</th><th>when</th></tr>
	</thead>
	<tbody>
		<tr><td><code>hit</code></td><td><code>get</code>/<code>peek</code>/<code>has</code>/<code>wrap</code> found a fresh value</td></tr>
		<tr><td><code>miss</code></td><td>nothing live was cached for the key</td></tr>
		<tr><td><code>stale</code></td><td>a <code>wrap</code> call served a stale value</td></tr>
		<tr><td><code>revalidate</code></td><td>a background stale refresh wrote a fresh value</td></tr>
		<tr><td><code>dedupe</code></td><td>a call caught a fetch or revalidation already in flight</td></tr>
		<tr><td><code>negative-hit</code></td><td>a call hit an <code>errorTtl</code> tombstone</td></tr>
		<tr><td><code>store</code></td><td>a value was written (includes the effective <code>ttl</code>)</td></tr>
		<tr><td><code>expire</code></td><td>an expired entry was dropped (lazily, or by the active sweep)</td></tr>
		<tr><td><code>delete</code></td><td>an entry was removed, via <code>delete</code>/<code>clear</code>/<code>invalidatePrefix</code></td></tr>
		<tr><td><code>error</code></td><td>a background stale revalidation's <code>fn</code> rejected</td></tr>
	</tbody>
</table>

<h2>memory</h2>
<p>
	the default <code>MemoryStorage</code> is LRU-capped at <code>max</code> entries (<code
		>1000</code
	> by default) and actively swept every <code>sweepIntervalMs</code> (<code>60_000</code> by
	default) — both close the leak you'd otherwise get from an unbounded key pattern like
	<code>chat:&lbrace;id&rbrace;</code> across a large audience, where most keys are written once and
	never read again to trigger lazy eviction. pass your own <code>storage</code> and you own its
	lifecycle — <code>max</code> is ignored, and the sweep is off unless you set
	<code>sweepIntervalMs</code> explicitly. call <code>.dispose()</code> on the cache to stop an
	active sweep, e.g. in a test or a serverless handler that shouldn't keep the process alive.
</p>

<h2>api</h2>
<table>
	<thead>
		<tr><th>export</th><th>signature</th><th>description</th></tr>
	</thead>
	<tbody>
		<tr>
			<td><code>cache</code></td>
			<td><code>&lt;S&gt;(source?: CacheOptions | Cache&lt;S&gt;) =&gt; CachePlugin&lt;S&gt;</code></td>
			<td>installs <code>ctx.cache</code>; the returned function also carries <code>.handle</code></td>
		</tr>
		<tr>
			<td><code>createCache</code></td>
			<td><code>&lt;S&gt;(options?: CacheOptions) =&gt; Cache&lt;S&gt;</code></td>
			<td>standalone client, independent of any bot or <code>ctx</code>; <code>S</code> is the optional typed key catalog</td>
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
		<tr><td><code>peek&lt;T&gt;(key)</code></td><td><code>Promise&lt;&lbrace; value: T &rbrace; | undefined&gt;</code></td><td>like <code>get</code>, but distinguishes a cached <code>undefined</code> from a miss</td></tr>
		<tr><td><code>set&lt;T&gt;(key, value, ttl?)</code></td><td><code>Promise&lt;void&gt;</code></td><td>write a value; <code>ttl</code> is a number or <code>&lbrace; ttl, sliding &rbrace;</code></td></tr>
		<tr><td><code>delete(key)</code></td><td><code>Promise&lt;void&gt;</code></td><td>drop one entry</td></tr>
		<tr><td><code>has(key)</code></td><td><code>Promise&lt;boolean&gt;</code></td><td>whether a live entry exists, without reading it</td></tr>
		<tr><td><code>wrap&lt;T&gt;(key, fn, options?)</code></td><td><code>Promise&lt;T&gt;</code></td><td>cached value, or call <code>fn</code>; <code>options</code> is a ttl number or <code>&lbrace; ttl, staleTtl, errorTtl, sliding &rbrace;</code> — dedupes concurrent misses</td></tr>
		<tr><td><code>getMany(keys)</code></td><td><code>Promise&lt;Map&lt;string, T&gt;&gt;</code></td><td>batched <code>get</code> — only live keys are in the result</td></tr>
		<tr><td><code>setMany(entries)</code></td><td><code>Promise&lt;void&gt;</code></td><td>batched <code>set</code>, run concurrently</td></tr>
		<tr><td><code>clear()</code></td><td><code>Promise&lt;void&gt;</code></td><td>drop every entry under this cache's <code>scope</code></td></tr>
		<tr><td><code>invalidatePrefix(prefix)</code></td><td><code>Promise&lt;void&gt;</code></td><td>drop every key starting with <code>prefix</code></td></tr>
		<tr><td><code>namespace(prefix)</code></td><td><code>CacheControl</code></td><td>a view over this cache with every key prefixed</td></tr>
		<tr><td><code>forChat(chatId)</code></td><td><code>CacheControl</code></td><td>sugar for <code>namespace(</code>chat:&lt;id&gt;:<code>)</code></td></tr>
	</tbody>
</table>

<h3>CacheOptions</h3>
<table>
	<thead>
		<tr><th>field</th><th>type</th><th>default</th><th>description</th></tr>
	</thead>
	<tbody>
		<tr><td><code>storage</code></td><td><code>StorageAdapter&lt;unknown&gt;</code></td><td>bounded <code>MemoryStorage</code></td><td>where entries live — any <code>@yaebal/sklad</code> adapter</td></tr>
		<tr><td><code>ttl</code></td><td><code>number</code></td><td>—</td><td>default ttl in ms for entries that don't pass their own; omit for "never expires"</td></tr>
		<tr><td><code>scope</code></td><td><code>string</code></td><td>—</td><td>key namespace — set when several bots share one persistent storage</td></tr>
		<tr><td><code>sliding</code></td><td><code>boolean</code></td><td><code>false</code></td><td>default for <code>sliding</code> on calls that don't pass their own</td></tr>
		<tr><td><code>max</code></td><td><code>number</code></td><td><code>1000</code></td><td>LRU cap on the default in-memory store; ignored when <code>storage</code> is given</td></tr>
		<tr><td><code>sweepIntervalMs</code></td><td><code>number | false</code></td><td><code>60_000</code></td><td>active ttl sweep for the default store; <code>false</code> disables it</td></tr>
		<tr><td><code>now</code></td><td><code>() =&gt; number</code></td><td><code>Date.now</code></td><td>clock override, mainly for tests</td></tr>
		<tr><td><code>onEvent</code></td><td><code>(event: CacheEvent) =&gt; unknown</code></td><td>—</td><td>observe hits / misses / stores / stale / dedupe / etc.</td></tr>
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
	a cache across processes or survive restarts — <code>@yaebal/cache</code> layers ttl, dedup,
	stale-while-revalidate, and invalidation on top, so the same options work no matter which
	adapter is behind it.
</div>
