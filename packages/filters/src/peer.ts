import type { Chat, Context, Filter, User } from "@yaebal/core";

/**
 * who/where filters. all of them read `ctx.from` / `ctx.chat`, which cover
 * every update kind that carries a user or a chat (messages, callback and
 * inline queries, member updates, join requests, reactions, boosts, …).
 */

/** match numeric ids and `@usernames` (case-insensitive, `@` optional). */
export function idMatcher(
	ids: readonly (number | string)[],
): (peer: { id: number; username?: string }) => boolean {
	const byId = new Set<number>();
	const byUsername = new Set<string>();

	for (const id of ids) {
		if (typeof id === "number") byId.add(id);
		else byUsername.add(id.replace(/^@/, "").toLowerCase());
	}

	return (peer) =>
		byId.has(peer.id) ||
		(peer.username !== undefined && byUsername.has(peer.username.toLowerCase()));
}

/** chat is one of the given types; narrows `ctx.chat` to them. */
export function chatType<T extends Chat["type"]>(
	...types: readonly T[]
): Filter<Context, { chat: Chat & { type: T } }> {
	return (ctx) => {
		const type = ctx.chat?.type;
		return type !== undefined && (types as readonly string[]).includes(type);
	};
}

export const isPrivate: Filter<Context, { chat: Chat & { type: "private" } }> = chatType("private");

export const isGroup: Filter<Context, { chat: Chat & { type: "group" | "supergroup" } }> = chatType(
	"group",
	"supergroup",
);

export const isChannel: Filter<Context, { chat: Chat & { type: "channel" } }> = chatType("channel");

/** chat is a forum supergroup (has topics). */
export const isForum: Filter<Context, { chat: Chat & { is_forum: true } }> = (ctx) =>
	ctx.chat?.is_forum === true;

/** update is in one of the given chats — by id or `@username`. */
export function chatId(...ids: (number | string)[]): Filter<Context, { chat: Chat }> {
	const matches = idMatcher(ids);
	return (ctx) => ctx.chat !== undefined && matches(ctx.chat);
}

/** update is from one of the given users — by id or `@username`. */
export function fromUser(...ids: (number | string)[]): Filter<Context, { from: User }> {
	const matches = idMatcher(ids);
	return (ctx) => ctx.from !== undefined && matches(ctx.from);
}

/** update is from a bot. */
export const fromBot: Filter<Context, { from: User & { is_bot: true } }> = (ctx) =>
	ctx.from?.is_bot === true;

/** update is from a Telegram Premium user. */
export const isPremium: Filter<Context, { from: User & { is_premium: true } }> = (ctx) =>
	ctx.from?.is_premium === true;
