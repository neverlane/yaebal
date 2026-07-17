import type { Context } from "@yaebal/core";
import { type MaybePromise, MemoryStorage, type StorageAdapter } from "@yaebal/sklad";
import type { AiMessage } from "./model.js";

/** how a memory key is derived per update. `undefined` means "no memory for this update". */
export type AiMemoryKeyResolver = (ctx: Context) => MaybePromise<string | undefined>;

export interface AiMemoryOptions {
	/**
	 * where conversations live. any `@yaebal/sklad` adapter works (redis, file, …);
	 * defaults to in-process `MemoryStorage` — fine for dev, wiped on restart.
	 */
	storage?: StorageAdapter<AiMessage[]>;
	/**
	 * conversation partitioning. default: per user per chat (each group member gets their
	 * own thread with the bot), falling back to per-chat when the update has no sender.
	 */
	key?: AiMemoryKeyResolver;
	/** maximum stored messages (user + assistant turns combined). default 32. */
	window?: number;
}

const defaultKey: AiMemoryKeyResolver = (ctx) => {
	if (ctx.chat === undefined) return undefined;
	return ctx.from === undefined
		? `ai:chat:${ctx.chat.id}`
		: `ai:chat:${ctx.chat.id}:user:${ctx.from.id}`;
};

/** the resolved runtime the plugin threads through `ctx.ai` — one per bot. */
export interface AiMemory {
	load(ctx: Context): Promise<AiMessage[]>;
	append(ctx: Context, turns: AiMessage[]): Promise<void>;
	clear(ctx: Context): Promise<void>;
}

export function createMemory(options: AiMemoryOptions = {}): AiMemory {
	const storage = options.storage ?? new MemoryStorage<AiMessage[]>();
	const resolveKey = options.key ?? defaultKey;
	const window = options.window ?? 32;

	return {
		async load(ctx) {
			const key = await resolveKey(ctx);
			if (key === undefined) return [];
			return (await storage.get(key)) ?? [];
		},
		async append(ctx, turns) {
			if (turns.length === 0) return;
			const key = await resolveKey(ctx);
			if (key === undefined) return;
			const history = (await storage.get(key)) ?? [];
			const next = [...history, ...turns];
			await storage.set(key, next.length > window ? next.slice(next.length - window) : next);
		},
		async clear(ctx) {
			const key = await resolveKey(ctx);
			if (key === undefined) return;
			await storage.delete(key);
		},
	};
}
