import type { Context } from "@yaebal/core";
import type { StorageAdapter } from "@yaebal/sklad";

/** telegram's own chat kinds — reused for targeting rules, no need to redeclare them. */
export type ChatType = "private" | "group" | "supergroup" | "channel";

/** anything that coerces to a `Date` — catalogs loaded from json/env give strings, not `Date`s. */
export type DateLike = Date | string | number;

/** the per-update inputs a flag can be evaluated against. */
export interface FlagEvalContext {
	/** stable bucketing id — used by percentage rollout, variant assignment, and per-user targeting. */
	userId?: string | number;
	chatId?: string | number;
	/** the chat kind the update came from — matched by `chatTypes`. */
	chatType?: ChatType;
	/** the user's telegram client language — matched by `languageCodes`. */
	languageCode?: string;
	/** whether the user has telegram premium — matched by `premiumOnly`. */
	isPremium?: boolean;
	/** clock used for date-window rules. defaults to `new Date()`. */
	now?: Date;
}

/**
 * targeting conditions shared by boolean {@link RolloutRule}s and multivariate
 * {@link VariantRule}s. all set conditions on a rule must hold (AND) for it to match.
 */
export interface TargetingConditions {
	/** enable only for these ids (checked against `userId`, falling back to `chatId`). */
	userIds?: Array<string | number>;
	/** enable only in these chats. */
	chatIds?: Array<string | number>;
	/** enable only in these kinds of chat, e.g. `["group", "supergroup"]`. */
	chatTypes?: ChatType[];
	/** enable only for these telegram client languages, e.g. `["ru", "uk"]`. */
	languageCodes?: string[];
	/** enable only for telegram premium users. */
	premiumOnly?: boolean;
	/** enable only at/after this date. */
	from?: DateLike;
	/** enable only strictly before this date. */
	to?: DateLike;
}

/**
 * one targeting rule for a boolean flag. a flag with several rules is enabled if ANY rule
 * matches (OR) — see {@link FlagDefinition}. `percentage` buckets deterministically by
 * `userId`/`chatId`, independent of the other conditions on the same rule.
 */
export interface RolloutRule extends TargetingConditions {
	/** enable for this percentage of buckets (0-100, fractions allowed), deterministic by bucket. */
	percentage?: number;
	/**
	 * what the rule sets when it matches. defaults to `true` — set `false` to carve out a
	 * kill-switch slice (e.g. `default: true` everywhere, but `false` for a misbehaving cohort)
	 * regardless of `default` or other matching rules evaluated before it.
	 */
	value?: boolean;
}

export interface FlagDefinition {
	/** value when no override, global override, provider, or rule applies. */
	default: boolean;
	/** rules are checked in order; the first matching rule's `value` wins (see {@link RolloutRule}). */
	rules?: RolloutRule[];
}

/** one weighted outcome of a {@link VariantDefinition}. weights are relative, not required to sum to 100. */
export interface Variant<T> {
	value: T;
	weight: number;
}

/**
 * a targeting rule that forces a specific variant. unlike {@link RolloutRule}, there's no
 * separate on/off — the rule's presence in the match set forces `value` outright.
 */
export interface VariantRule<T> extends TargetingConditions {
	value: T;
}

/**
 * a multivariate flag: `default` is a plain value (string, number, or any JSON-serializable
 * type), `variants` is the weighted distribution used once no rule forces an outcome. rules
 * are checked in order and the first match wins; falling through, the bucket's weighted
 * variant is picked deterministically (same hash as percentage rollout).
 */
export interface VariantDefinition<T> {
	default: T;
	variants: readonly Variant<T>[];
	rules?: readonly VariantRule<T>[];
}

/** a flag catalog entry: a plain boolean (static), a {@link FlagDefinition}, or a {@link VariantDefinition}. */
// biome-ignore lint/suspicious/noExplicitAny: a catalog mixes flags of unrelated variant types
export type FlagConfig = boolean | FlagDefinition | VariantDefinition<any>;

