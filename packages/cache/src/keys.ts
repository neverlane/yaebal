import type { CacheControl, CacheSchema, SetOptions, WrapOptions } from "./types.js";

/** the physical key for a logical key under an optional top-level scope (e.g. a bot id). */
export function scopeKey(scope: string | undefined, key: string): string {
	return scope ? `${scope}:${key}` : key;
}

/**
 * wraps `control` so every key argument is transparently prefixed with `prefix`, and the `Map`
 * keys `getMany` hands back are stripped back to what the caller passed in. powers
 * {@link CacheControl.namespace}/{@link CacheControl.forChat}; nests cleanly, since wrapping an
 * already-prefixed view just concatenates prefixes.
 */
export function withPrefix<S extends CacheSchema>(
	control: CacheControl<S>,
	prefix: string,
): CacheControl<S> {
	const p = (key: string) => `${prefix}${key}`;
	// `control`'s methods carry strict, schema-derived generic signatures (see types.ts) that
	// only resolve for a literal key known at the call site — useless here, where every key is
	// built at runtime from whatever the caller of the wrapped view passes in. bridge through a
	// loosely-typed view once, instead of fighting the generics call by call.
	// biome-ignore lint/suspicious/noExplicitAny: internal plumbing only — the return cast below restores the strict public type
	const raw = control as any;

	const view = {
		get: (key: string) => raw.get(p(key)),
		peek: (key: string) => raw.peek(p(key)),
		set: (key: string, value: unknown, options?: number | SetOptions) =>
			raw.set(p(key), value, options),
		delete: (key: string) => raw.delete(p(key)),
		has: (key: string) => raw.has(p(key)),
		wrap: (key: string, fn: () => unknown, options?: number | WrapOptions) =>
			raw.wrap(p(key), fn, options),

		async getMany(keys: readonly string[]) {
			const scoped = (await raw.getMany(keys.map(p))) as Map<string, unknown>;
			const result = new Map<string, unknown>();
			for (const key of keys) {
				const scopedKey = p(key);
				if (scoped.has(scopedKey)) result.set(key, scoped.get(scopedKey));
			}
			return result;
		},
		setMany: (entries: ReadonlyArray<{ key: string; value: unknown; ttl?: number | SetOptions }>) =>
			raw.setMany(entries.map((entry) => ({ ...entry, key: p(entry.key) }))),

		clear: () => raw.invalidatePrefix(prefix),
		invalidatePrefix: (subPrefix: string) => raw.invalidatePrefix(p(subPrefix)),

		namespace: (subPrefix: string) => withPrefix(control, p(subPrefix)),
		forChat: (chatId: number | string) => withPrefix(control, p(`chat:${chatId}:`)),
	};

	return view as CacheControl<S>;
}
