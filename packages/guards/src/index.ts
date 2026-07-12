/**
 * @yaebal/guards — reusable `bot.guard()` predicates so "is this user allowed" checks aren't
 * hand-rolled per project: `isPrivate`/`isGroup` reuse `@yaebal/filters`' chat-type filters,
 * `isAdmin`/`hasMembership`/`hasPermission`/… do a live `getChatMember` lookup, `membership()`
 * caches that lookup with event-driven invalidation, and `guardOr` answers a denied check
 * instead of silently dropping it.
 *
 *   bot.install(membership())
 *      .use(guardOr(isAdmin, (ctx) => ctx.reply("admins only")))
 *      .command("ban", banHandler);
 *
 * every predicate here also fits `Filter<Context>`'s call shape (`(ctx) => boolean |
 * Promise<boolean>`), so they compose with `@yaebal/filters`' `and`/`or`/`not` too:
 *
 *   bot.filter(and(isGroup, isAdmin), (ctx) => ctx.reply("welcome, admin"));
 *
 * @see https://github.com/neverlane/yaebal/tree/main/packages/guards
 */

export { guardOr } from "./guard-or.js";
export {
	fromLinkedChannel,
	GUARDS_CACHE,
	type GuardsCache,
	isAnonymousAdmin,
	type MemberResolution,
	resolveMember,
} from "./member.js";
export { type MembershipOptions, type MembershipPlugin, membership } from "./membership.js";
export {
	asGuard,
	botHasPermission,
	botIsAdmin,
	type ChatMemberStatus,
	type ChatPermission,
	hasAllPermissions,
	hasAnyPermission,
	hasMembership,
	hasPermission,
	isAdmin,
	isGroup,
	isOwner,
	isPrivate,
	type PermissionOptions,
} from "./predicates.js";
