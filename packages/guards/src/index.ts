import type { ChatMember, ChatMemberAdministrator, Context, Filter } from "@yaebal/core";
import {
	type ChatMemberStatus,
	isGroup as filterIsGroup,
	isPrivate as filterIsPrivate,
} from "@yaebal/filters";

export type { ChatMemberStatus } from "@yaebal/filters";

/**
 * @yaebal/guards — reusable `bot.guard()` predicates so "is this user allowed" checks aren't
 * hand-rolled per project: `isPrivate`/`isGroup` reuse `@yaebal/filters`' chat-type filters,
 * `isAdmin`/`hasMembership`/`hasPermission` do a live `getChatMember` lookup.
 *
 *   bot.guard(isAdmin).command("ban", banHandler);
 *
 * every predicate here also fits `Filter<Context>`'s call shape (`(ctx) => boolean |
 * Promise<boolean>`), so they compose with `@yaebal/filters`' `and`/`or`/`not` too:
 *
 *   bot.filter(and(isGroup, isAdmin), (ctx) => ctx.reply("welcome, admin"));
 */

/**
 * adapt a synchronous, non-staging `@yaebal/filters` predicate — the "who/where" filters in
 * `peer.ts` (`isPrivate`, `isGroup`, `chatType(...)`, `fromUser(...)`, …) — into a narrowing
 * `bot.guard()` predicate. only sound for filters that never return a promise and never stage
 * bag data; filters that do either (e.g. `regex`, `command`) belong on `bot.filter()` instead.
 */
export function asGuard<C extends Context, Add extends object>(
	filter: Filter<C, Add>,
): (ctx: C) => ctx is C & Add {
	return (ctx): ctx is C & Add => filter(ctx, {}) === true;
}

/** chat is a private (1:1) chat — narrows `ctx.chat`. adapted from `@yaebal/filters`. */
export const isPrivate = asGuard(filterIsPrivate);

/** chat is a group or supergroup — narrows `ctx.chat`. adapted from `@yaebal/filters`. */
export const isGroup = asGuard(filterIsGroup);

async function getMember(ctx: Context): Promise<ChatMember | undefined> {
	if (ctx.chat === undefined || ctx.from === undefined) return undefined;

	try {
		return await ctx.api.getChatMember({ chat_id: ctx.chat.id, user_id: ctx.from.id });
	} catch {
		return undefined;
	}
}

function isAdministrator(member: ChatMember): member is ChatMemberAdministrator {
	return member.status === "administrator";
}

/**
 * the update's user is the chat's owner or an administrator — one live `getChatMember` call.
 * a failed lookup (no chat/user on the update, or the bot can't see the chat) denies access
 * rather than throwing.
 *
 *   bot.guard(isAdmin).command("ban", banHandler);
 */
export const isAdmin = async (ctx: Context): Promise<boolean> => {
	const member = await getMember(ctx);
	return member !== undefined && (member.status === "creator" || member.status === "administrator");
};

/**
 * the update's user currently holds one of `statuses` in the chat — a live `getChatMember`
 * lookup, not the `chat_member` update payload (see `chatMemberStatus` in `@yaebal/filters`
 * for that).
 *
 *   bot.guard(hasMembership("member", "administrator", "creator")).on("message", membersOnly);
 */
export function hasMembership(
	...statuses: readonly ChatMemberStatus[]
): (ctx: Context) => Promise<boolean> {
	const wanted = new Set<string>(statuses);

	return async (ctx) => {
		const member = await getMember(ctx);
		return member !== undefined && wanted.has(member.status);
	};
}

type BooleanKeys<T> = { [K in keyof T]-?: T[K] extends boolean | undefined ? K : never }[keyof T];

/** administrator privilege flags from `ChatMemberAdministrator` — derived, not hand-maintained. */
export type ChatPermission = Exclude<
	BooleanKeys<ChatMemberAdministrator>,
	"is_anonymous" | "can_be_edited"
>;

/**
 * the chat owner always passes; an administrator passes when their specific `permission` flag
 * is set; anyone else fails.
 *
 *   bot.guard(hasPermission("can_restrict_members")).command("ban", banHandler);
 */
export function hasPermission(permission: ChatPermission): (ctx: Context) => Promise<boolean> {
	return async (ctx) => {
		const member = await getMember(ctx);
		if (member === undefined) return false;
		if (member.status === "creator") return true;

		return isAdministrator(member) && member[permission] === true;
	};
}
