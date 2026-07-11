import { Composer, type Context } from "@yaebal/core";
import type {
	BooleanFlagKeys,
	FlagsCatalog,
	FlagsControl,
	FlagValue,
	VariantFlagKeys,
} from "./types.js";

/** the context shape `flagGuard`/`variantGuard`/`whenFlag` require — installed by `featureFlags()`. */
export interface FlagsContext<F extends FlagsCatalog = FlagsCatalog> extends Context {
	flags: FlagsControl<F>;
}

/**
 * `bot.guard(flagGuard("new-ui"))` — continue only while `key` is enabled, for everything
 * registered after it *in this composer*. for a self-contained branch that doesn't depend on
 * registration order, use {@link whenFlag}.
 */
export function flagGuard<F extends FlagsCatalog, K extends BooleanFlagKeys<F>>(
	key: K,
): (ctx: FlagsContext<F>) => Promise<boolean> {
	return (ctx) => ctx.flags.isEnabled(key);
}

/** `bot.guard(variantGuard("checkout", "v2"))` — continue only while `key` resolves to exactly `value`. */
export function variantGuard<F extends FlagsCatalog, K extends VariantFlagKeys<F>>(
	key: K,
	value: FlagValue<F, K>,
): (ctx: FlagsContext<F>) => Promise<boolean> {
	return async (ctx) => (await ctx.flags.getVariant(key)) === value;
}

/**
 * scope a group of handlers to a boolean flag, no `if` required in each one:
 *
 * ```ts
 * bot.install(whenFlag("new-ui", (branch) => branch.command("beta", (ctx) => ctx.reply("welcome"))));
 * ```
 *
 * unlike `bot.guard()` — which gates everything registered afterward *in the same composer*,
 * order-dependently — `whenFlag` builds an isolated branch (via `Composer.filter`) up front, so
 * where in the chain you install it doesn't matter, and handlers outside the branch are unaffected.
 */
export function whenFlag<F extends FlagsCatalog, K extends BooleanFlagKeys<F>>(
	key: K,
	build: (branch: Composer<FlagsContext<F>>) => Composer<FlagsContext<F>>,
): (composer: Composer<FlagsContext<F>>) => Composer<FlagsContext<F>> {
	return (composer) => {
		const branch = build(new Composer<FlagsContext<F>>());
		return composer.filter((ctx) => ctx.flags.isEnabled(key), branch.toMiddleware());
	};
}
