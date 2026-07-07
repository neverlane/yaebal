import type { Context, Filter } from "@yaebal/core";

/**
 * type plumbing for the combinators. a `Filter<C, Add>` carries `Add` in its
 * type-level `"~adds"` marker; these helpers pull the pieces back out so
 * `and` / `or` can compute the combined context and additions for any number
 * of filters — no fixed-arity overloads.
 */

/** what a filter stages/narrows — read from the type-level `"~adds"` carrier. */
export type AddOf<F> = F extends { readonly "~adds"?: infer A extends object }
	? A
	: Record<never, never>;

/** the context a filter requires. */
export type BaseOf<F> = F extends Filter<infer C, object> ? C : never;

export type UnionToIntersection<U> = (U extends unknown ? (k: U) => void : never) extends (
	k: infer I,
) => void
	? I
	: never;

/** collapse a computed addition into a valid `object` (empty combinators, bare predicates). */
type CleanAdd<A> = [A] extends [never]
	? Record<never, never>
	: [A] extends [object]
		? A
		: Record<never, never>;

/** collapse a computed base back onto `Context` when nothing narrower is known. */
type CleanBase<B> = [B] extends [never] ? Context : B extends Context ? B : Context;

/** the context an `and`/`or` of `F` requires: every member's requirement at once. */
export type CombinedBase<F extends readonly unknown[]> = CleanBase<
	UnionToIntersection<BaseOf<F[number]>>
>;

/** what an `and` of `F` adds: every member's additions at once. */
export type AndAdd<F extends readonly unknown[]> = CleanAdd<UnionToIntersection<AddOf<F[number]>>>;

/**
 * what an `or` of `F` adds: the union of the branches' additions (the matched
 * branch is unknown at compile time — mtcute types `or` the same way). when
 * every branch stages the same field, the union collapses and the field is
 * simply available.
 */
export type OrAdd<F extends readonly unknown[]> = CleanAdd<AddOf<F[number]>>;

/**
 * author a custom filter with a typed bag: stage every field of `Add` in `bag`
 * before returning `true`, and it lands on the context — typed — once the whole
 * filter tree matches. sync or async.
 *
 *   const vip = defineFilter<{ profile: Profile }>(async (ctx, bag) => {
 *     const profile = await db.profile(ctx.from?.id);
 *     if (!profile?.vip) return false;
 *     bag.profile = profile;
 *     return true;
 *   });
 *   bot.filter(vip, (ctx) => ctx.profile); // typed
 */
export function defineFilter<
	Add extends object = Record<never, never>,
	C extends Context = Context,
>(fn: (ctx: C, bag: Add) => boolean | Promise<boolean>): Filter<C, Add> {
	return fn as unknown as Filter<C, Add>;
}
