import type { Context } from "@yaebal/core";

/** one session per chat — in a group, every member shares (and can steer) the same conversation. */
export const perChat = (ctx: Context): string | undefined => {
	const chat = ctx.chat?.id;
	return chat === undefined ? undefined : String(chat);
};

/** one session per user, following them across every chat they use the bot in. */
export const perUser = (ctx: Context): string | undefined => {
	const from = ctx.from?.id;
	return from === undefined ? undefined : String(from);
};

/**
 * one session per user *per chat* — the default. safe in groups (each member gets their own
 * conversation) and doesn't follow a user between an unrelated private chat and a group.
 */
export const perChatUser = (ctx: Context): string | undefined => {
	const chat = ctx.chat?.id;
	if (chat === undefined) return undefined;

	const from = ctx.from?.id;
	return from === undefined ? String(chat) : `${chat}:${from}`;
};
