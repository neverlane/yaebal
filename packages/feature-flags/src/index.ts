import type { Context, Plugin } from "@yaebal/core";
import { validateCatalog } from "./catalog.js";
import { type EvalCache, FlagsEngine } from "./eval.js";
import { OverrideStore } from "./store.js";
import type {
	FeatureFlagsOptions,
	FlagEvalContext,
	Flags,
	FlagsCatalog,
	FlagsControl,
	FlagValue,
} from "./types.js";

export type { MaybePromise, StorageAdapter } from "@yaebal/sklad";
export { type FlagsAdminOptions, flagsAdmin } from "./admin.js";
export { validateCatalog } from "./catalog.js";
export { type FlagsContext, flagGuard, variantGuard, whenFlag } from "./guard.js";
export {
	type EnvProviderOptions,
	envProvider,
	type GrowthBookAdapterOptions,
	type GrowthBookClientFactory,
	type GrowthBookClientLike,
	growthBookAdapter,
	type LaunchDarklyClientLike,
	type LaunchDarklyEvaluationDetail,
	launchDarklyAdapter,
	safeProvider,
} from "./providers/index.js";
export { bucketOf } from "./rules.js";
export { bucketBy, defaultBucketKey, OverrideStore } from "./store.js";
export type {
	BooleanFlagKeys,
	BucketKeyResolver,
	ChatType,
	DateLike,
	EvaluationEvent,
	FeatureFlagsOptions,
	FlagConfig,
	FlagDefinition,
	FlagEvalContext,
	FlagKeys,
	FlagProvider,
	FlagSource,
	Flags,
	FlagsCatalog,
	FlagsControl,
	FlagValue,
	OverrideOptions,
	RolloutRule,
	TargetingConditions,
	Variant,
	VariantDefinition,
	VariantFlagKeys,
	VariantRule,
} from "./types.js";

function defaultContext(ctx: Context): FlagEvalContext {
	return {
		userId: ctx.from?.id,
		chatId: ctx.chat?.id,
		chatType: ctx.chat?.type,
		languageCode: ctx.from?.language_code,
		isPremium: ctx.from?.is_premium,
	};
}

function buildEngine<F extends FlagsCatalog>(options: FeatureFlagsOptions<F>): FlagsEngine<F> {
	validateCatalog(options.flags);
	const store = new OverrideStore(options.storage);

	return new FlagsEngine<F>({
		flags: options.flags,
		store,
		provider: options.provider,
		bucketKey: options.bucketKey,
		onEvaluate: options.onEvaluate,
		onProviderError: options.onProviderError,
	});
}

/** build a standalone {@link Flags} client, independent of any bot or `ctx`. */
export function createFlags<const F extends FlagsCatalog>(
	options: FeatureFlagsOptions<F>,
): Flags<F> {
	const engine = buildEngine(options);

	return {
		isEnabled: (key, evalContext) => engine.isEnabled(key, evalContext),
		getVariant: (key, evalContext) =>
			engine.getVariant(key, evalContext) as Promise<FlagValue<F, typeof key>>,
		setOverride: (key, value, evalContext, opts) =>
			engine.setOverride(key, value, evalContext, opts),
		clearOverride: (key, evalContext) => engine.clearOverride(key, evalContext),
		setGlobalOverride: (key, value, opts) => engine.setGlobalOverride(key, value, opts),
		clearGlobalOverride: (key) => engine.clearGlobalOverride(key),
		snapshot: (evalContext) =>
			engine.snapshot(evalContext) as Promise<{ [K in keyof F & string]: FlagValue<F, K> }>,
	};
}

/**
 * install `ctx.flags` on the bot: `bot.install(featureFlags({ flags: { "new-ui": { default: false,
 * rules: [{ percentage: 10 }] } } }))`. evaluation order per call is override → global override →
 * provider → local rules → `default`. the eval context (bucket identity, telegram targeting
 * fields, clock) is derived once per update via `getContext` (defaults to telegram's own
 * `from`/`chat` fields); the bucket identity that feeds percentage/variant hashing and override
 * storage is derived via `bucketKey` (defaults to per-user, falling back to per-chat).
 *
 * ```ts
 * bot.install(featureFlags({ flags: { "new-ui": { default: false, rules: [{ percentage: 25 }] } } }));
 * bot.command("start", async (ctx) => {
 *   await ctx.reply(await ctx.flags.isEnabled("new-ui") ? "welcome to the new ui!" : "welcome!");
 * });
 * ```
 */
export function featureFlags<const F extends FlagsCatalog>(
	options: FeatureFlagsOptions<F>,
): Plugin<Context, { flags: FlagsControl<F> }> {
	const engine = buildEngine(options);
	const getContext = options.getContext ?? defaultContext;

	const plugin: Plugin<Context, { flags: FlagsControl<F> }> = (composer) =>
		composer.derive((ctx) => {
			const evalContext = getContext(ctx);
			const cache: EvalCache = new Map();

			const flags: FlagsControl<F> = {
				isEnabled: (key) => engine.isEnabled(key, evalContext, cache),
				getVariant: (key) =>
					engine.getVariant(key, evalContext, cache) as Promise<FlagValue<F, typeof key>>,
				setOverride: (key, value, opts) => engine.setOverride(key, value, evalContext, opts),
				clearOverride: (key) => engine.clearOverride(key, evalContext),
				setGlobalOverride: (key, value, opts) => engine.setGlobalOverride(key, value, opts),
				clearGlobalOverride: (key) => engine.clearGlobalOverride(key),
				snapshot: () =>
					engine.snapshot(evalContext) as Promise<{ [K in keyof F & string]: FlagValue<F, K> }>,
			};

			return { flags };
		});

	return plugin;
}
