import type { ChatMember, ChatMemberAdministrator, Context, Filter } from "@yaebal/core";
import {
	type ChatMemberStatus,
	isGroup as filterIsGroup,
	isPrivate as filterIsPrivate,
} from "@yaebal/filters";
import { resolveMember } from "./member.js";

export type { ChatMemberStatus } from "@yaebal/filters";

/**
 * adapt a synchronous, non-staging `@yaebal/filters` predicate — the "who/where" filters in
 * `peer.ts` (`isPrivate`, `isGroup`, `chatType(...)`, `fromUser(...)`, …) — into a narrowing
 * `bot.guard()` predicate that keeps narrowing (and any properties added upstream by
 * `derive`/`decorate`) no matter how enriched the context already is. only sound for filters
 * that never return a promise and never stage bag data — passing one that does throws instead
 * of silently misbehaving; reach for `bot.filter()` there instead.
 */
export function asGuard<Add extends object>(
	filter: Filter<Context, Add>,
): <C extends Context>(ctx: C) => ctx is C & Add {
	return <C extends Context>(ctx: C): ctx is C & Add => {
		const bag: Record<string, unknown> = {};
		const verdict = filter(ctx, bag);

		if (typeof verdict !== "boolean") {
			throw new TypeError(
				"asGuard: the filter returned a promise. a guard has no bag to commit to once " +
					"it resolves — the update either already moved on (denied) or already ran the " +
					"rest of the chain (allowed) — so an async filter isn't sound here. use " +
					"bot.filter() instead.",
			);
		}

		if (Object.keys(bag).length > 0) {
			throw new TypeError(
				"asGuard: the filter staged bag data (e.g. command()'s ctx.match). a guard only " +
					"gets a boolean back, so that data would be silently dropped. use bot.filter() " +
					"instead, which commits the bag onto ctx.",
			);
		}

		return verdict;
	};
}

/** chat is a private (1:1) chat — narrows `ctx.chat`. adapted from `@yaebal/filters`. */
export const isPrivate = asGuard(filterIsPrivate);

/** chat is a group or supergroup — narrows `ctx.chat`. adapted from `@yaebal/filters`. */
export const isGroup = asGuard(filterIsGroup);

function isAdministrator(member: ChatMember): member is ChatMemberAdministrator {
	return member.status === "administrator";
}

/**
 * the update's user currently holds one of `statuses` in the chat — a live `getChatMember`
 * lookup, not the `chat_member` update payload (see `chatMemberStatus` in `@yaebal/filters`
 * for that). an anonymous admin/owner (see `isAnonymousAdmin`) matches only when `statuses`
 * accepts them under *every* status they could actually hold — telegram never reveals which
 * one — i.e. only when both `"creator"` and `"administrator"` are accepted.
 *
 *   bot.guard(hasMembership("member", "administrator", "creator")).on("message", membersOnly);
 */
export function hasMembership(
	...statuses: readonly ChatMemberStatus[]
): (ctx: Context) => Promise<boolean> {
	if (statuses.length === 0) {
		throw new TypeError(
			"hasMembership(): at least one status is required — an empty list can never match.",
		);
	}

	const wanted = new Set<string>(statuses);
	const allowsAnonymous = wanted.has("creator") && wanted.has("administrator");

	return async (ctx) => {
		const resolution = await resolveMember(ctx);
		if (resolution.kind === "anonymous") return allowsAnonymous;
		return resolution.kind === "member" && wanted.has(resolution.member.status);
	};
}

/**
 * the update's user is the chat's owner or an administrator — one live `getChatMember` call.
 * an anonymous admin/owner always passes (guaranteed to be at least an administrator); a failed
 * lookup denies rather than throwing.
 *
 *   bot.guard(isAdmin).command("ban", banHandler);
 */
export const isAdmin: (ctx: Context) => Promise<boolean> = hasMembership(
	"creator",
	"administrator",
);

/**
 * the update's user is specifically the chat's owner — narrower than `isAdmin`. an anonymous
 * sender never passes: telegram doesn't reveal whether an anonymous poster is the owner or
 * "merely" an administrator, and granting owner-only access on a guess would be wrong half the
 * time.
 */
export const isOwner: (ctx: Context) => Promise<boolean> = hasMembership("creator");

/** administrator privilege flags from `ChatMemberAdministrator` — derived, not hand-maintained. */
export type ChatPermission = Exclude<
	BooleanKeys<ChatMemberAdministrator>,
	"is_anonymous" | "can_be_edited"