export type FlagsCatalog = Record<string, FlagConfig>;

/** the flag keys in `F` backed by a plain boolean or a {@link FlagDefinition} — valid for `isEnabled`. */
export type BooleanFlagKeys<F extends FlagsCatalog> = {
	// biome-ignore lint/suspicious/noExplicitAny: structural check against the variant shape
	[K in keyof F]: F[K] extends VariantDefinition<any> ? never : K;
}[keyof F] &
	string;

/** the flag keys in `F` backed by a {@link VariantDefinition} — valid for `getVariant`. */
export type VariantFlagKeys<F extends FlagsCatalog> = {
	// biome-ignore lint/suspicious/noExplicitAny: structural check against the variant shape
	[K in keyof F]: F[K] extends VariantDefinition<any> ? K : never;
}[keyof F] &
	string;

/** every flag key in `F`, regardless of shape — valid for `setOverride`/`clearOverride`/`snapshot`. */
export type FlagKeys<F extends FlagsCatalog> = Extract<keyof F, string>;

/** the value type a flag resolves to: the variant's `T`, or `boolean` for everything else. */
export type FlagValue<F extends FlagsCatalog, K extends keyof F> =
	F[K] extends VariantDefinition<infer T> ? T : boolean;

/**
 * why an evaluation resolved the way it did — see {@link FeatureFlagsOptions.onEvaluate}.
 * `"rule"` covers both a matched `RolloutRule`/`VariantRule` and a boolean flag's kill-switch
 * (`value: false`); `"variant"` is a weighted pick with no rule forcing an outcome; `"default"`
 * is the catalog's plain `default` with nothing else applying.
 */
export type FlagSource = "override" | "global" | "provider" | "rule" | "variant" | "default";

/** emitted after every `isEnabled`/`getVariant` call — wire up exposure logging or debugging. */
export interface EvaluationEvent<F extends FlagsCatalog = FlagsCatalog> {
	key: FlagKeys<F>;
	value: unknown;
	source: FlagSource;
	evalContext: FlagEvalContext;
}

/**
 * an external flag provider (LaunchDarkly, GrowthBook, env, …). return `undefined` to defer to
 * the local catalog instead of overriding it. providers only ever resolve **boolean** flags —
 * multivariate flags are always evaluated locally (weighted + targeting rules), since the whole
 * point of a local variant is a deterministic bucket assignment, not a SaaS round trip.
 */
export interface FlagProvider {
	isEnabled(
		key: string,
		evalContext: FlagEvalContext,
	): boolean | undefined | Promise<boolean | undefined>;
}

/** derives a stable bucketing string for an eval context — the same identity feeds percentage/variant hashing and override storage keys. see {@link bucketBy}. */
export type BucketKeyResolver = (evalContext: FlagEvalContext) => string;

export interface FeatureFlagsOptions<F extends FlagsCatalog = FlagsCatalog> {
	/** the flag catalog: `{ "new-ui": true }`, a {@link FlagDefinition}, or a {@link VariantDefinition}. */
	flags: F;
	/**
	 * persists per-bucket and global overrides written via `setOverride`/`setGlobalOverride`.
	 * defaults to an in-memory store (lost on restart) — swap for a `@yaebal/sklad` adapter to
	 * persist them (e.g. an admin panel toggling a flag for one user). keys are namespaced under
	 * `flags:` by this plugin, so sharing one adapter instance with `@yaebal/session` or other
	 * yaebal plugins is safe.
	 */
	storage?: StorageAdapter<unknown>;
	/**
	 * consulted before the local catalog, for boolean flags only. a defined return (`true`/`false`)
	 * wins over local rules; `undefined` falls through to them. see {@link launchDarklyAdapter}/
	 * {@link growthBookAdapter}. errors are caught and treated as `undefined` (fail-open onto the
	 * local catalog) — see `onProviderError`.
	 */
	provider?: FlagProvider;
	/** derive the eval context for an update. defaults to telegram's own `from`/`chat` fields. */
	getContext?: (ctx: Context) => FlagEvalContext;
	/**
	 * derive the bucket identity from an eval context — feeds percentage/variant hashing AND the
	 * override storage key, so "force this flag for user 7" means the same bucket everywhere.
	 * defaults to {@link bucketBy.user}, falling back to {@link bucketBy.chat}, then `"anon"`.
	 */
	bucketKey?: BucketKeyResolver;
	/** called after every evaluation — wire up exposure logging, analytics, or debugging. */
	onEvaluate?: (event: EvaluationEvent<F>) => void;
	/** called when `provider.isEnabled` throws — evaluation still falls through to local rules. */
	onProviderError?: (error: unknown, key: FlagKeys<F>) => void;
}

