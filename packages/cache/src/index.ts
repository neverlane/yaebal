import type { Context, Plugin } from "@yaebal/core";
import { createCache } from "./cache.js";
import type { Cache, CacheControl, CacheOptions, CacheSchema } from "./types.js";

export type { MaybePromise, StorageAdapter } from "@yaebal/sklad";
export { createCache } from "./cache.js";
export { scopeKey, withPrefix } from "./keys.js";
export type {
	Cache,
	CacheControl,
	CacheEvent,
	CacheKey,
	CacheOptions,
	CacheSchema,
	CacheValue,
	LooseCacheKey,
	SetOptions,
	WrapOptions,
} from "./types.js";

export interface CachePlugin<S extends CacheSchema = Record<never, never>>
	extends Plugin<Context, { cache: CacheControl<S> }> {
	/** the underlying {@link Cache} client — read, pre-warm, or `dispose()` it outside a handler. */
	readonly handle: Cache<S>;
}

function isCache<S extends CacheSchema>(source: CacheOptions | Cache<S>): source is Cache<S> {
	return typeof (source as Cache<S>).wrap === "function";
}

/**
 * install `ctx.cache` on the bot, backed by `source` (a {@link CacheOptions} config, or a
 * client already built with {@link createCache}): `bot.install(cache({ ttl: 60_000 }))`. pass a
 * type parameter for a typed key catalog: `cache<MySchema>({ ttl: 60_000 })`.
 */
export function cache<S extends CacheSchema = Record<never, never>>(
	source: CacheOptions | Cache<S> = {},
): CachePlugin<S> {
	const handle = isCache(source) ? source : createCache<S>(source);

	const install = ((composer) => composer.decorate({ cache: handle })) as CachePlugin<S>;
	Object.defineProperty(install, "handle", { value: handle, enumerable: true });

	return install;
}
