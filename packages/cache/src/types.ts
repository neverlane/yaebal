import type { StorageAdapter } from "@yaebal/sklad";

/**
 * a compile-time key→value catalog for a cache, e.g.
 * `{ flags: Flags; [key: \`chat:${number}\`]: ChatFullInfo }` — pass it as `createCache<S>()`'s
 * type parameter to get `get`/`set`/`wrap`/`has`/`peek` inferring the value type from the key,
 * template-literal patterns included. entirely a compile-time contract: there's no catalog
 * object to pass at runtime, unlike `@yaebal/feature-flags`' `flags`. the loosest useful bound —
 * any shape keyed by string/template-literal properties — not a full string index signature.
 */
export type CacheSchema = object;

/** the schema's known key strings, including template-literal patterns. */
export type CacheKey<S extends CacheSchema> = Extract<keyof S, string>;

/** the value type for key `K` per the schema — `unknown` for a key the schema doesn't cover. */
export type CacheValue<S extends CacheSchema, K extends string> = K extends keyof S
	? S[K]
	: unknown;

/**
 * a schema key gets IDE autocomplete; any other string still type-checks (the standard
 * "branded union" idiom — `K | (string & {})` keeps literal-union suggestions alive instead of
 * TS widening the whole union to plain `string`). used where a value type isn't inferred from
 * the key (`delete`, `has`, prefixes), so schema or not, any key remains callable.
 */
export type LooseCacheKey<S extends CacheSchema> = CacheKey<S> | (string & {});

/** a cache observation — wire it to metrics/logging via {@link CacheOptions.onEvent}. */
export type CacheEvent<S extends CacheSchema = CacheSchema> =
	| CacheKeyEvent<S, "hit" | "miss" | "stale" | "dedupe" | "negative-hit" | "expire" | "delete">
	| (CacheEventBase<S> & { type: "store"; ttl: number | undefined })
	| (CacheEventBase<S> & { type: "revalidate" })
	| (CacheEventBase<S> & { type: "error"; error: unknown });

interface CacheEventBase<S extends CacheSchema> {
	/** the logical key passed to `get`/`set`/`wrap`/…, unscoped. */
	key: LooseCacheKey<S>;
	/** the physical key as stored — `key` prefixed by {@link CacheOptions.scope}, if any. */
	scopedKey: string;
}

type CacheKeyEvent<S extends CacheSchema, Type extends string> = CacheEventBase<S> & { type: Type };

export interface SetOptions {
	/** ttl in ms; overrides the cache's default. omit both for "never expires". */
	ttl?: number;
	/** refresh this entry's ttl on every hit (sliding expiry) instead of a fixed absolute expiry. */
	sliding?: boolean;
}

export interface WrapOptions {
	/** ttl (ms) for a fresh value; overrides the cache's default. omit both for "never expires". */
	ttl?: number;
	/**
	 * stale-while-revalidate window (ms): once `ttl` elapses, keep serving the stale value for up
	 * to this long while one background call to `fn` refreshes it. every call during this window
	 * gets the stale value immediately; only the first of them triggers the refresh — the rest
	 * see it's already in flight and don't pile on.
	 */
	staleTtl?: number;
	/**
	 * negative caching: when `fn` rejects, remember the rejection for this many ms and re-throw
	 * it on the next call instead of calling `fn` again. unset (default): a rejection is never
	 * cached, matching pre-1.0 `@yaebal/cache` behavior.
	 */
	errorTtl?: number;
	/** refresh this entry's ttl on every hit (sliding expiry) instead of a fixed absolute expiry. */
	sliding?: boolean;
}

export interface CacheOptions {
	/**
	 * where entries live. defaults to a bounded in-memory store (`MemoryStorage`, lost on
	 * restart — see {@link CacheOptions.max}). keys are stored flat with no plugin prefix, so
	 * don't share one store instance with another plugin (or another `cache`) unless you give
	 * each a distinct {@link CacheOptions.scope} — otherwise their keys can collide.
	 */
	storage?: StorageAdapter<unknown>;
	/** default ttl in ms for entries that don't pass their own. omit for "never expires". */
	ttl?: number;
	/**
	 * key namespace, e.g. the bot's id — set whenever several bots share one persistent
	 * storage, so their entries can't collide.
	 */
	scope?: string;
	/** clock override, mainly for tests. */
	now?: () => number;
	/**
	 * observe hits / misses / stores / expirations / deletes / etc. (metrics, logging). a
	 * throwing observer is caught and logged — it never fails the cache call that triggered it.
	 */
	onEvent?: (event: CacheEvent) => unknown | Promise<unknown>;
	/** default {@link SetOptions.sliding}/{@link WrapOptions.sliding} when a call doesn't pass one. */
	sliding?: boolean;
	/**
	 * cap on the default in-memory store (LRU-evicted on overflow) — bounds memory when keys are
	 * unbounded (e.g. `chat:${id}` across a large audience) and nothing ever reads them again to
	 * trigger lazy eviction. ignored when {@link CacheOptions.storage} is given — you own that
	 * store's lifecycle. defaults to `1000`; pass `Infinity` to opt back into the pre-0.1
	 * unbounded default.
	 */
	max?: number;
	/**
	 * actively sweep expired entries every this many ms, instead of relying purely on lazy
	 * eviction at read time — closes the gap where a key is written once and never read again.
	 * defaults to `60_000` for the built-in store; has no effect when {@link CacheOptions.storage}
	 * is given unless set explicitly (a persistent/custom store owns its own GC). pass `false` to
	 * disable outright, even for the built-in store. call {@link Cache.dispose} to stop it, e.g.
	 * in a test or a serverless handler that shouldn't keep the process alive.
	 */
	sweepIntervalMs?: number | false;
}

