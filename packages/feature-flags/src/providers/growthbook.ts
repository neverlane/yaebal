import type { FlagEvalContext, FlagProvider } from "../types.js";

/** the result `evalFeature` resolves to — the subset this adapter reads. */
export interface GrowthBookFeatureResult {
	value: unknown;
	/** `"unknownFeature"` when GrowthBook has no definition for the key at all. */
	source: string;
}

/**
 * the subset of a GrowthBook client (`@growthbook/growthbook`) the adapter needs, typed
 * structurally so this package depends on no GrowthBook SDK.
 */
export interface GrowthBookClientLike {
	evalFeature(key: string): GrowthBookFeatureResult;
	setAttributes?(attributes: Record<string, unknown>): void;
}

/** builds a GrowthBook client (or reuses one) for a single evaluation's `evalContext`. */
export type GrowthBookClientFactory = (evalContext: FlagEvalContext) => GrowthBookClientLike;

export interface GrowthBookAdapterOptions {
	/**
	 * map the per-update eval context to GrowthBook attributes. only used with the single-client
	 * form (see {@link growthBookAdapter}) — a factory is expected to bake attributes in itself.
	 */
	attributes?: (evalContext: FlagEvalContext) => Record<string, unknown>;
}

/**
 * consult GrowthBook before the local catalog: `provider: growthBookAdapter(gbClient)`.
 *
 * pass a **factory** — `growthBookAdapter((evalContext) => new GrowthBook({ attributes: {...} }))`
 * — to get a fresh client per evaluation; this is the recommended form, since GrowthBook targeting
 * reads whatever attributes are currently set *on the client instance* rather than taking them
 * per call, and a bot serves updates for many users concurrently.
 *
 * passing a single shared client (with `options.attributes` re-applied via `setAttributes` before
 * each check) is accepted for convenience, but is only safe single-threaded: two in-flight updates
 * can interleave `setAttributes(a)` → `setAttributes(b)` → `evalFeature` for `a`, evaluating `a`'s
 * flag against `b`'s attributes. prefer the factory form for anything handling real traffic.
 *
 * uses `evalFeature` rather than `isOn` — `isOn` always resolves to a boolean (`false` for a
 * feature GrowthBook has never heard of), which would permanently hide the local catalog's rules
 * for that flag. `evalFeature`'s `source: "unknownFeature"` distinguishes "no such feature" from
 * "evaluated to false", so only the latter is treated as GrowthBook's authoritative answer.
 */
export function growthBookAdapter(
	client: GrowthBookClientLike | GrowthBookClientFactory,
	options: GrowthBookAdapterOptions = {},
): FlagProvider {
	return {
		isEnabled(key, evalContext) {
			const instance = typeof client === "function" ? client(evalContext) : client;
			if (typeof client !== "function" && options.attributes) {
				instance.setAttributes?.(options.attributes(evalContext));
			}

			const result = instance.evalFeature(key);
			if (result.source === "unknownFeature") return undefined;

			return Boolean(result.value);
		},
	};
}
