/**
 * the storage contract shared by the yaebal ecosystem (session, scenes, i18n, media-cache,
 * morda) plus zero-dependency adapters. every adapter takes an already-constructed client and
 * types it structurally, so this package depends on nothing and never dictates a driver version.
 */

export type MaybePromise<T> = T | Promise<T>;

/**
 * a pluggable key-value store. implement this to back sessions (or any yaebal plugin state)
 * with redis, a database, a file, …. `has` and `touch` are optional capabilities: `touch`
 * refreshes a key's ttl without rewriting the value, which callers (e.g. `@yaebal/session`)
 * use for sliding expiry when the adapter advertises it.
 */
export interface StorageAdapter<T> {
	get(key: string): MaybePromise<T | undefined>;
	set(key: string, value: T): MaybePromise<unknown>;
	delete(key: string): MaybePromise<unknown>;
	/** report whether a key exists without necessarily reading it. */
	has?(key: string): MaybePromise<boolean>;
	/** refresh the key's ttl without rewriting the value (sliding expiry). */
	touch?(key: string): MaybePromise<unknown>;
}

/** how persistent adapters turn values into strings. defaults to `JSON`. */
export interface Serializer<T> {
	stringify(value: T): string;
	parse(raw: string): T;
}

function jsonSerializer<T>(): Serializer<T> {
	return {
		stringify: (value) => JSON.stringify(value),
		parse: (raw) => JSON.parse(raw) as T,
	};
}

export interface MemoryStorageOptions {
	/**
	 * structured-clone values on `set` and `get` so stored state can't be mutated by reference —
	 * the same isolation a serializing adapter (redis, sqlite) gives you, which keeps dev and
	 * prod behavior identical. set `false` to share references (and accept that any mutation
	 * of a live object is instantly "persisted", saved or not).
	 */
	clone?: boolean;
	/** expire entries this many ms after the last write/touch. checked lazily on read. */
	ttl?: number;
	/** keep at most this many entries, evicting the least-recently-used on overflow. */
	max?: number;
	/** clock override, mainly for tests. */
	now?: () => number;
}

/**
 * the default in-memory store. lost on restart — swap for a persistent adapter in production.
 * clones values by default (see {@link MemoryStorageOptions.clone}) and optionally expires
 * (`ttl`) or LRU-caps (`max`) its entries.
 */
export class MemoryStorage<T> implements StorageAdapter<T> {
	#map = new Map<string, { value: T; at: number }>();
	#clone: boolean;
	#ttl: number | undefined;
	#max: number | undefined;
	#now: () => number;

	constructor(options: MemoryStorageOptions = {}) {
		this.#clone = options.clone ?? true;
		this.#ttl = options.ttl;
		this.#max = options.max;
		this.#now = options.now ?? Date.now;
	}

	/** live entries (expired ones are dropped lazily, so this is an upper bound under ttl). */
	get size(): number {
		return this.#map.size;
	}

	#live(key: string): { value: T; at: number } | undefined {
		const entry = this.#map.get(key);
		if (entry === undefined) return undefined;

		if (this.#ttl !== undefined && this.#now() - entry.at > this.#ttl) {
			this.#map.delete(key);
			return undefined;
		}

		return entry;
	}

	get(key: string): T | undefined {
		const entry = this.#live(key);
		if (entry === undefined) return undefined;

		// under an lru cap, reading refreshes recency (map iteration order is insertion order)
		if (this.#max !== undefined) {
			this.#map.delete(key);
			this.#map.set(key, entry);
		}

		return this.#clone ? structuredClone(entry.value) : entry.value;
	}

	set(key: string, value: T): void {
		this.#map.delete(key);
		this.#map.set(key, { value: this.#clone ? structuredClone(value) : value, at: this.#now() });

		if (this.#max !== undefined) {
			while (this.#map.size > this.#max) {
				const oldest = this.#map.keys().next().value;
				if (oldest === undefined) break;
				this.#map.delete(oldest);
			}
		}
	}

	delete(key: string): void {
		this.#map.delete(key);
	}

	has(key: string): boolean {
		return this.#live(key) !== undefined;
	}

	touch(key: string): void {
		const entry = this.#live(key);
		if (entry !== undefined) entry.at = this.#now();
	}

	clear(): void {
		this.#map.clear();
	}
}

/**
 * the subset of a redis client the adapter needs — both `ioredis` and `redis` (node-redis v4+)
 * instances satisfy it structurally, no driver dependency required.
 */
export interface RedisLike {
	get(key: string): Promise<string | null>;
	set(key: string, value: string): Promise<unknown>;
	del(key: string): Promise<unknown>;
	expire(key: string, seconds: number): Promise<unknown>;
}

export interface RedisStorageOptions<T> {
	/** prepended to every key, e.g. `"bot:session:"`. */
	prefix?: string;
	/** expire keys this many ms after the last write/touch (redis `EXPIRE`, rounded up to seconds). */
	ttl?: number;
	/** value codec. defaults to `JSON`. */
	serializer?: Serializer<T>;
}

