import { isVariantDefinition, normalizeDefinition } from "./catalog.js";
import { safeProvider } from "./providers/index.js";
import { evaluateLocal, pickVariant } from "./rules.js";
import { defaultBucketKey, type OverrideStore } from "./store.js";
import type {
	BucketKeyResolver,
	EvaluationEvent,
	FlagConfig,
	FlagEvalContext,
	FlagKeys,
	FlagProvider,
	FlagSource,
	FlagsCatalog,
	OverrideOptions,
} from "./types.js";

/** memoizes override reads within one call tree (typically: one update) — see `featureFlags()`. */
export type EvalCache = Map<string, Promise<{ value: unknown } | undefined>>;

function requireFlag<F extends FlagsCatalog>(flags: F, key: string): FlagConfig {
	const config = flags[key];
	if (config === undefined) {
		throw new Error(`feature-flags: unknown flag ${JSON.stringify(key)}`);
	}
	return config;
}

async function memoized(
	cache: EvalCache | undefined,
	cacheKey: string,
	read: () => Promise<{ value: unknown } | undefined>,
): Promise<{ value: unknown } | undefined> {
	if (cache === undefined) return read();

	let pending = cache.get(cacheKey);
	if (pending === undefined) {
		pending = read();
		cache.set(cacheKey, pending);
	}
	return pending;
}

export interface FlagsEngineOptions<F extends FlagsCatalog> {
	flags: F;
	store: OverrideStore;
	provider?: FlagProvider;
	bucketKey?: BucketKeyResolver;
	onEvaluate?: (event: EvaluationEvent<F>) => void;
	onProviderError?: (error: unknown, key: FlagKeys<F>) => void;
}

/**
 * the shared evaluation engine behind both `createFlags()` and `ctx.flags` — one instance per
 * `featureFlags()`/`createFlags()` call, reused across every update and bucket. resolves
 * **override → global override → provider → local rules/variant → default**, emitting
 * `onEvaluate` for every call.
 */
export class FlagsEngine<F extends FlagsCatalog> {
	#flags: F;
	#store: OverrideStore;
	#provider: FlagProvider | undefined;
	#bucketKey: BucketKeyResolver;
	#onEvaluate: ((event: EvaluationEvent<F>) => void) | undefined;

	constructor(options: FlagsEngineOptions<F>) {
		this.#flags = options.flags;
		this.#store = options.store;
		this.#bucketKey = options.bucketKey ?? defaultBucketKey;
		this.#onEvaluate = options.onEvaluate;
		this.#provider = options.provider
			? safeProvider(
					options.provider,
					options.onProviderError as ((error: unknown, key: string) => void) | undefined,
				)
			: undefined;
	}

	#emit(key: string, value: unknown, source: FlagSource, evalContext: FlagEvalContext): void {
		this.#onEvaluate?.({ key: key as FlagKeys<F>, value, source, evalContext });
	}

	async isEnabled(key: string, evalContext: FlagEvalContext, cache?: EvalCache): Promise<boolean> {
		const config = requireFlag(this.#flags, key);
		if (isVariantDefinition(config)) {
			throw new Error(
				`feature-flags: ${JSON.stringify(key)} is a multivariate flag — use \`getVariant\`, not \`isEnabled\``,
			);
		}

		const bucketId = this.#bucketKey(evalContext);

		const override = await memoized(cache, `o:${bucketId}:${key}`, () =>
			this.#store.getOverride(bucketId, key),
		);
		if (override !== undefined) {
			const value = override.value as boolean;
			this.#emit(key, value, "override", evalContext);
			return value;
		}

		const global = await memoized(cache, `g:${key}`, () => this.#store.getGlobalOverride(key));
		if (global !== undefined) {
			const value = global.value as boolean;
			this.#emit(key, value, "global", evalContext);
			return value;
		}

		if (this.#provider !== undefined) {
			const fromProvider = await this.#provider.isEnabled(key, evalContext);
			if (fromProvider !== undefined) {
				this.#emit(key, fromProvider, "provider", evalContext);
				return fromProvider;
			}
		}

		const { value, matchedRule } = evaluateLocal(normalizeDefinition(config), key, evalContext);
		this.#emit(key, value, matchedRule ? "rule" : "default", evalContext);
		return value;
	}

	async getVariant(key: string, evalContext: FlagEvalContext, cache?: EvalCache): Promise<unknown> {
		const config = requireFlag(this.#flags, key);
		if (!isVariantDefinition(config)) {
			throw new Error(
				`feature-flags: ${JSON.stringify(key)} is not a multivariate flag — use \`isEnabled\`, not \`getVariant\``,
			);
		}

		const bucketId = this.#bucketKey(evalContext);

		const override = await memoized(cache, `o:${bucketId}:${key}`, () =>
			this.#store.getOverride(bucketId, key),
		);
		if (override !== undefined) {
			this.#emit(key, override.value, "override", evalContext);
			return override.value;
		}

		const global = await memoized(cache, `g:${key}`, () => this.#store.getGlobalOverride(key));
		if (global !== undefined) {
			this.#emit(key, global.value, "global", evalContext);
			return global.value;
		}

		const { value, matchedRule } = pickVariant(config, key, evalContext);
		this.#emit(key, value, matchedRule ? "rule" : "variant", evalContext);
		return value;
	}

	async setOverride(
		key: string,
		value: unknown,
		evalContext: FlagEvalContext,
		options?: OverrideOptions,
	): Promise<void> {
		requireFlag(this.#flags, key);
		await this.#store.setOverride(this.#bucketKey(evalContext), key, value, options);
	}

	async clearOverride(key: string, evalContext: FlagEvalContext): Promise<void> {
		requireFlag(this.#flags, key);
		await this.#store.clearOverride(this.#bucketKey(evalContext), key);
	}

	async setGlobalOverride(key: string, value: unknown, options?: OverrideOptions): Promise<void> {
		requireFlag(this.#flags, key);
		await this.#store.setGlobalOverride(key, value, options);
	}

	async clearGlobalOverride(key: string): Promise<void> {
		requireFlag(this.#flags, key);
		await this.#store.clearGlobalOverride(key);
	}

	/** evaluate the whole catalog at once — for an admin surface, exposure logs, or debugging. */
	async snapshot(evalContext: FlagEvalContext): Promise<Record<string, unknown>> {
		const cache: EvalCache = new Map();
		const result: Record<string, unknown> = {};

		for (const key of Object.keys(this.#flags)) {
			const config = this.#flags[key] as FlagConfig;
			result[key] = isVariantDefinition(config)
				? await this.getVariant(key, evalContext, cache)
				: await this.isEnabled(key, evalContext, cache);
		}

		return result;
	}
}