/** options accepted by `setOverride`/`setGlobalOverride`. */
export interface OverrideOptions {
	/** expire this override this many ms after it's set. checked lazily on read, like `@yaebal/sklad`'s `MemoryStorage`. */
	ttl?: number;
}

/** `ctx.flags` — bound to the current update's bucket. see {@link Flags} for the standalone shape. */
export interface FlagsControl<F extends FlagsCatalog = FlagsCatalog> {
	/** whether `key` is enabled for the current bucket: override → global → provider → rules → default. */
	isEnabled<K extends BooleanFlagKeys<F>>(key: K): Promise<boolean>;
	/** which variant `key` resolves to for the current bucket: override → global → rules → weighted pick. */
	getVariant<K extends VariantFlagKeys<F>>(key: K): Promise<FlagValue<F, K>>;
	/** force `key` to `value` for the current bucket, persisted via `storage`. wins over everything but a global override. */
	setOverride<K extends FlagKeys<F>>(
		key: K,
		value: FlagValue<F, K>,
		options?: OverrideOptions,
	): Promise<void>;
	/** remove this bucket's override, reverting to global/provider/local evaluation. */
	clearOverride<K extends FlagKeys<F>>(key: K): Promise<void>;
	/** force `key` to `value` for every bucket — a kill switch, independent of any per-bucket override. */
	setGlobalOverride<K extends FlagKeys<F>>(
		key: K,
		value: FlagValue<F, K>,
		options?: OverrideOptions,
	): Promise<void>;
	/** remove the global override for `key`. */
	clearGlobalOverride<K extends FlagKeys<F>>(key: K): Promise<void>;
	/** evaluate every flag in the catalog at once, for the current bucket. */
	snapshot(): Promise<{ [K in FlagKeys<F>]: FlagValue<F, K> }>;
}

/** a standalone flags client, independent of any bot or `ctx` — same shape as `ctx.flags`, plus an explicit context per call. */
export interface Flags<F extends FlagsCatalog = FlagsCatalog> {
	isEnabled<K extends BooleanFlagKeys<F>>(key: K, evalContext: FlagEvalContext): Promise<boolean>;
	getVariant<K extends VariantFlagKeys<F>>(
		key: K,
		evalContext: FlagEvalContext,
	): Promise<FlagValue<F, K>>;
	setOverride<K extends FlagKeys<F>>(
		key: K,
		value: FlagValue<F, K>,
		evalContext: FlagEvalContext,
		options?: OverrideOptions,
	): Promise<void>;
	clearOverride<K extends FlagKeys<F>>(key: K, evalContext: FlagEvalContext): Promise<void>;
	setGlobalOverride<K extends FlagKeys<F>>(
		key: K,
		value: FlagValue<F, K>,
		options?: OverrideOptions,
	): Promise<void>;
	clearGlobalOverride<K extends FlagKeys<F>>(key: K): Promise<void>;
	snapshot(evalContext: FlagEvalContext): Promise<{ [K in FlagKeys<F>]: FlagValue<F, K> }>;
}
