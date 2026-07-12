import { type MaybePromise, MemoryStorage, type StorageAdapter } from "@yaebal/sklad";
import { scopeKey, withPrefix } from "./keys.js";
import type {
	Cache,
	CacheControl,
	CacheEvent,
	CacheOptions,
	CacheSchema,
	SetOptions,
	WrapOptions,
} from "./types.js";

/** an entry as stored on disk for a live value. */
interface StoredValue<T> {
	kind: "value";
	value: T;
	/** the relative ttl (ms) used to write this entry; `undefined` = never expires. */
	ttl: number | undefined;
	/** absolute fresh-boundary (ms epoch); `undefined` = never. */
	until: number | undefined;
	/** relative stale-while-revalidate window (ms) tacked onto `until`, if any. */
	staleTtl?: number;
	/** absolute stale boundary = `until + staleTtl`. */
	staleUntil?: number;
	/** whether a hit refreshes `until`/`staleUntil` using `ttl`/`staleTtl` — sliding expiry. */
	sliding?: boolean;
	createdAt: number;
}

/** a negative-cache tombstone: a remembered rejection, distinct from any cacheable value. */
interface StoredError {
	kind: "error";
	error: { name: string; message: string };
	until: number;
	createdAt: number;
}

type StoredEntry<T> = StoredValue<T> | StoredError;

function normalizeTtl(value: number | undefined, label: string): number | undefined {
	if (value === undefined) return undefined;
	if (!Number.isFinite(value) || value <= 0) {
		throw new RangeError(`@yaebal/cache: ${label} must be a finite number > 0 (got ${value})`);
	}
	return value;
}

function toStoredError(error: unknown): { name: string; message: string } {
	return error instanceof Error
		? { name: error.name, message: error.message }
		: { name: "Error", message: String(error) };
}

function fromStoredError(stored: { name: string; message: string }): Error {
	const error = new Error(stored.message);
	error.name = stored.name;
	return error;
}

type ReadResult<T> =
	| { status: "miss" }
	| { status: "fresh"; value: T }
	| { status: "stale"; value: T }
	| { status: "error"; error: Error };

