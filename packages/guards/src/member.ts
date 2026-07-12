import type { Chat, ChatMember, Context } from "@yaebal/core";
import { TelegramError } from "@yaebal/core";

/**
 * the live-membership resolver. `resolveMember` is what every membership-based predicate in
 * `./predicates.ts` calls into — it centralizes the anonymous-sender short-circuit and the
 * "what counts as a legitimate deny vs. a real failure" decision so those don't get
 * re-implemented (and re-drifted) per predicate.
 */

/**
 * decoration key `membership()` (`./membership.ts`) installs on `ctx` — an implementation seam,
 * not something call sites are expected to read directly. exported (like `@yaebal/throttle`'s
 * `THROTTLE_CONTROL`) for advanced interop: building a predicate that needs to know whether a
 * cache is active, or a test harness that wants to install a fake one.
 */
export const GUARDS_CACHE = Symbol.for("@yaebal/guards/cache");

/** what `membership()` decorates onto `ctx` under {@link GUARDS_CACHE}. */
export interface GuardsCache {
	/** resolve one lookup, cached or not — throws exactly like `ctx.api.getChatMember` would. */
	get(ctx: Context, chatId: number, userId: number): Promise<ChatMember>;
}

type WithGuardsCache = { [GUARDS_CACHE]?: GuardsCache };

/**
 * the outcome of a membership lookup:
 * - `"member"` — a real `getChatMember` result.
 * - `"anonymous"` — the sender posted as the chat itself (an anonymous admin/owner). telegram
 *   gives bots no id to look up in this case, so there is no `ChatMember` to return — see
 *   {@link isAnonymousAdmin}.
 * - `"none"` — no chat/user on the update, the bot can't see the chat, or the user isn't a
 *   member — a legitimate deny.
 */
export type MemberResolution =
	| { kind: "member"; member: ChatMember }
	| { kind: "anonymous" }
	| { kind: "none" };

/**
 * the update's sender posted as the chat itself — an anonymous admin or owner. telegram routes
 * these with `from` set to the `GroupAnonymousBot` account and `sender_chat` equal to the chat,
 * so a plain `getChatMember(chat_id, from.id)` would look up the wrong "user" and 400. narrows
 * `ctx.chat` to a group/supergroup (only chat kinds anonymous posting exists in).
 */
export function isAnonymousAdmin(
	ctx: Context,
): ctx is Context & { chat: Chat & { type: "group" | "supergroup" } } {
	const chat = ctx.chat;
	return (
		chat !== undefined &&
		(chat.type === "group" || chat.type === "supergroup") &&
		ctx.senderChat?.id === chat.id
	);
}

/**
 * the update is an automatic forward from a channel linked to this group (a channel post
 * mirrored into its discussion group). `ctx.senderChat` is the *channel*, distinct from
 * `ctx.chat` — unlike {@link isAnonymousAdmin}, where they're equal.
 */
export function fromLinkedChannel(ctx: Context): boolean {
	const chat = ctx.chat;
	return chat !== undefined && ctx.senderChat !== undefined && ctx.senderChat.id !== chat.id;
}

async function fetchMember(
	ctx: Context,
	chatId: number,
	userId: number,
): Promise<ChatMember | undefined> {
	const cache = (ctx as unknown as WithGuardsCache)[GUARDS_CACHE];

	try {
		return cache
			? await cache.get(ctx, chatId, userId)
			: await ctx.api.getChatMember({ chat_id: chatId, user_id: userId });
	} catch (error) {
		// a real "no" from telegram (user not found, bot not in the chat, …) — deny.
		if (error instanceof TelegramError) return undefined;

		// anything else (a network failure, a malformed response, a bug) is not a deny —
		// surfacing it beats a permission check that quietly fails open^Wclosed and looks
		// like a permissions bug forever. `membership()`'s `onError` observes cache-layer
		// failures on the same path; this still throws through to the caller either way.
		throw error;
	}
}

/**
 * resolve `userId`'s (default: the update's sender, `ctx.from`) current standing in the
 * update's chat. reads through `membership()`'s cache when installed (see {@link GUARDS_CACHE}),
 * otherwise calls `ctx.api.getChatMember` directly — every predicate in `./predicates.ts` works
 * either way, with or without the plugin.
 */
export async function resolveMember(
	ctx: Context,
	userId: number | undefined = ctx.from?.id,
): Promise<MemberResolution> {
	const chat = ctx.chat;
	if (chat === undefined || userId === undefined) return { kind: "none" };

	if (userId === ctx.from?.id && isAnonymousAdmin(ctx)) return { kind: "anonymous" };

	const member = await fetchMember(ctx, chat.id, userId);
	return member === undefined ? { kind: "none" } : { kind: "member", member };
}
