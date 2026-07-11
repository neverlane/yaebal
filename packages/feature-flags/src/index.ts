import type { Context, Plugin } from "@yaebal/core";
import { type MaybePromise, MemoryStorage, type StorageAdapter } from "@yaebal/sklad";

export type { MaybePromise, StorageAdapter } from "@yaebal/sklad";

/** the per-update inputs a flag can be evaluated against. */
export interface FlagEvalContext {
	/** stable bucketing id — used by percentage rollout and per-user targeting. */
	userId?: string | number;
	chatId?: string | number;
	/** clock used for date-window rules. defaults to `new Date()`. */
	now?: Date;
}

/**
 * one targeting rule. all set conditions must hold (AND) for the rule to match; a flag with
 * several rules is enabled if ANY rule matches (OR) — see {@link FlagDefinition}.
 */
export interface RolloutRule {
	/** enable for this percentage of buckets (0-100), deterministic by `userId`/`chatId`. */
	percentage?: number;
	/** enable only for these ids (checked against `userId`, falling back to `chatId`). */
	userIds?: Array<string | number>;
	/** enable only at/after this date. */
	from?: Date;
	/** enable only strictly before this date. */
	to?: Date;
}

export interface FlagDefinition {
	/** value when no override, provider, or rule applies. */
	default: boolean;
	/** any matching rule enables the flag, regardless of `default`. */
	rules?: RolloutRule[];
}

/** a flag catalog entry: a plain boolean (static), or a full {@link FlagDefinition}. */
export type FlagConfig = boolean | FlagDefinition;

export type FlagsCatalog = Record<string, FlagConfig>;

/**
 * an external flag provider (LaunchDarkly, GrowthBook, …). return `undefined` to defer to the
 * local catalog instead of overriding it — see {@link launchDarklyAdapter}/{@link growthBookAdapter}.
 */
export interface FlagProvider {
	isEnabled(key: string, evalContext: FlagEvalContext): MaybePromise<boolean | undefined>;
}

function normalizeDefinition(config: FlagConfig): FlagDefinition {
	return typeof config === "boolean" ? { default: config } : config;
}

/** fnv-1a, mapped to [0, 100) — stable across processes/runs, unlike `Math.random`. */
export function bucketOf(input: string): number {
	let hash = 0x811c9dc5;
	for (let i = 0; i < input.length; i++) {
		hash ^= input.charCodeAt(i);
		hash = Math.imul(hash, 0x01000193);
	}
	return (hash >>> 0) % 100;
}

function ruleMatches(rule: RolloutRule, key: string, evalContext: FlagEvalContext): boolean {
	if (rule.userIds !== undefined) {
		const id = evalContext.userId ?? evalContext.chatId;
		if (id === undefined || !rule.userIds.some((allowed) => String(allowed) === String(id))) {
			return false;
		}
	}

	if (rule.percentage !== undefined) {
		const bucketKey = String(evalContext.userId ?? evalContext.chatId ?? "anonymous");
		if (bucketOf(`${key}:${bucketKey}`) >= rule.percentage) return false;
	}

	const now = evalContext.now ?? new Date();
	if (rule.from !== undefined && now < rule.from) return false;
	if (rule.to !== undefined && now >= rule.to) return false;

	return true;
}

function evaluateLocal(
	definition: FlagDefinition,
	key: string,
	evalContext: FlagEvalContext,
): boolean {
	if (definition.rules?.some((rule) => ruleMatches(rule, key, evalContext))) return true;
	return definition.default;
}

export interface FeatureFlagsOptions {
	/** the flag catalog: `{ "new-ui": true }` or `{ "new-ui": { default: false, rules: [...] } }`. */
	flags: FlagsCatalog;
	/**
	 * persists per-bucket overrides written via `setOverride`/`ctx.flags.setOverride`. defaults to
	 * an in-memory store (lost on restart) — swap for a `@yaebal/sklad` adapter to persist them
	 * (e.g. an admin panel toggling a flag for one user).
	 */
	storage?: StorageAdapter<Record<string, boolean>>;
	/**
	 * consulted before the local catalog. a defined return (`true`/`false`) wins over local rules;
	 * `undefined` falls through to them. see {@link launchDarklyAdapter}/{@link growthBookAdapter}.
	 */
	provider?: FlagProvider;
	/** derive the eval context for an update. defaults to `userId: ctx.from?.id, chatId: ctx.chat?.id`. */
	getContext?: (ctx: Context) => FlagEvalContext;
}

/** `ctx.flags` (and the standalone {@link Flags} client) surface. */
export interface FlagsControl {
	/** whether `key` is enabled for the current bucket: override → provider → local rules → default. */
	isEnabled(key: string): Promise<boolean>;
	/** force `key` to `value` for the current bucket, persisted via `storage`. wins over everything else. */
	setOverride(key: string, value: boolean): Promise<void>;
	/** remove a bucket override, reverting to provider/local evaluation. */
	clearOverride(key: string): Promise<void>;
}

/** a standalone flags client, independent of any bot or `ctx` — same shape as `ctx.flags`, plus explicit context. */
export interface Flags {
	isEnabled(key: string, evalContext: FlagEvalContext): Promise<boolean>;
	setOverride(key: string, value: boolean, evalContext: FlagEvalContext): Promise<void>;
	clearOverride(key: string, evalContext: FlagEvalContext): Promise<void>;
}