/** what `cache()` adds to `ctx` — also the shape of the standalone {@link Cache} client. */
export interface CacheControl<S extends CacheSchema = Record<never, never>> {
	/** read a cached value. `undefined` for a miss or an expired entry (which is dropped). */
	get<K extends CacheKey<S>>(key: K): Promise<CacheValue<S, K> | undefined>;
	get<T>(key: string): Promise<T | undefined>;

	/**
	 * like `get`, but distinguishes a genuinely cached `undefined`/`null` from a miss: a hit
	 * returns `{ value }`, a miss returns `undefined`.
	 */
	peek<K extends CacheKey<S>>(key: K): Promise<{ value: CacheValue<S, K> } | undefined>;
	peek<T>(key: string): Promise<{ value: T } | undefined>;

	/**
	 * write a value. `ttl` (ms) overrides the cache's default; omit both for "never expires".
	 * for a key the schema covers, `value` is checked against its declared type — a single
	 * signature, not an overload, so a mismatched value is a genuine type error, not a silent
	 * fall-through to an untyped escape hatch. any other key accepts any value, same as before
	 * there was a schema.
	 */
	set<K extends string, T extends CacheValue<S, K> = CacheValue<S, K>>(
		key: K,
		value: T,
		ttl?: number | SetOptions,
	): Promise<void>;

	/** drop one entry. */
	delete(key: LooseCacheKey<S>): Promise<void>;
	/** report whether a live (non-expired) entry exists, without reading its value. */
	has(key: LooseCacheKey<S>): Promise<boolean>;

	/**
	 * read-through memoization: return the cached value, or call `fn`, cache its result and
	 * return that. concurrent `wrap` calls for the same key share one in-flight `fn` call, so
	 * a burst of misses (e.g. several updates hitting `getChat` at once) never fans out into
	 * a burst of duplicate api requests. a rejected `fn` is never cached, unless `errorTtl` says
	 * otherwise (see {@link WrapOptions.errorTtl}). `staleTtl` enables stale-while-revalidate
	 * (see {@link WrapOptions.staleTtl}). same non-leaking single-signature typing as `set`: for
	 * a cataloged key, `fn`'s return is checked against the schema; for any other key, it's
	 * inferred freely, exactly like pre-catalog `@yaebal/cache`.
	 */
	wrap<K extends string, T extends CacheValue<S, K> = CacheValue<S, K>>(
		key: K,
		fn: () => T | Promise<T>,
		options?: number | WrapOptions,
	): Promise<T>;

	/** batched `get` — the returned map only has entries for the keys that were live. */
	getMany<K extends CacheKey<S>>(keys: readonly K[]): Promise<Map<K, CacheValue<S, K>>>;
	getMany<T>(keys: readonly string[]): Promise<Map<string, T>>;
	/** batched `set`, run concurrently. */
	setMany(
		entries: ReadonlyArray<{ key: LooseCacheKey<S>; value: unknown; ttl?: number | SetOptions }>,
	): Promise<void>;

	/** drop every entry under this cache's `scope` (or everything, if unscoped). */
	clear(): Promise<void>;
	/**
	 * drop every entry whose key starts with `prefix`. requires the underlying
	 * `@yaebal/sklad` storage adapter to support enumeration (`keys()`/`clear()`) — the built-in
	 * `MemoryStorage`, `sqliteStorage`, `fileStorage` always do; `redisStorage`/`kvStorage` do
	 * when their client exposes `KEYS`/`list()`. throws otherwise.
	 */
	invalidatePrefix(prefix: string): Promise<void>;

	/**
	 * a view over this same cache with every key prefixed by `prefix` — reads, writes and
	 * invalidation all stay within it. composes with {@link CacheOptions.scope}.
	 */
	namespace(prefix: string): CacheControl<S>;
	/** sugar for `namespace(\`chat:${chatId}:\`)` — the dominant real-world key pattern. */
	forChat(chatId: number | string): CacheControl<S>;
}

/**
 * a standalone cache client, independent of any bot or `ctx` — same shape as `ctx.cache`, plus
 * {@link Cache.dispose} to stop the active sweep (see {@link CacheOptions.sweepIntervalMs}).
 */
export interface Cache<S extends CacheSchema = Record<never, never>> extends CacheControl<S> {
	/** stop the active ttl sweep, if one is running. idempotent; harmless to call more than once. */
	dispose(): void;
}
