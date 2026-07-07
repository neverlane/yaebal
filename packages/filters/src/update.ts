import {
	type CallbackQuery,
	type ChatMemberUpdated,
	type Context,
	type Filter,
	type InlineQuery,
	matchOf,
} from "@yaebal/core";

/**
 * filters over non-message updates: callback queries, inline queries, edits,
 * chat-member transitions. for plain routing `on("callback_query")` is enough —
 * these earn their keep inside `and`/`or` combinations and when they stage data.
 */

/** callback query whose data equals `trigger`; narrows `ctx.callbackQuery`. */
export function callbackData(trigger: string): Filter<Context, { callbackQuery: CallbackQuery }>;
/** callback query whose data matches `re`; stages `ctx.match`. */
export function callbackData(
	trigger: RegExp,
): Filter<Context, { callbackQuery: CallbackQuery; match: RegExpMatchArray }>;
export function callbackData(
	trigger: string | RegExp,
): Filter<Context, { callbackQuery: CallbackQuery }> {
	return (ctx, bag) => {
		const data = ctx.update.callback_query?.data;
		if (data === undefined) return false;

		if (typeof trigger === "string") return data === trigger;

		const m = matchOf(data, trigger);
		if (!m) return false;

		bag.match = m;
		return true;
	};
}

/** any inline query; stages it as `ctx.inlineQuery`. */
export function inlineQuery(): Filter<Context, { inlineQuery: InlineQuery }>;
/** inline query whose text equals `trigger`. */
export function inlineQuery(trigger: string): Filter<Context, { inlineQuery: InlineQuery }>;
/** inline query whose text matches `re`; also stages `ctx.match`. */
export function inlineQuery(
	trigger: RegExp,
): Filter<Context, { inlineQuery: InlineQuery; match: RegExpMatchArray }>;
export function inlineQuery(
	trigger?: string | RegExp,
): Filter<Context, { inlineQuery: InlineQuery }> {
	return (ctx, bag) => {
		const query = ctx.update.inline_query;
		if (query === undefined) return false;

		if (typeof trigger === "string") {
			if (query.query !== trigger) return false;
		} else if (trigger !== undefined) {
			const m = matchOf(query.query, trigger);
			if (!m) return false;

			bag.match = m;
		}

		bag.inlineQuery = query;
		return true;
	};
}

/** update is an edit (message, channel post or business message). */
export const edited: Filter<Context> = (ctx) =>
	ctx.updateType === "edited_message" ||
	ctx.updateType === "edited_channel_post" ||
	ctx.updateType === "edited_business_message";

/** chat-member statuses (the generated schema keeps `status` a plain string). */
export type ChatMemberStatus =
	| "creator"
	| "administrator"
	| "member"
	| "restricted"
	| "left"
	| "kicked";

export interface ChatMemberChange {
	/** accepted previous status(es) — any, when omitted. */
	from?: ChatMemberStatus | readonly ChatMemberStatus[];
	/** accepted new status(es) — any, when omitted. */
	to?: ChatMemberStatus | readonly ChatMemberStatus[];
}

const statusSet = (
	value: ChatMemberStatus | readonly ChatMemberStatus[] | undefined,
): ReadonlySet<string> | undefined =>
	value === undefined ? undefined : new Set<string>(typeof value === "string" ? [value] : value);

/**
 * a `chat_member`/`my_chat_member` transition, optionally constrained by the
 * old and/or new status; stages the payload as `ctx.chatMember`.
 *
 *   bot.filter(chatMemberStatus({ to: ["member", "administrator"] }), welcome);
 */
export function chatMemberStatus(
	change: ChatMemberChange = {},
): Filter<Context, { chatMember: ChatMemberUpdated }> {
	const oldSet = statusSet(change.from);
	const newSet = statusSet(change.to);

	return (ctx, bag) => {
		const update = ctx.update.chat_member ?? ctx.update.my_chat_member;
		if (update === undefined) return false;

		if (oldSet !== undefined && !oldSet.has(update.old_chat_member.status)) return false;
		if (newSet !== undefined && !newSet.has(update.new_chat_member.status)) return false;

		bag.chatMember = update;
		return true;
	};
}