/** build a standalone {@link Cache}, independent of any bot or `ctx`. pass `S` for a typed key catalog. */
export function createCache<S extends CacheSchema = Record<never, never>>(
	options: CacheOptions = {},
): Cache<S> {
	const defaultTtl = normalizeTtl(options.ttl, "ttl");
	const defaultSliding = options.sliding ?? false;
	const scope = options.scope;
	const now = options.now ?? Date.now;

	const usingDefaultStorage = options.storage === undefined;
	const storage: StorageAdapter<unknown> =
		options.storage ?? new MemoryStorage({ max: options.max ?? 1000 });

	// keyed by scoped key: dedupes concurrent misses (and revalidations) so `wrap` never issues
	// the same upstream call twice for one key at once.
	const inflight = new Map<string, Promise<unknown>>();

	const scoped = (key: string) => scopeKey(scope, key);
	const unscope = (scopedKey: string) => (scope ? scopedKey.slice(scope.length + 1) : scopedKey);

	const emit = async (event: CacheEvent): Promise<void> => {
		if (options.onEvent === undefined) return;
		try {
			await options.onEvent(event);
		} catch (error) {
			// observability must never break the cache's data path
			console.error("@yaebal/cache: onEvent threw", error);
		}
	};

	const readEntry = async <T>(scopedKey: string, key: string): Promise<ReadResult<T>> => {
		const entry = (await storage.get(scopedKey)) as StoredEntry<T> | undefined;
		if (entry === undefined || entry === null) return { status: "miss" };

		const n = now();

		if (entry.kind === "error") {
			if (n >= entry.until) {
				await storage.delete(scopedKey);
				await emit({ type: "expire", key, scopedKey });
				return { status: "miss" };
			}
			return { status: "error", error: fromStoredError(entry.error) };
		}

		if (entry.until !== undefined && n >= entry.until) {
			if (entry.staleUntil !== undefined && n < entry.staleUntil) {
				return { status: "stale", value: entry.value };
			}
			await storage.delete(scopedKey);
			await emit({ type: "expire", key, scopedKey });
			return { status: "miss" };
		}

		// sliding expiry: a fresh hit pushes the boundary out again
		if (entry.sliding && entry.ttl !== undefined) {
			const until = n + entry.ttl;
			const refreshed: StoredValue<T> = {
				...entry,
				until,
				staleUntil: entry.staleTtl !== undefined ? until + entry.staleTtl : undefined,
			};
			await storage.set(scopedKey, refreshed);
		}

		return { status: "fresh", value: entry.value };
	};

	const writeValue = async <T>(
		scopedKey: string,
		key: string,
		value: T,
		ttl: number | undefined,
		staleTtl: number | undefined,
		sliding: boolean,
	): Promise<void> => {
		const effectiveTtl = ttl ?? defaultTtl;
		const n = now();
		const until = effectiveTtl === undefined ? undefined : n + effectiveTtl;
		const entry: StoredValue<T> = {
			kind: "value",
			value,
			ttl: effectiveTtl,
			until,
			staleTtl,
			staleUntil: until !== undefined && staleTtl !== undefined ? until + staleTtl : undefined,
			sliding,
			createdAt: n,
		};
		await storage.set(scopedKey, entry);
		await emit({ type: "store", key, scopedKey, ttl: effectiveTtl });
	};

	const writeError = async (scopedKey: string, error: unknown, errorTtl: number): Promise<void> => {
		const n = now();
		const entry: StoredError = {
			kind: "error",
			error: toStoredError(error),
			until: n + errorTtl,
			createdAt: n,
		};
		await storage.set(scopedKey, entry);
	};

	const requireTtlForSliding = (sliding: boolean, ttl: number | undefined) => {
		if (sliding && ttl === undefined && defaultTtl === undefined) {
			throw new RangeError(
				"@yaebal/cache: sliding expiry requires a ttl (per-call or CacheOptions.ttl)",
			);
		}
	};

	const normalizeSetOptions = (input: number | SetOptions | undefined) => {
		const opts = typeof input === "number" ? { ttl: input } : (input ?? {});
		const ttl = normalizeTtl(opts.ttl, "ttl");
		const sliding = opts.sliding ?? defaultSliding;
		requireTtlForSliding(sliding, ttl);
		return { ttl, sliding };
	};

	const normalizeWrapOptions = (input: number | WrapOptions | undefined) => {
		const opts = typeof input === "number" ? { ttl: input } : (input ?? {});
		const ttl = normalizeTtl(opts.ttl, "ttl");
		const sliding = opts.sliding ?? defaultSliding;
		requireTtlForSliding(sliding, ttl);
		return {
			ttl,
			staleTtl: normalizeTtl(opts.staleTtl, "staleTtl"),
			errorTtl: normalizeTtl(opts.errorTtl, "errorTtl"),
			sliding,
		};
	};

	/** performs one `fn` call, writes its outcome, and tracks it in `inflight` for dedup. */
	const runFetch = <T>(
		scopedKey: string,
		key: string,
		fn: () => MaybePromise<T>,
		ttl: number | undefined,
		staleTtl: number | undefined,
		errorTtl: number | undefined,
		sliding: boolean,
		reason: "miss" | "revalidate",
	): Promise<T> => {
		const promise = (async () => {
			try {
				const value = await fn();
				await writeValue(scopedKey, key, value, ttl, staleTtl, sliding);
				if (reason === "revalidate") await emit({ type: "revalidate", key, scopedKey });
				return value;
			} catch (error) {
				if (errorTtl !== undefined) await writeError(scopedKey, error, errorTtl);
				if (reason === "revalidate") await emit({ type: "error", key, scopedKey, error });
				throw error;
			} finally {
				inflight.delete(scopedKey);
			}
		})();

		// set synchronously, before any await runs — concurrent callers checking `inflight` right
		// after this call started can never miss it and issue a duplicate fetch.
		inflight.set(scopedKey, promise);
		return promise;
	};

	const control = {
		async get<T>(key: string): Promise<T | undefined> {
			const scopedKey = scoped(key);
			const result = await readEntry<T>(scopedKey, key);
			if (result.status === "fresh" || result.status === "stale") {
				await emit({ type: result.status === "fresh" ? "hit" : "stale", key, scopedKey });
				return result.value;
			}
			await emit({ type: result.status === "error" ? "negative-hit" : "miss", key, scopedKey });
			return undefined;
		},

		async peek<T>(key: string): Promise<{ value: T } | undefined> {
			const scopedKey = scoped(key);
			const result = await readEntry<T>(scopedKey, key);
			if (result.status === "fresh" || result.status === "stale") {
				await emit({ type: result.status === "fresh" ? "hit" : "stale", key, scopedKey });
				return { value: result.value };
			}
			await emit({ type: result.status === "error" ? "negative-hit" : "miss", key, scopedKey });
			return undefined;
		},

		async set<T>(key: string, value: T, input?: number | SetOptions): Promise<void> {
			const { ttl, sliding } = normalizeSetOptions(input);
			await writeValue(scoped(key), key, value, ttl, undefined, sliding);
		},

		async delete(key: string): Promise<void> {
			const scopedKey = scoped(key);
			await storage.delete(scopedKey);
			await emit({ type: "delete", key, scopedKey });
		},

		async has(key: string): Promise<boolean> {
			const scopedKey = scoped(key);
			const result = await readEntry(scopedKey, key);
			const isLive = result.status === "fresh" || result.status === "stale";
			await emit({ type: isLive ? "hit" : "miss", key, scopedKey });
			return isLive;
		},

		async wrap<T>(
			key: string,
			fn: () => MaybePromise<T>,
			input?: number | WrapOptions,
		): Promise<T> {
			const { ttl, staleTtl, errorTtl, sliding } = normalizeWrapOptions(input);
			const scopedKey = scoped(key);

			const result = await readEntry<T>(scopedKey, key);

			if (result.status === "error") {
				await emit({ type: "negative-hit", key, scopedKey });
				throw result.error;
			}
			if (result.status === "fresh") {
				await emit({ type: "hit", key, scopedKey });
				return result.value;
			}
			if (result.status === "stale") {
				await emit({ type: "stale", key, scopedKey });
				if (!inflight.has(scopedKey)) {
					const revalidation = runFetch(
						scopedKey,
						key,
						fn,
						ttl,
						staleTtl,
						errorTtl,
						sliding,
						"revalidate",
					);
					// fire-and-forget: the caller already has the stale value. swallow here so a
					// failed background refresh never surfaces as an unhandled rejection — a
					// concurrent caller that dedupes onto `revalidation` still sees the real outcome.
					void revalidation.catch(() => {});
				}
				return result.value;
			}

			await emit({ type: "miss", key, scopedKey });
			const pending = inflight.get(scopedKey) as Promise<T> | undefined;
			if (pending !== undefined) {
				await emit({ type: "dedupe", key, scopedKey });
				return pending;
			}
			return runFetch(scopedKey, key, fn, ttl, staleTtl, errorTtl, sliding, "miss");
		},

		async getMany<T>(keys: readonly string[]): Promise<Map<string, T>> {
			const result = new Map<string, T>();
			await Promise.all(
				keys.map(async (key) => {
					const value = await control.get<T>(key);
					if (value !== undefined) result.set(key, value);
				}),
			);
			return result;
		},

		async setMany(
			entries: ReadonlyArray<{ key: string; value: unknown; ttl?: number | SetOptions }>,
		): Promise<void> {
			await Promise.all(entries.map((entry) => control.set(entry.key, entry.value, entry.ttl)));
		},

		async clear(): Promise<void> {
			await control.invalidatePrefix("");
		},

		async invalidatePrefix(prefix: string): Promise<void> {
			if (!storage.keys) {
				throw new Error(
					"@yaebal/cache: invalidatePrefix/clear needs a storage adapter that supports " +
						"enumeration (keys()) — MemoryStorage/sqliteStorage/fileStorage always do; " +
						"redisStorage/kvStorage do when their client exposes KEYS/list().",
				);
			}
			const scopedKeys = await storage.keys(scoped(prefix));
			await Promise.all(
				scopedKeys.map(async (scopedKey) => {
					await storage.delete(scopedKey);
					await emit({ type: "delete", key: unscope(scopedKey), scopedKey });
				}),
			);
		},

		namespace(prefix: string): CacheControl<S> {
			return withPrefix(control as unknown as CacheControl<S>, prefix);
		},
		forChat(chatId: number | string): CacheControl<S> {
			return withPrefix(control as unknown as CacheControl<S>, `chat:${chatId}:`);
		},
	};

	// active sweep: closes the gap where a key is written once and never read again, so lazy
	// eviction at read time never gets the chance to reclaim it. only runs when the storage
	// adapter can enumerate its keys.
	const sweepMs =
		options.sweepIntervalMs === false
			? undefined
			: (options.sweepIntervalMs ?? (usingDefaultStorage ? 60_000 : undefined));

	let timer: ReturnType<typeof setInterval> | undefined;
	if (sweepMs !== undefined && storage.keys) {
		const isExpired = (entry: StoredEntry<unknown>, n: number): boolean => {
			if (entry.kind === "error") return n >= entry.until;
			if (entry.until === undefined) return false;
			return n >= (entry.staleUntil ?? entry.until);
		};

		const sweep = async () => {
			const keys = await storage.keys?.(scope ? `${scope}:` : undefined);
			if (!keys) return;
			const n = now();

			await Promise.all(
				keys.map(async (scopedKey) => {
					const entry = (await storage.get(scopedKey)) as StoredEntry<unknown> | undefined;
					if (entry === undefined || !isExpired(entry, n)) return;
					await storage.delete(scopedKey);
					await emit({ type: "expire", key: unscope(scopedKey), scopedKey });
				}),
			);
		};

		timer = setInterval(() => void sweep(), sweepMs);
		// works in node; a no-op elsewhere (e.g. cloudflare workers, where setInterval returns a
		// plain number with no `unref`) instead of throwing.
		(timer as unknown as { unref?: () => void }).unref?.();
	}

	return {
		...control,
		dispose() {
			if (timer !== undefined) clearInterval(timer);
		},
	} as Cache<S>;
}
