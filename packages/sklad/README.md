# @yaebal/sklad

the storage layer of the yaebal ecosystem: one `StorageAdapter<T>` contract shared by
`@yaebal/session`, `@yaebal/scenes`, `@yaebal/i18n`, `@yaebal/media-cache` and `@yaebal/morda`,
plus ready-made adapters — in-memory (ttl / lru / clone), redis, sqlite, cloudflare kv and a
json file. every adapter takes an **already-constructed client** and types it structurally, so
this package has zero dependencies and never dictates a driver version.

## install

```sh
pnpm add @yaebal/sklad
```

## the contract

```ts
interface StorageAdapter<T> {
	get(key: string): T | undefined | Promise<T | undefined>;
	set(key: string, value: T): unknown | Promise<unknown>;
	delete(key: string): unknown | Promise<unknown>;
	has?(key: string): boolean | Promise<boolean>;      // optional capability
	touch?(key: string): unknown | Promise<unknown>;    // optional: refresh ttl without rewriting
}
```

`touch` is how sliding expiry works: when an adapter advertises it, `@yaebal/session` calls it
on reads that didn't change the value, so a session stays alive as long as the chat is active.

## adapters

### memory (default everywhere)

```ts
import { MemoryStorage } from "@yaebal/sklad";

const storage = new MemoryStorage<MySession>({
	ttl: 30 * 60_000, // expire 30min after the last write/touch (lazy, checked on read)
	max: 10_000,      // lru cap
});
```

values are **structured-cloned on set/get by default**, giving the same isolation a serializing
adapter (redis, sqlite) gives — dev and prod behave identically. pass `{ clone: false }` to
share references instead (cheaper, but any mutation of a live object is instantly "persisted").

### redis

```ts
import { redisStorage } from "@yaebal/sklad";
import Redis from "ioredis"; // or `createClient` from "redis" — both fit structurally

const storage = redisStorage<MySession>(new Redis(), {
	prefix: "bot:session:",
	ttl: 24 * 60 * 60_000, // EXPIRE, refreshed on every write and touch
});
```

### sqlite

```ts
import { DatabaseSync } from "node:sqlite"; // or better-sqlite3 — both fit structurally
import { sqliteStorage } from "@yaebal/sklad";

const storage = sqliteStorage<MySession>(new DatabaseSync("bot.db"), { table: "sessions" });
```

### cloudflare kv

```ts
import { kvStorage } from "@yaebal/sklad";

const storage = kvStorage<MySession>(env.SESSIONS, { ttl: 24 * 60 * 60_000 });
```

kv has no cheap ttl refresh, so expiry is per-write (no `touch`).

### json file

```ts
import { fileStorage } from "@yaebal/sklad/file";

const storage = fileStorage<MySession>("./data/sessions.json", { pretty: true });
```

one json document, atomic writes (tmp + rename), operations serialized through an internal
queue. the zero-infrastructure choice for small bots; one process per file.

## options shared by persistent adapters

- `ttl` — milliseconds everywhere; adapters convert to their native unit.
- `serializer` — swap `JSON` for e.g. superjson: `{ stringify, parse }` (redis / sqlite / kv).
- `prefix` — key namespace (redis / kv).

---

part of [**yaebal**](https://github.com/neverlane/yaebal) — a type-safe, runtime-agnostic Telegram Bot API framework. MIT.
