# @yaebal/cache

ttl memoization for api calls and arbitrary data — `ctx.cache.get/set/wrap`, plus
stale-while-revalidate, sliding expiry, negative caching, prefix invalidation, batching,
namespaces, and an optional typed key catalog. built on
[`@yaebal/sklad`](https://github.com/neverlane/yaebal/tree/main/packages/sklad), so it takes the
same storage adapters (memory, redis, sqlite, cloudflare kv, json-file) as `session`/`scenes`.
concurrent misses for the same key share one in-flight call, so a burst of updates hitting
`getChat`/`getChatMember` at once never turns into a burst of duplicate requests.

## install

```sh
pnpm add @yaebal/cache
```

## usage

```ts
import { cache } from "@yaebal/cache";

const bot = createBot(token).install(cache({ ttl: 60_000 })); // default: 60s, in-memory

bot.command("whoami", async (ctx) => {
	const chat = await ctx.cache.wrap(`chat:${ctx.chat.id}`, () => ctx.getChat());
	await ctx.reply(chat.title ?? "private chat");
});
```

`wrap` is read-through: a hit returns the cached value; a miss calls the function, caches its
result, and returns it. a rejected call is never cached, unless you opt into
[negative caching](#negative-caching).

## standalone use

`cache()` returns the installable plugin itself, with the underlying client on `.handle` — read
or pre-warm it outside a handler (`bot.onStart`, a webhook route, …):

```ts
const apiCache = cache({ ttl: 60_000 });
const bot = createBot(token).install(apiCache);

await apiCache.handle.set("feature-flags", flags, 5 * 60_000);
```

or build the client first and install that instance:

```ts
import { cache, createCache } from "@yaebal/cache";

const client = createCache({ ttl: 60_000 });
const bot = createBot(token).install(cache(client));
```

## api

- `get<T>(key)` / `peek<T>(key)` — cached value, or `undefined` on a miss / expired entry. `get`
  returns the value directly; `peek` returns `{ value }`, so a genuinely cached `undefined`/`null`
  is distinguishable from a miss.
- `set<T>(key, value, ttl?)` — write a value; `ttl` (ms, or a `{ ttl, sliding }` object) overrides
  the cache's default.
- `delete(key)` — drop one entry. `has(key)` — whether a live entry exists, without reading it.
- `wrap<T>(key, fn, options?)` — cached value, or call `fn`, cache and return its result. `options`
  is a ttl number or `{ ttl, staleTtl, errorTtl, sliding }` — see below.
- `getMany(keys)` / `setMany(entries)` — batched reads/writes.
- `clear()` / `invalidatePrefix(prefix)` — bulk invalidation.
- `namespace(prefix)` / `forChat(chatId)` — a prefixed view over the same cache.

ttl is enforced by `@yaebal/cache` itself (each entry carries its own expiry), not by the storage
adapter — so per-call `ttl` overrides work the same on every adapter, including ones whose native
ttl is fixed at construction time (like `redisStorage`/`sqliteStorage`). a non-finite or
non-positive `ttl` throws a `RangeError` — it never means "expires now" or "never expires" by
accident.

## options

```ts
cache({
	storage: redisStorage(client), // defaults to a bounded MemoryStorage — see "memory" below
	ttl: 60_000, // default ttl in ms; omit for "never expires"
	scope: "bot-1", // key namespace — set when several bots share one persistent storage
	sliding: false, // default for `sliding` on set/wrap calls that don't pass their own
	max: 1000, // LRU cap on the default in-memory store; ignored when `storage` is given
	sweepIntervalMs: 60_000, // active ttl sweep for the default store; `false` disables it
	onEvent: (event) => metrics.count(event.type), // see "events" below
});
```

## dedup

`wrap` tracks in-flight calls per key. if two updates call `wrap("chat:1", fetchChat)` before
either finishes, the second one awaits the first's promise instead of calling `fetchChat` again —
useful for `getChat`/`getChatMember`-style lookups that many concurrent updates ask for at once.

## stale-while-revalidate

`staleTtl` keeps serving a value after `ttl` elapses, while one background call to `fn` refreshes
it — every caller in the stale window gets the old value immediately, with no fetch latency:

```ts
const forecast = await ctx.cache.wrap("weather:london", fetchWeather, { ttl: 60_000, staleTtl: 300_000 });
```

fresh (< `ttl`): return the cached value. stale (between `ttl` and `ttl + staleTtl`): return the
cached value immediately, and refresh it in the background — only the first caller in the window
triggers the refresh; the rest just get the stale value. past `ttl + staleTtl`: a normal miss —
`wrap` awaits `fn` like usual. a failed background refresh never surfaces to the caller (it
already has a value) — it's reported via `onEvent`'s `"error"` event, and the stale entry is left
in place for the next call to retry.

## sliding expiry

`sliding: true` refreshes an entry's ttl on every hit instead of a fixed absolute expiry — "expire
60s after the *last* read", not "60s after the write":

```ts
await ctx.cache.set(`session:${userId}`, data, { ttl: 300_000, sliding: true });
```

works with `set` and `wrap`, per-call or as `CacheOptions.sliding`'s default. requires a
resolvable ttl (per-call or `CacheOptions.ttl`) — sliding a `never expires` entry doesn't mean
anything, and throws a `RangeError` instead of silently doing nothing.

## negative caching

`errorTtl` remembers a rejection and re-throws it for that long instead of calling `fn` again —
useful when a burst of updates would otherwise all retry the same dead upstream:

```ts
const chat = await ctx.cache.wrap("chat:1", fetchChat, { errorTtl: 10_000 });
```

the tombstone is invisible to `get`/`peek`/`has` — they report a miss, not the error (`get`/`peek`
can't throw; only `wrap`, which already has a natural rejection path, re-throws). `onEvent` reports
`"negative-hit"` when a call hits the tombstone. omit `errorTtl` (the default) for the pre-1.0
behavior: a rejection is never cached.

## invalidation

```ts
await ctx.cache.invalidatePrefix("chat:"); // drop every "chat:*" key
await ctx.cache.clear(); // drop everything under this cache's scope
```

both need the underlying storage adapter to enumerate its keys — `MemoryStorage`, `sqliteStorage`,
and `fileStorage` always can; `redisStorage`/`kvStorage` can when their client exposes
`KEYS`/`list()`. an adapter that can't throws a clear error instead of silently no-opping.

## batch

```ts
await ctx.cache.setMany([
	{ key: "a", value: 1 },
	{ key: "b", value: 2, ttl: 10_000 },
]);
const values = await ctx.cache.getMany(["a", "b", "missing"]); // Map<string, T> — only live keys
```

## namespaces

`namespace(prefix)` returns a view over the same cache with every key prefixed — reads, writes,
and `clear()`/`invalidatePrefix()` all stay within it. `forChat(chatId)` is sugar for
`` namespace(`chat:${chatId}:`) ``, the dominant real-world key pattern:

```ts
const chatCache = ctx.cache.forChat(ctx.chat.id);
await chatCache.set("info", chat); // physically "chat:<id>:info"
await chatCache.clear(); // drops only this chat's entries
```

namespaces nest (`ns("a:").namespace("b:")` → `"a:b:"`) and compose with `CacheOptions.scope`.

## typed key catalog

pass a schema to `createCache`/`cache` for `get`/`set`/`wrap`/`peek`/`getMany` inferring the value
type from the key — template-literal key patterns included:

```ts
interface Schema {
	flags: { newUi: boolean };
	[key: `chat:${number}`]: ChatFullInfo;
}

const c = createCache<Schema>();
await c.get("chat:1"); // Promise<ChatFullInfo | undefined>
await c.set("chat:1", "nope"); // ✗ type error — value must be ChatFullInfo
await c.get("anything"); // Promise<unknown | undefined> — keys outside the catalog stay free-form
```

entirely a compile-time contract — there's no catalog object to pass at runtime, unlike
`@yaebal/feature-flags`' `flags`. `bot.install(cache<Schema>({ ttl: 60_000 }))` types `ctx.cache`
the same way.

## events

`onEvent` observes every operation — hits, misses, stores, expirations, deletes, and more. a
throwing observer is caught and logged; it never fails the cache call that triggered it.

| event | when |
|:--|:--|
| `hit` | `get`/`peek`/`has`/`wrap` found a fresh value |
| `miss` | nothing live was cached for the key |
| `stale` | a `wrap` call served a stale value (see [stale-while-revalidate](#stale-while-revalidate)) |
| `revalidate` | a background stale refresh wrote a fresh value |
| `dedupe` | a call caught a fetch or revalidation already in flight for the key |
| `negative-hit` | a call hit an `errorTtl` tombstone (see [negative caching](#negative-caching)) |
| `store` | a value was written (includes the effective `ttl`) |
| `expire` | an expired entry was dropped (lazily on read, or by the active sweep) |
| `delete` | an entry was removed, via `delete`/`clear`/`invalidatePrefix` |
| `error` | a background stale revalidation's `fn` rejected |

every event carries both `key` (the logical key you passed in) and `scopedKey` (`key` prefixed by
`CacheOptions.scope`, if any).

## memory

the default `MemoryStorage` is LRU-capped at `max` entries (`1000` by default) and actively swept
every `sweepIntervalMs` (`60_000` by default) — both close the leak you'd otherwise get from an
unbounded key pattern like `` `chat:${id}` `` across a large audience, where most keys are written
once and never read again to trigger lazy eviction. pass your own `storage` (redis, sqlite, …) and
you own its lifecycle — `max` is ignored, and the sweep is off unless you set `sweepIntervalMs`
explicitly. call `.dispose()` on the cache (or `plugin.handle.dispose()`) to stop an active sweep,
e.g. in a test or a serverless handler that shouldn't keep the process alive.

---

part of [**yaebal**](https://github.com/neverlane/yaebal) — a type-safe, runtime-agnostic Telegram Bot API framework. MIT.