/** back storage with any redis client (`ioredis`, node-redis v4+, or anything `RedisLike`). */
export function redisStorage<T>(
	client: RedisLike,
	options: RedisStorageOptions<T> = {},
): StorageAdapter<T> {
	const { prefix = "" } = options;
	const serializer = options.serializer ?? jsonSerializer<T>();
	const seconds =
		options.ttl === undefined ? undefined : Math.max(1, Math.ceil(options.ttl / 1000));
	const k = (key: string) => prefix + key;

	const adapter: StorageAdapter<T> = {
		async get(key) {
			const raw = await client.get(k(key));
			return raw === null || raw === undefined ? undefined : serializer.parse(raw);
		},
		async set(key, value) {
			await client.set(k(key), serializer.stringify(value));
			if (seconds !== undefined) await client.expire(k(key), seconds);
		},
		async delete(key) {
			await client.del(k(key));
		},
		async has(key) {
			return (await client.get(k(key))) != null;
		},
	};

	// advertise sliding expiry only when a ttl is configured
	if (seconds !== undefined) adapter.touch = (key) => client.expire(k(key), seconds);

	return adapter;
}

export interface SqliteStatementLike {
	get(...params: unknown[]): unknown;
	run(...params: unknown[]): unknown;
}

/**
 * the subset of a synchronous sqlite handle the adapter needs — `node:sqlite`'s `DatabaseSync`
 * and `better-sqlite3` both satisfy it structurally.
 */
export interface SqliteLike {
	exec(sql: string): unknown;
	prepare(sql: string): SqliteStatementLike;
}

export interface SqliteStorageOptions<T> {
	/** table name (created on first use). defaults to `"yaebal_storage"`. */
	table?: string;
	/** expire rows this many ms after the last write/touch. checked lazily on read. */
	ttl?: number;
	/** value codec. defaults to `JSON`. */
	serializer?: Serializer<T>;
	/** clock override, mainly for tests. */
	now?: () => number;
}

/** back storage with sqlite (`node:sqlite`'s `DatabaseSync`, `better-sqlite3`, or anything `SqliteLike`). */
export function sqliteStorage<T>(
	db: SqliteLike,
	options: SqliteStorageOptions<T> = {},
): StorageAdapter<T> {
	const table = options.table ?? "yaebal_storage";
	if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(table)) {
		throw new Error(`sqliteStorage: invalid table name ${JSON.stringify(table)}`);
	}

	const serializer = options.serializer ?? jsonSerializer<T>();
	const ttl = options.ttl;
	const now = options.now ?? Date.now;

	db.exec(
		`CREATE TABLE IF NOT EXISTS ${table} ("key" TEXT PRIMARY KEY, "value" TEXT NOT NULL, "expires_at" INTEGER)`,
	);

	const select = db.prepare(`SELECT "value", "expires_at" FROM ${table} WHERE "key" = ?`);
	const upsert = db.prepare(
		`INSERT INTO ${table} ("key", "value", "expires_at") VALUES (?, ?, ?) ` +
			`ON CONFLICT("key") DO UPDATE SET "value" = excluded."value", "expires_at" = excluded."expires_at"`,
	);
	const remove = db.prepare(`DELETE FROM ${table} WHERE "key" = ?`);
	const refresh = db.prepare(`UPDATE ${table} SET "expires_at" = ? WHERE "key" = ?`);

	const liveRow = (key: string): { value: string } | undefined => {
		const row = select.get(key) as { value: string; expires_at: number | null } | undefined;
		if (row === undefined) return undefined;

		if (row.expires_at !== null && row.expires_at <= now()) {
			remove.run(key);
			return undefined;
		}

		return row;
	};

	const adapter: StorageAdapter<T> = {
		get(key) {
			const row = liveRow(key);
			return row === undefined ? undefined : serializer.parse(row.value);
		},
		set(key, value) {
			upsert.run(key, serializer.stringify(value), ttl === undefined ? null : now() + ttl);
		},
		delete(key) {
			remove.run(key);
		},
		has(key) {
			return liveRow(key) !== undefined;
		},
	};

	if (ttl !== undefined) adapter.touch = (key) => refresh.run(now() + ttl, key);

	return adapter;
}

/**
 * the subset of a cloudflare workers `KVNamespace` binding the adapter needs, typed
 * structurally so this package needs no `@cloudflare/workers-types` dependency.
 */
export interface KVNamespaceLike {
	get(key: string, type: "text"): Promise<string | null>;
	put(key: string, value: string, options?: { expirationTtl?: number }): Promise<unknown>;
	delete(key: string): Promise<unknown>;
}

export interface KvStorageOptions<T> {
	/** prepended to every key. */
	prefix?: string;
	/** expire keys this many ms after each write (cloudflare enforces a 60s minimum). */
	ttl?: number;
	/** value codec. defaults to `JSON`. */
	serializer?: Serializer<T>;
}

/**
 * back storage with a cloudflare workers kv namespace. kv has no cheap ttl refresh, so the
 * expiry is per-write (no `touch`): a key lives `ttl` after its last save, not its last read.
 */
export function kvStorage<T>(
	kv: KVNamespaceLike,
	options: KvStorageOptions<T> = {},
): StorageAdapter<T> {
	const { prefix = "" } = options;
	const serializer = options.serializer ?? jsonSerializer<T>();
	const seconds =
		options.ttl === undefined ? undefined : Math.max(60, Math.ceil(options.ttl / 1000));
	const k = (key: string) => prefix + key;

	return {
		async get(key) {
			const raw = await kv.get(k(key), "text");
			return raw === null ? undefined : serializer.parse(raw);
		},
		async set(key, value) {
			await kv.put(
				k(key),
				serializer.stringify(value),
				seconds === undefined ? undefined : { expirationTtl: seconds },
			);
		},
		async delete(key) {
			await kv.delete(k(key));
		},
		async has(key) {
			return (await kv.get(k(key), "text")) !== null;
		},
	};
}