>;

type BooleanKeys<T> = { [K in keyof T]-?: T[K] extends boolean | undefined ? K : never }[keyof T];

function memberHasPermission(member: ChatMember, permission: ChatPermission): boolean {
	return member.status === "creator" || (isAdministrator(member) && member[permission] === true);
}

function memberHasAnyPermission(
	member: ChatMember,
	permissions: readonly ChatPermission[],
): boolean {
	return (
		member.status === "creator" ||
		(isAdministrator(member) && permissions.some((permission) => member[permission] === true))
	);
}

function memberHasAllPermissions(
	member: ChatMember,
	permissions: readonly ChatPermission[],
): boolean {
	return (
		member.status === "creator" ||
		(isAdministrator(member) && permissions.every((permission) => member[permission] === true))
	);
}

/** options shared by the permission-checking predicates. */
export interface PermissionOptions {
	/**
	 * treat an anonymous admin/owner (see `isAnonymousAdmin`) as satisfying the permission.
	 * telegram gives bots no id to check their actual flags against for an anonymous sender, so
	 * this is a deliberate widening — off by default, since it can't be verified.
	 */
	allowAnonymous?: boolean;
}

/**
 * the chat owner always passes; an administrator passes when their specific `permission` flag
 * is set; anyone else (including an anonymous admin/owner, unless `allowAnonymous`) fails.
 *
 *   bot.guard(hasPermission("can_restrict_members")).command("ban", banHandler);
 */
export function hasPermission(
	permission: ChatPermission,
	options: PermissionOptions = {},
): (ctx: Context) => Promise<boolean> {
	return async (ctx) => {
		const resolution = await resolveMember(ctx);
		if (resolution.kind === "anonymous") return options.allowAnonymous === true;
		return resolution.kind === "member" && memberHasPermission(resolution.member, permission);
	};
}

/** the owner always passes; an administrator passes when any of `permissions` is set. */
export function hasAnyPermission(
	permissions: readonly ChatPermission[],
	options: PermissionOptions = {},
): (ctx: Context) => Promise<boolean> {
	if (permissions.length === 0) {
		throw new TypeError("hasAnyPermission(): at least one permission is required.");
	}

	return async (ctx) => {
		const resolution = await resolveMember(ctx);
		if (resolution.kind === "anonymous") return options.allowAnonymous === true;
		return resolution.kind === "member" && memberHasAnyPermission(resolution.member, permissions);
	};
}

/** the owner always passes; an administrator passes only when every one of `permissions` is set. */
export function hasAllPermissions(
	permissions: readonly ChatPermission[],
	options: PermissionOptions = {},
): (ctx: Context) => Promise<boolean> {
	if (permissions.length === 0) {
		throw new TypeError("hasAllPermissions(): at least one permission is required.");
	}

	return async (ctx) => {
		const resolution = await resolveMember(ctx);
		if (resolution.kind === "anonymous") return options.allowAnonymous === true;
		return resolution.kind === "member" && memberHasAllPermissions(resolution.member, permissions);
	};
}

/**
 * the bot itself is the chat's owner or an administrator — the mirror of `isAdmin`, for
 * checking the bot's own standing before e.g. `banChatMember`/`pinChatMessage`. `ctx.me` must be
 * known (long polling fills it in after `getMe`); unknown denies.
 *
 *   bot.guard(botIsAdmin).command("pin", pinHandler);
 */
export const botIsAdmin = async (ctx: Context): Promise<boolean> => {
	const resolution = await resolveMember(ctx, ctx.me?.id);
	return (
		resolution.kind === "member" &&
		(resolution.member.status === "creator" || resolution.member.status === "administrator")
	);
};

/**
 * the bot itself has `permission` in the chat — the mirror of `hasPermission`, for checking
 * before an action that needs it (e.g. `can_restrict_members` before `banChatMember`). `ctx.me`
 * must be known; unknown denies.
 *
 *   bot.guard(botHasPermission("can_pin_messages")).command("pin", pinHandler);
 */
export function botHasPermission(permission: ChatPermission): (ctx: Context) => Promise<boolean> {
	return async (ctx) => {
		const resolution = await resolveMember(ctx, ctx.me?.id);
		return resolution.kind === "member" && memberHasPermission(resolution.member, permission);
	};
}
