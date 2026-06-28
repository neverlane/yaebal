import type { Context, Plugin } from "@yaebal/core";

/** a pluggable session store. implement this to back sessions with a file, redis, etc. */
export interface StorageAdapter<T> {
	get(key: string): T | undefined | Promise<T | undefined>;
	set(key: string, value: T): unknown | Promise<unknown>;
	delete(key: string): unknown | Promise<unknown>;
}

/** defaults to in-memory store. lost on restart — swap for a persistent adapter in production. */
export class MemoryStorage<T> implements StorageAdapter<T> {
	#map = new Map<string, T>();

	get(key: string): T | undefined {
		return this.#map.get(key);
	}

	set(key: string, value: T): void {
		this.#map.set(key, value);
	}

	delete(key: string): void {
		this.#map.delete(key);
	}
}

export interface SessionOptions<S> {
	/** build a fresh session when none is stored. required so the type is honest. */
	initial: () => S;
	/** where to persist sessions. defaults to in-memory. */
	storage?: StorageAdapter<S>;
	/** session key for an update. defaults to per-chat (`ctx.chat.id`). */
	getKey?: (ctx: Context) => string | undefined;
}

/**
 * session plugin: loads `ctx.session` before handlers run and persists it after.
 * per-chat by default (the grammY convention); override `getKey` for per-user.
 */
export function session<S>(options: SessionOptions<S>): Plugin<Context, { session: S }> {
	const { initial } = options;

	const storage = options.storage ?? new MemoryStorage<S>();
	const getKey = options.getKey ?? ((ctx: Context) => ctx.chat?.id?.toString());

	return (composer) =>
		composer
			// post-next save. wraps the derive below; runs after handlers, then persists.
			.use(async (ctx, next) => {
				const key = getKey(ctx);
				await next();

				// no key for this update (e.g. a channel post): the session was a throwaway.
				if (key === undefined) return;

				// ponytail: writes back unconditionally. add a dirty-check only if a remote
				// storage adapter makes the extra write measurably expensive.
				await storage.set(key, (ctx as unknown as { session: S }).session);
			})
			// load (or initialise) the session before handlers run; the field flows typed.
			.derive(async (ctx) => {
				const key = getKey(ctx);
				const value = key === undefined ? initial() : ((await storage.get(key)) ?? initial());
				
				return { session: value };
			});
}
