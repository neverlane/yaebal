import type { FlagEvalContext, FlagProvider } from "../types.js";

export type { FlagProvider } from "../types.js";
export { type EnvProviderOptions, envProvider } from "./env.js";
export {
	type GrowthBookAdapterOptions,
	type GrowthBookClientFactory,
	type GrowthBookClientLike,
	growthBookAdapter,
} from "./growthbook.js";
export {
	type LaunchDarklyClientLike,
	type LaunchDarklyEvaluationDetail,
	launchDarklyAdapter,
} from "./launchdarkly.js";

/**
 * wrap a provider so a thrown error (network blip, SDK not initialized, …) is treated as
 * `undefined` — deferring to the local catalog — instead of rejecting the whole evaluation and
 * taking the update down with it. call `onError` to observe the failure (metrics, logs) without
 * changing the fail-open behavior.
 */
export function safeProvider(
	provider: FlagProvider,
	onError?: (error: unknown, key: string) => void,
): FlagProvider {
	return {
		async isEnabled(key: string, evalContext: FlagEvalContext) {
			try {
				return await provider.isEnabled(key, evalContext);
			} catch (error) {
				onError?.(error, key);
				return undefined;
			}
		},
	};
}
