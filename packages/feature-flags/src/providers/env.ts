import type { FlagProvider } from "../types.js";

export interface EnvProviderOptions {
	/** prepended to the upper-cased flag key. defaults to `"FLAG_"`. */
	prefix?: string;
	/** the environment to read from. defaults to `process.env` — override in tests. */
	env?: Record<string, string | undefined>;
}

const TRUE_VALUES = new Set(["1", "true", "on", "yes"]);
const FALSE_VALUES = new Set(["0", "false", "off", "no"]);

function envVarName(prefix: string, key: string): string {
	return prefix + key.toUpperCase().replace(/[^A-Z0-9]+/g, "_");
}

/**
 * consult `process.env` before the local catalog: `provider: envProvider()`. `"new-ui"` reads
 * `FLAG_NEW_UI` (customize the prefix via `options.prefix`); recognizes `1/true/on/yes` and
 * `0/false/off/no` (case-insensitive), and defers to the local catalog (`undefined`) when the
 * variable is unset or holds anything else — a typo'd value doesn't silently become `false`.
 *
 * for 12-factor deploys that flip a flag via redeploy (no external SaaS, no persisted overrides)
 * — a lighter-weight alternative to a LaunchDarkly/GrowthBook subscription for simple on/off gates.
 */
export function envProvider(options: EnvProviderOptions = {}): FlagProvider {
	const prefix = options.prefix ?? "FLAG_";
	const env = options.env ?? process.env;

	return {
		isEnabled(key) {
			const raw = env[envVarName(prefix, key)];
			if (raw === undefined) return undefined;

			const normalized = raw.trim().toLowerCase();
			if (TRUE_VALUES.has(normalized)) return true;
			if (FALSE_VALUES.has(normalized)) return false;

			return undefined;
		},
	};
}
