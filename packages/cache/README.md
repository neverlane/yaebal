# @yaebal/cache

ttl memoization for api calls and arbitrary data — `ctx.cache.get/set/wrap`. built on
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
	const chat = await ctx.cache.wrap(`chat:${ctx.chat.id}`, () => ctx.api.getChat(ctx.chat.id));
	await ctx.reply(chat.title ?? "private chat");
});
```

`wrap` is read-through: a hit returns the cached value; a miss calls the function, caches its
result, and returns it. a rejected call is never cached.

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

- `get<T>(key)` — cached value, or `undefined` on a miss / expired entry.
- `set<T>(key, value, ttl?)` — write a value; `ttl` (ms) overrides the cache's default.
- `delete(key)` — drop one entry.
- `has(key)` — whether a live entry exists, without reading it.
- `wrap<T>(key, fn, ttl?)` — cached value, or call `fn`, cache and return its result.

## options

```ts
cache({
	storage: redisStorage(client), // defaults to MemoryStorage (in-memory, lost on restart)
	ttl: 60_000, // default ttl in ms; omit for "never expires"
	scope: "bot-1", // key namespace — set when several bots share one persistent storage
	onEvent: (event) => metrics.count(event.type), // hit / miss / store / expire / delete
});
```

ttl is enforced by `@yaebal/cache` itself (each entry carries its own expiry), not by the
storage adapter — so per-call `ttl` overrides work the same on every adapter, including ones
whose native ttl is fixed at construction time (like `redisStorage`/`sqliteStorage`).

## dedup

`wrap` tracks in-flight calls per key. if two updates call `wrap("chat:1", fetchChat)` before
either finishes, the second one awaits the first's promise instead of calling `fetchChat` again —
useful for `getChat`/`getChatMember`-style lookups that many concurrent updates ask for at once.

---

part of [**yaebal**](https://github.com/neverlane/yaebal) — a type-safe, runtime-agnostic Telegram Bot API framework. MIT.
