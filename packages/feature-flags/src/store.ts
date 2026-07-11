import { MemoryStorage, type StorageAdapter } from "@yaebal/sklad";
import type { BucketKeyResolver, FlagEvalContext, OverrideOptions } from "./types.js";

/** ready-made bucket-identity strategies for {@link FeatureFlagsOptions.bucketKey}. */
export const bucketBy = {
	/** one bucket per user — the default. falls back to `chat` when a user id is missing. */
	user: (evalContext: FlagEvalContext): string | undefined =>
		evalContext.userId !== undefined ? `user:${evalContext.userId}` : undefined,
	/** one bucket per chat — every member of a group shares the same flag state. */
	chat: (evalContext: FlagEvalContext): string | undefined =>
		evalContext.chatId !== undefined ? `chat:${evalContext.chatId}` : undefined,
} satisfies Record<string, (evalContext: FlagEvalContext) => string | undefined>;

/** the default bucket resolver: per-user, falling back to per-chat, then a shared `"anon"` bucket. */
export const defaultBucketKey: BucketKeyResolver = (evalContext) =>
	bucketBy.user(evalContext) ?? bucketBy.chat(evalContext) ?? "anon";

interface StoredOverride {
	value: unknown;
	/** epoch ms; checked lazily on read, same idiom as `@yaebal/sklad`'s `MemoryStorage`. */
	expiresAt?: number;
}

/**
 * namespaced, per-flag override storage layered over any `@yaebal/sklad` `StorageAdapter`. every
 * key lives under a `flags:` prefix this plugin owns, so sharing one adapter instance with
 * `@yaebal/session` (or any other yaebal plugin) never collides. one key per (bucket, flag) pair
 * — not one shared record — so concurrent `setOverride` calls for different flags never clobber
 * each other via a stale read-modify-write, and clearing the last override for a bucket deletes
 * the key outright instead of leaving an empty record behind.
 */
export class OverrideStore {
	#storage: StorageAdapter<unknown>;
	#now: () => number;

	constructor(storage?: StorageAdapter<unknown>, now: () => number = Date.now) {
		this.#storage = storage ?? new MemoryStorage<unknown>();
		this.#now = now;
	}

	#bucketKey(bucketId: string, flagKey: string): string {
		return `flags:o:${bucketId}:${flagKey}`;
	}

	#globalKey(flagKey: string): string {
		return `flags:g:${flagKey}`;
	}

	async #read(key: string): Promise<{ value: unknown } | undefined> {
		const raw = (await this.#storage.get(key)) as StoredOverride | undefined;
		if (raw === undefined) return undefined;

		if (raw.expiresAt !== undefined && this.#now() >= raw.expiresAt) {
			await this.#storage.delete(key);
			return undefined;
		}

		return { value: raw.value };
	}

	async #write(key: string, value: unknown, options: OverrideOptions | undefined): Promise<void> {
		const stored: StoredOverride = { value };
		if (options?.ttl !== undefined) stored.expiresAt = this.#now() + options.ttl;
		await this.#storage.set(key, stored);
	}

	/** `undefined` means "no override" — distinct from an override whose value happens to be `undefined`-like. */
	async getOverride(bucketId: string, flagKey: string): Promise<{ value: unknown } | undefined> {
		return this.#read(this.#bucketKey(bucketId, flagKey));
	}

	async setOverride(
		bucketId: string,
		flagKey: string,
		value: unknown,
		options?: OverrideOptions,
	): Promise<void> {
		await this.#write(this.#bucketKey(bucketId, flagKey), value, options);
	}

	async clearOverride(bucketId: string, flagKey: string): Promise<void> {
		await this.#storage.delete(this.#bucketKey(bucketId, flagKey));
	}

	async getGlobalOverride(flagKey: string): Promise<{ value: unknown } | undefined> {
		return this.#read(this.#globalKey(flagKey));
	}

	async setGlobalOverride(
		flagKey: string,
		value: unknown,
		options?: OverrideOptions,
	): Promise<void> {
		await this.#write(this.#globalKey(flagKey), value, options);
	}

	async clearGlobalOverride(flagKey: string): Promise<void> {
		await this.#storage.delete(this.#globalKey(flagKey));
	}
}
