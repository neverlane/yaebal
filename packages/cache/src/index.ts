import type { Context, Plugin } from "@yaebal/core";
import { type MaybePromise, MemoryStorage, type StorageAdapter } from "@yaebal/sklad";

export type { MaybePromise, StorageAdapter } from "@yaebal/sklad";

/** a cache observation — wire it to metrics/logging via {@link CacheOptions.onEvent}. */
export type CacheEvent =
	| { type: "hit"; key: string }
	| { type: "miss"; key: string }
	| { type: "store"; key: string; ttl: number | undefined }
	| { type: "expire"; key: string }
	| { type: "delete"; key: string };

/** an entry as stored on disk: the value plus its absolute expiry (`undefined` = never). */
interface CacheEntry<T> {
	value: T;
	until: number | undefined;
}

export interface CacheOptions {
	/**
	 * where entries live. defaults to in-memory (`MemoryStorage`, lost on restart).
	 * keys are stored flat with no plugin prefix, so don't share one store instance
	 * with another plugin (or another `cache`) unless you give each a distinct
	 * {@link CacheOptions.scope} — otherwise their keys can collide.
	 */
	storage?: StorageAdapter<CacheEntry<unknown>>;
	/** default ttl in ms for entries that don't pass their own. omit for "never expires". */
	ttl?: number;
	/**
	 * key namespace, e.g. the bot's id — set whenever several bots share one persistent
	 * storage, so their entries can't collide.
	 */
	scope?: string;
	/** clock override, mainly for tests. */
	now?: () => number;
	/** observe hits / misses / stores / expirations / deletes (metrics, logging). */
	onEvent?: (event: CacheEvent) => unknown | Promise<unknown>;
}

/** what `cache()` adds to `ctx` — also the shape of the standalone {@link Cache} client. */
export interface CacheControl {
	/** read a cached value. `undefined` for a miss or an expired entry (which is dropped). */
	get<T>(key: string): Promise<T | undefined>;
	/** write a value. `ttl` (ms) overrides the cache's default; omit both for "never expires". */
	set<T>(key: string, value: T, ttl?: number): Promise<void>;
	/** drop one entry. */
	delete(key: string): Promise<void>;
	/** report whether a live (non-expired) entry exists, without reading it. */
	has(key: string): Promise<boolean>;
	/**
	 * read-through memoization: return the cached value, or call `fn`, cache its result and
	 * return that. concurrent `wrap` calls for the same key share one in-flight `fn` call, so
	 * a burst of misses (e.g. several updates hitting `getChat` at once) never fans out into
	 * a burst of duplicate api requests. a rejected `fn` is never cached.
	 */
	wrap<T>(key: string, fn: () => MaybePromise<T>, ttl?: number): Promise<T>;
}

/** a standalone cache client, independent of any bot or `ctx` — same shape as `ctx.cache`. */
export type Cache = CacheControl;

/**
 * build a standalone {@link Cache}, independent of any bot or `ctx`. pre-warm it, read it from
 * a webhook route, or pass it to {@link cache} to install that very instance on a bot.
 */
export function createCache(options: CacheOptions = {}): Cache {
	const storage = options.storage ?? new MemoryStorage<CacheEntry<unknown>>();
	const now = options.now ?? Date.now;
	// keyed by scoped key: dedupes concurrent misses so `wrap` never issues the same
	// upstream call twice for one key at once.
	const inflight = new Map<string, Promise<unknown>>();

	const scoped = (key: string) => (options.scope ? `${options.scope}:${key}` : key);
	const emit = async (event: CacheEvent) => {
		await options.onEvent?.(event);
	};

	const read = async <T>(scopedKey: string): Promise<{ value: T } | undefined> => {
		const entry = (await storage.get(scopedKey)) as CacheEntry<T> | undefined;
		if (entry === undefined || entry === null) return undefined;

		if (entry.until !== undefined && now() >= entry.until) {
			await storage.delete(scopedKey);
			await emit({ type: "expire", key: scopedKey });
			return undefined;
		}

		return { value: entry.value };
	};

	const write = async <T>(scopedKey: string, value: T, ttl: number | undefined): Promise<void> => {
		const effectiveTtl = ttl ?? options.ttl;
		await storage.set(scopedKey, {
			value,
			until: effectiveTtl === undefined ? undefined : now() + effectiveTtl,
		});
		await emit({ type: "store", key: scopedKey, ttl: effectiveTtl });
	};

	return {
		async get<T>(key: string): Promise<T | undefined> {
			return (await read<T>(scoped(key)))?.value;
		},

		async set<T>(key: string, value: T, ttl?: number): Promise<void> {
			await write(scoped(key), value, ttl);
		},

		async delete(key: string): Promise<void> {
			const scopedKey = scoped(key);
			await storage.delete(scopedKey);
			await emit({ type: "delete", key: scopedKey });
		},

		async has(key: string): Promise<boolean> {
			return (await read(scoped(key))) !== undefined;
		},

		async wrap<T>(key: string, fn: () => MaybePromise<T>, ttl?: number): Promise<T> {
			const scopedKey = scoped(key);

			const hit = await read<T>(scopedKey);
			if (hit !== undefined) {
				await emit({ type: "hit", key: scopedKey });
				return hit.value;
			}

			await emit({ type: "miss", key: scopedKey });

			const pending = inflight.get(scopedKey) as Promise<T> | undefined;
			if (pending !== undefined) return pending;

			const promise = (async () => {
				try {
					const value = await fn();
					await write(scopedKey, value, ttl);
					return value;
				} finally {
					inflight.delete(scopedKey);
				}
			})();

			inflight.set(scopedKey, promise);
			return promise;
		},
	};
}

function isCache(source: CacheOptions | Cache): source is Cache {
	return typeof (source as Cache).wrap === "function";
}

export interface CachePlugin extends Plugin<Context, { cache: CacheControl }> {
	/** the underlying {@link Cache} client — read or pre-warm it outside a handler. */
	readonly handle: Cache;
}

/**
 * install `ctx.cache` on the bot, backed by `source` (a {@link CacheOptions} config, or a
 * client already built with {@link createCache}): `bot.install(cache({ ttl: 60_000 }))`.
 */
export function cache(source: CacheOptions | Cache = {}): CachePlugin {
	const handle = isCache(source) ? source : createCache(source);

	const install = ((composer) => composer.decorate({ cache: handle })) as CachePlugin;
	Object.defineProperty(install, "handle", { value: handle, enumerable: true });

	return install;
}
