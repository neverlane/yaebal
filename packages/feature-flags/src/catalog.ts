import { coerceDate } from "./rules.js";
import type {
	FlagConfig,
	FlagDefinition,
	FlagsCatalog,
	RolloutRule,
	TargetingConditions,
	VariantDefinition,
	VariantRule,
} from "./types.js";

/** whether a catalog entry is a {@link VariantDefinition} — distinguished structurally by `variants`. */
export function isVariantDefinition(config: FlagConfig): config is VariantDefinition<unknown> {
	return typeof config === "object" && config !== null && "variants" in config;
}

/** normalize a boolean-flag entry (`boolean` or `FlagDefinition`) to a `FlagDefinition`. */
export function normalizeDefinition(config: FlagConfig): FlagDefinition {
	return typeof config === "boolean" ? { default: config } : (config as FlagDefinition);
}

function hasTargetingCondition(rule: TargetingConditions): boolean {
	return (
		rule.userIds !== undefined ||
		rule.chatIds !== undefined ||
		rule.chatTypes !== undefined ||
		rule.languageCodes !== undefined ||
		rule.premiumOnly !== undefined ||
		rule.from !== undefined ||
		rule.to !== undefined
	);
}

function validateDateWindow(rule: TargetingConditions, label: string): void {
	if (rule.from === undefined || rule.to === undefined) return;
	if (coerceDate(rule.from) >= coerceDate(rule.to)) {
		throw new Error(
			`feature-flags: ${label} has \`from\` at/after \`to\` — this rule can never match`,
		);
	}
}

function valuesEqual(a: unknown, b: unknown): boolean {
	return a === b || JSON.stringify(a) === JSON.stringify(b);
}

function validateRolloutRule(rule: RolloutRule, label: string): void {
	if (rule.percentage === undefined && !hasTargetingCondition(rule)) {
		throw new Error(
			`feature-flags: ${label} has no condition set (percentage/userIds/chatIds/chatTypes/` +
				`languageCodes/premiumOnly/from/to) — it would match every bucket unconditionally`,
		);
	}

	if (rule.percentage !== undefined && (rule.percentage < 0 || rule.percentage > 100)) {
		throw new Error(
			`feature-flags: ${label} has percentage ${rule.percentage}, expected a value in [0, 100]`,
		);
	}

	validateDateWindow(rule, label);
}

function validateVariantRule(rule: VariantRule<unknown>, label: string): void {
	if (!hasTargetingCondition(rule)) {
		throw new Error(
			`feature-flags: ${label} has no condition set (userIds/chatIds/chatTypes/languageCodes/` +
				`premiumOnly/from/to) — it would force its value for every bucket unconditionally`,
		);
	}

	validateDateWindow(rule, label);
}

function validateVariantDefinition(definition: VariantDefinition<unknown>, key: string): void {
	if (definition.variants.length === 0) {
		throw new Error(`feature-flags: flag ${JSON.stringify(key)} has an empty \`variants\` list`);
	}

	let totalWeight = 0;
	for (const variant of definition.variants) {
		if (!Number.isFinite(variant.weight) || variant.weight < 0) {
			throw new Error(
				`feature-flags: flag ${JSON.stringify(key)} has a variant with invalid weight ` +
					`${variant.weight} — weights must be finite and non-negative`,
			);
		}
		totalWeight += variant.weight;
	}

	if (totalWeight <= 0) {
		throw new Error(
			`feature-flags: flag ${JSON.stringify(key)} has variants that all weigh 0 — none could ever be picked`,
		);
	}

	if (!definition.variants.some((variant) => valuesEqual(variant.value, definition.default))) {
		throw new Error(
			`feature-flags: flag ${JSON.stringify(key)}'s \`default\` (${JSON.stringify(definition.default)}) ` +
				"is not among its `variants` — the default should be reachable, not just a fallback value",
		);
	}

	definition.rules?.forEach((rule, i) => {
		validateVariantRule(rule, `flag ${JSON.stringify(key)}'s rules[${i}]`);
	});
}

function validateFlagDefinition(definition: FlagDefinition, key: string): void {
	definition.rules?.forEach((rule, i) => {
		validateRolloutRule(rule, `flag ${JSON.stringify(key)}'s rules[${i}]`);
	});
}

/**
 * validate a flag catalog up front (thrown at `featureFlags()`/`createFlags()` construction time,
 * not on first `isEnabled` call) — a malformed rule (`percentage: 150`, an empty `{}` rule that
 * would match every bucket, `from` after `to`, variants that all weigh 0, a `default` that isn't
 * one of its own `variants`) is a configuration bug, not a runtime condition to silently accept.
 */
export function validateCatalog(flags: FlagsCatalog): void {
	for (const key of Object.keys(flags)) {
		const config = flags[key] as FlagConfig;
		if (typeof config === "boolean") continue;

		if (isVariantDefinition(config)) {
			validateVariantDefinition(config, key);
		} else {
			validateFlagDefinition(config as FlagDefinition, key);
		}
	}
}