function overrideKey(evalContext: FlagEvalContext): string {
	return `user:${evalContext.userId ?? ""}:chat:${evalContext.chatId ?? ""}`;
}

/** build a standalone {@link Flags} client, independent of any bot or `ctx`. */
export function createFlags(options: FeatureFlagsOptions): Flags {
	const storage = options.storage ?? new MemoryStorage<Record<string, boolean>>();
	const provider = options.provider;

	return {
		async isEnabled(key, evalContext) {
			const definition = options.flags[key];
			if (definition === undefined) {
				throw new Error(`feature-flags: unknown flag ${JSON.stringify(key)}`);
			}

			const overrides = await storage.get(overrideKey(evalContext));
			if (overrides !== undefined && key in overrides) return overrides[key] as boolean;

			const fromProvider = await provider?.isEnabled(key, evalContext);
			if (fromProvider !== undefined) return fromProvider;

			return evaluateLocal(normalizeDefinition(definition), key, evalContext);
		},

		async setOverride(key, value, evalContext) {
			const storageKey = overrideKey(evalContext);
			const overrides = (await storage.get(storageKey)) ?? {};
			await storage.set(storageKey, { ...overrides, [key]: value });
		},

		async clearOverride(key, evalContext) {
			const storageKey = overrideKey(evalContext);
			const overrides = await storage.get(storageKey);
			if (overrides === undefined || !(key in overrides)) return;

			const { [key]: _dropped, ...rest } = overrides;
			await storage.set(storageKey, rest);
		},
	};
}

function defaultContext(ctx: Context): FlagEvalContext {
	return { userId: ctx.from?.id, chatId: ctx.chat?.id };
}

/**
 * install `ctx.flags` on the bot: `bot.install(featureFlags({ flags: { "new-ui": { default: false,
 * rules: [{ percentage: 10 }] } } }))`. evaluation order per call is override → provider → local
 * rules → `default`. the eval context (bucket key, clock) is derived once per update via
 * `getContext` (defaults to per-user, falling back to per-chat).
 *
 * ```ts
 * bot.install(featureFlags({ flags: { "new-ui": { default: false, rules: [{ percentage: 25 }] } } }));
 * bot.command("start", async (ctx) => {
 *   await ctx.reply(await ctx.flags.isEnabled("new-ui") ? "welcome to the new ui!" : "welcome!");
 * });
 * ```
 */
export function featureFlags(
	options: FeatureFlagsOptions,
): Plugin<Context, { flags: FlagsControl }> {
	const client = createFlags(options);
	const getContext = options.getContext ?? defaultContext;

	const plugin: Plugin<Context, { flags: FlagsControl }> = (composer) =>
		composer.derive((ctx) => {
			const evalContext = getContext(ctx);

			const flags: FlagsControl = {
				isEnabled: (key) => client.isEnabled(key, evalContext),
				setOverride: (key, value) => client.setOverride(key, value, evalContext),
				clearOverride: (key) => client.clearOverride(key, evalContext),
			};

			return { flags };
		});

	return plugin;
}

/**
 * the subset of a LaunchDarkly server-side client (`@launchdarkly/node-server-sdk`) the adapter
 * needs, typed structurally so this package depends on no LaunchDarkly SDK.
 */
export interface LaunchDarklyClientLike {
	variation(key: string, context: unknown, defaultValue: boolean): Promise<boolean>;
}

/**
 * consult LaunchDarkly before the local catalog: `provider: launchDarklyAdapter(ldClient)`.
 * `ldClient.variation` always resolves to a boolean (LaunchDarkly falls back to its own default
 * on error), so once configured LaunchDarkly is authoritative — local rules only apply to flags
 * LaunchDarkly doesn't know about (a fresh `ldClient.variation` call returns its own fallback,
 * not `undefined`, so give LaunchDarkly's variation the same default as the local catalog).
 */
export function launchDarklyAdapter(client: LaunchDarklyClientLike): FlagProvider {
	return {
		async isEnabled(key, evalContext) {
			const ldContext = {
				kind: "user",
				key: String(evalContext.userId ?? evalContext.chatId ?? "anonymous"),
			};
			return client.variation(key, ldContext, false);
		},
	};
}

/**
 * the subset of a GrowthBook client (`@growthbook/growthbook`) the adapter needs, typed
 * structurally so this package depends on no GrowthBook SDK.
 */
export interface GrowthBookClientLike {
	isOn(key: string): boolean;
	setAttributes?(attributes: Record<string, unknown>): void;
}

export interface GrowthBookAdapterOptions {
	/** map the per-update eval context to GrowthBook attributes, applied via `setAttributes` before each check. */
	attributes?: (evalContext: FlagEvalContext) => Record<string, unknown>;
}

/**
 * consult GrowthBook before the local catalog: `provider: growthBookAdapter(gbClient)`. GrowthBook
 * has no per-call context — targeting reads whatever attributes are currently set on the client —
 * so pass `attributes` to re-apply them (e.g. the current user id) before every `isOn` check.
 */
export function growthBookAdapter(
	client: GrowthBookClientLike,
	options: GrowthBookAdapterOptions = {},
): FlagProvider {
	return {
		isEnabled(key, evalContext) {
			if (options.attributes) client.setAttributes?.(options.attributes(evalContext));
			return client.isOn(key);
		},
	};
}
