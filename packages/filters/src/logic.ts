import type { Context, Filter } from "@yaebal/core";
import type { AndAdd, BaseOf, CombinedBase, OrAdd } from "./types.js";

/**
 * the combinators. filters stage their data in a bag instead of touching the
 * context, so combination is safe by construction:
 *
 * - `and` shares one bag left to right — later members see what earlier ones
 *   staged; if any member rejects, the caller discards the bag and nothing
 *   ever reaches the context.
 * - `or` gives every branch a fresh bag and keeps only the winning branch's —
 *   a failed branch can't leave anything behind.
 * - `not` evaluates into a throwaway bag — its inner additions are never wanted.
 *
 * sync filters stay on the sync path (no promise allocation); one async member
 * switches the rest of the walk to await.
 */

/** the loosest filter shape — anything callable as a filter fits. */
type AnyFilter = Filter<never, object>;

/** internal calling shape, once the type-level checks are done. */
type RunFilter = (ctx: Context, bag: Record<string, unknown>) => boolean | Promise<boolean>;

/**
 * matches when every filter matches (evaluated left to right, short-circuits).
 * additions intersect: handlers see everything every member staged. `and()` of
 * nothing matches everything.
 */
export function and<F extends readonly AnyFilter[]>(
	...filters: F
): Filter<CombinedBase<F>, AndAdd<F>> {
	const fns = filters as unknown as readonly RunFilter[];

	const run: RunFilter = (ctx, bag) => {
		const step = (from: number): boolean | Promise<boolean> => {
			for (let i = from; i < fns.length; i++) {
				const filter = fns[i];
				if (filter === undefined) continue;

				const verdict = filter(ctx, bag);
				if (typeof verdict === "boolean") {
					if (!verdict) return false;
					continue;
				}

				const resume = i + 1;
				return verdict.then((ok) => (ok ? step(resume) : false));
			}

			return true;
		};

		return step(0);
	};

	return run as unknown as Filter<CombinedBase<F>, AndAdd<F>>;
}

/**
 * matches when any filter matches (evaluated left to right, short-circuits).
 * additions unite: handlers see the union of what the branches stage — only
 * fields staged by *every* branch are safely typed. `or()` of nothing matches
 * nothing.
 */
export function or<F extends readonly AnyFilter[]>(
	...filters: F
): Filter<CombinedBase<F>, OrAdd<F>> {
	const fns = filters as unknown as readonly RunFilter[];

	const run: RunFilter = (ctx, bag) => {
		const step = (from: number): boolean | Promise<boolean> => {
			for (let i = from; i < fns.length; i++) {
				const filter = fns[i];
				if (filter === undefined) continue;

				const branch: Record<string, unknown> = {};
				const verdict = filter(ctx, branch);

				if (typeof verdict === "boolean") {
					if (verdict) {
						Object.assign(bag, branch);
						return true;
					}
					continue;
				}

				const resume = i + 1;
				return verdict.then((ok) => {
					if (!ok) return step(resume);

					Object.assign(bag, branch);
					return true;
				});
			}

			return false;
		};

		return step(0);
	};

	return run as unknown as Filter<CombinedBase<F>, OrAdd<F>>;
}

/** matches when the filter does NOT match. no additions. */
export function not<F extends AnyFilter>(filter: F): Filter<BaseOf<F>> {
	const fn = filter as unknown as RunFilter;

	const run: RunFilter = (ctx) => {
		const verdict = fn(ctx, {});
		return typeof verdict === "boolean" ? !verdict : verdict.then((ok) => !ok);
	};

	return run as unknown as Filter<BaseOf<F>>;
}
