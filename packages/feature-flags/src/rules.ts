import type {
	DateLike,
	FlagDefinition,
	FlagEvalContext,
	TargetingConditions,
	Variant,
	VariantDefinition,
	VariantRule,
} from "./types.js";

/** fnv-1a, mapped to [0, 10000) — stable across processes/runs, unlike `Math.random`. */
export function bucketOf(input: string): number {
	let hash = 0x811c9dc5;
	for (let i = 0; i < input.length; i++) {
		hash ^= input.charCodeAt(i);
		hash = Math.imul(hash, 0x01000193);
	}
	return (hash >>> 0) % 10000;
}

/** coerce a `Date | string | number` (catalogs loaded from json/env give strings) to a `Date`. */
export function coerceDate(input: DateLike): Date {
	return input instanceof Date ? input : new Date(input);
}

/** the bucket identity a rule's `percentage`/variant hash is computed against. */
export function defaultBucketId(evalContext: FlagEvalContext): string {
	return String(evalContext.userId ?? evalContext.chatId ?? "anonymous");
}

/** every condition on `rule` must hold (AND) for it to match — shared by boolean and variant rules. */
export function targetingMatches(rule: TargetingConditions, evalContext: FlagEvalContext): boolean {
	if (rule.userIds !== undefined) {
		const id = evalContext.userId ?? evalContext.chatId;
		if (id === undefined || !rule.userIds.some((allowed) => String(allowed) === String(id))) {
			return false;
		}
	}

	if (rule.chatIds !== undefined) {
		if (
			evalContext.chatId === undefined ||
			!rule.chatIds.some((allowed) => String(allowed) === String(evalContext.chatId))
		) {
			return false;
		}
	}

	if (rule.chatTypes !== undefined) {
		if (evalContext.chatType === undefined || !rule.chatTypes.includes(evalContext.chatType)) {
			return false;
		}
	}

	if (rule.languageCodes !== undefined) {
		if (
			evalContext.languageCode === undefined ||
			!rule.languageCodes.includes(evalContext.languageCode)
		) {
			return false;
		}
	}

	if (rule.premiumOnly === true && evalContext.isPremium !== true) return false;

	const now = evalContext.now ?? new Date();
	if (rule.from !== undefined && now < coerceDate(rule.from)) return false;
	if (rule.to !== undefined && now >= coerceDate(rule.to)) return false;

	return true;
}

/** whether a boolean-flag rule matches: shared targeting plus its own `percentage` bucket. */
function ruleMatches(
	rule: TargetingConditions & { percentage?: number },
	key: string,
	bucketId: string,
	evalContext: FlagEvalContext,
): boolean {
	if (rule.percentage !== undefined && bucketOf(`${key}:${bucketId}`) >= rule.percentage * 100) {
		return false;
	}

	return targetingMatches(rule, evalContext);
}

/** the outcome of a local evaluation, plus whether a rule decided it (vs. falling through). */
export interface LocalResult<T> {
	value: T;
	matchedRule: boolean;
}

/**
 * evaluate a boolean flag's rules against `default`. rules are checked in the given order;
 * the first match's `value` (default `true`) wins. no match falls through to `default`.
 */
export function evaluateLocal(
	definition: FlagDefinition,
	key: string,
	evalContext: FlagEvalContext,
): LocalResult<boolean> {
	const bucketId = defaultBucketId(evalContext);

	for (const rule of definition.rules ?? []) {
		if (ruleMatches(rule, key, bucketId, evalContext)) {
			return { value: rule.value ?? true, matchedRule: true };
		}
	}

	return { value: definition.default, matchedRule: false };
}

/**
 * evaluate a multivariate flag: the first matching {@link VariantRule} forces its `value`;
 * otherwise a weighted variant is picked deterministically from the same per-flag bucket hash
 * used by percentage rollout, so a bucket's variant assignment never changes across calls.
 */
export function pickVariant<T>(
	definition: VariantDefinition<T>,
	key: string,
	evalContext: FlagEvalContext,
): LocalResult<T> {
	const bucketId = defaultBucketId(evalContext);

	for (const rule of definition.rules ?? []) {
		if (targetingMatches(rule, evalContext)) return { value: rule.value, matchedRule: true };
	}

	const value = pickWeighted(
		definition.variants,
		bucketOf(`${key}:${bucketId}`),
		definition.default,
	);
	return { value, matchedRule: false };
}

/** pick from `variants` by a `[0, 10000)` hash, weighted proportionally. falls back to `fallback` if the weights sum to 0. */
function pickWeighted<T>(variants: readonly Variant<T>[], hash: number, fallback: T): T {
	const total = variants.reduce((sum, v) => sum + Math.max(0, v.weight), 0);
	if (total <= 0) return fallback;

	const target = (hash / 10000) * total;
	let cumulative = 0;
	for (const variant of variants) {
		cumulative += Math.max(0, variant.weight);
		if (target < cumulative) return variant.value;
	}

	// `total > 0` guarantees at least one positive-weight variant, so this is unreachable in
	// practice (`validateCatalog` rejects all-zero weights) — `fallback` only guards `noUncheckedIndexedAccess`.
	const last = variants[variants.length - 1];
	return last === undefined ? fallback : last.value;
}
