import type { Api } from "@yaebal/core";
import type * as t from "@yaebal/types";

/** A friendly reaction: an emoji string, a `{ emoji }` / `{ custom_emoji_id }` shorthand, or a raw `ReactionType`. */
export type ReactionInput =
	| string
	| { emoji: string }
	| { custom_emoji_id: string }
	| t.ReactionType;

function toReaction(r: ReactionInput): t.ReactionType {
	if (typeof r === "string") return { type: "emoji", emoji: r };
	if ("type" in r) return r;
	if ("custom_emoji_id" in r) return { type: "custom_emoji", custom_emoji_id: r.custom_emoji_id };
	return { type: "emoji", emoji: r.emoji };
}

type SendExtra = Omit<t.SendMessageParams, "chat_id" | "text">;
type EditExtra = Omit<t.EditMessageTextParams, "chat_id" | "message_id" | "text">;
type CaptionExtra = Omit<t.EditMessageCaptionParams, "chat_id" | "message_id" | "caption">;
type ReactExtra = Omit<t.SetMessageReactionParams, "chat_id" | "message_id" | "reaction">;
type QuoteExtra = Omit<t.SendMessageParams, "chat_id" | "text" | "reply_parameters">;
type BanExtra = Omit<t.BanChatMemberParams, "chat_id" | "user_id">;
type UnbanExtra = Omit<t.UnbanChatMemberParams, "chat_id" | "user_id">;
type RestrictExtra = Omit<t.RestrictChatMemberParams, "chat_id" | "user_id" | "permissions"> & {
	/** target user — defaults to the sender of this message. */
	user_id?: number;
};

/** Fields every Message-based context carries (merged from the payload). */
interface MessageFields {
	readonly api: Api;
	chat: t.Chat;
	message_id: number;
	from?: t.User;
	business_connection_id?: string;
	message_thread_id?: number;
	direct_messages_topic?: t.DirectMessagesTopic;
}

// biome-ignore lint/suspicious/noExplicitAny: mixin base constructor
type Ctor<T> = abstract new (...args: any[]) => T;

/**
 * on a business message every action has to be routed through the connection, or
 * Telegram performs it as the bot instead of the connected account. shared by every
 * method below — editMessageText/editMessageCaption take business_connection_id too.
 */
function businessRouting(ctx: MessageFields): { business_connection_id?: string } {
	return ctx.business_connection_id === undefined
		? {}
		: { business_connection_id: ctx.business_connection_id };
}

/**
 * full outgoing routing for send/reply: the business connection plus the forum topic /
 * direct-messages topic this message lives in, so a reply doesn't fall back to General.
 * (undefined is dropped by `encodeRequest`, so plain messages are unaffected.)
 */
function routing(ctx: MessageFields): {
	business_connection_id?: string;
	message_thread_id?: number;
	direct_messages_topic_id?: number;
} {
	return {
		...businessRouting(ctx),
		...(ctx.message_thread_id === undefined ? {} : { message_thread_id: ctx.message_thread_id }),
		...(ctx.direct_messages_topic?.topic_id === undefined
			? {}
			: { direct_messages_topic_id: ctx.direct_messages_topic.topic_id }),
	};
}

/** moderation target: the explicit user id, or the sender of this message. */
function targetUser(ctx: MessageFields, userId: number | undefined, method: string): number {
	const id = userId ?? ctx.from?.id;
	if (id === undefined) {
		throw new TypeError(
			`${method}(): no target — update has no \`from\` and no user id was passed`,
		);
	}
	return id;
}

/**
 * Adds the ergonomic positional overloads + convenience getters shared by every
 * Message-based context (message, channel_post, edited_*, business_*). Methods
 * call `this.api.call` directly (so the mixin needs no `super`).
 */
export function MessageSugar<TBase extends Ctor<MessageFields>>(Base: TBase) {
	abstract class Sugared extends Base {
		/** Send a new message to this chat. Pass a string for the common case. */
		send(text: string, params?: SendExtra): Promise<t.Message>;
		send(params: Omit<t.SendMessageParams, "chat_id">): Promise<t.Message>;
		send(a: string | Omit<t.SendMessageParams, "chat_id">, b?: SendExtra): Promise<t.Message> {
			const params = typeof a === "string" ? { text: a, ...b } : a;
			return this.api.call<t.Message>("sendMessage", {
				chat_id: this.chat.id,
				...routing(this),
				...params,
			});
		}

		/** Reply to this message. Pass a string for the common case. */
		reply(text: string, params?: SendExtra): Promise<t.Message>;
		reply(params: Omit<t.SendMessageParams, "chat_id">): Promise<t.Message>;
		reply(a: string | Omit<t.SendMessageParams, "chat_id">, b?: SendExtra): Promise<t.Message> {
			const params = typeof a === "string" ? { text: a, ...b } : a;
			return this.api.call<t.Message>("sendMessage", {
				chat_id: this.chat.id,
				reply_parameters: { message_id: this.message_id },
				...routing(this),
				...params,
			});
		}

		/** Edit this message's text. Pass a string for the common case. */
		editText(text: string, params?: EditExtra): Promise<t.Message | boolean>;
		editText(
			params: Omit<t.EditMessageTextParams, "chat_id" | "message_id">,
		): Promise<t.Message | boolean>;
		editText(
			a: string | Omit<t.EditMessageTextParams, "chat_id" | "message_id">,
			b?: EditExtra,
		): Promise<t.Message | boolean> {
			const params = typeof a === "string" ? { text: a, ...b } : a;
			return this.api.call<t.Message | boolean>("editMessageText", {
				chat_id: this.chat.id,
				message_id: this.message_id,
				...businessRouting(this),
				...params,
			});
		}

		/** Edit this message's caption. Pass a string for the common case. */
		editCaption(caption: string, params?: CaptionExtra): Promise<t.Message | boolean>;
		editCaption(
			params: Omit<t.EditMessageCaptionParams, "chat_id" | "message_id">,
		): Promise<t.Message | boolean>;
		editCaption(
			a: string | Omit<t.EditMessageCaptionParams, "chat_id" | "message_id">,
			b?: CaptionExtra,
		): Promise<t.Message | boolean> {
			const params = typeof a === "string" ? { caption: a, ...b } : a;
			return this.api.call<t.Message | boolean>("editMessageCaption", {
				chat_id: this.chat.id,
				message_id: this.message_id,
				...businessRouting(this),
				...params,
			});
		}

		/** Clear all reactions on this message. */
		react(): Promise<boolean>;
		/** React with a single emoji. */
		react(emoji: string, params?: ReactExtra): Promise<boolean>;
		/** React with a custom emoji (the emoji string is a readable fallback). */
		react(emoji: string, customEmojiId: string, params?: ReactExtra): Promise<boolean>;
		/** React with one or many reactions (emoji / `{ emoji }` / `{ custom_emoji_id }` / raw). */
		react(reactions: ReactionInput | ReactionInput[], params?: ReactExtra): Promise<boolean>;
		/** React with raw `setMessageReaction` params. */
		react(params: Omit<t.SetMessageReactionParams, "chat_id" | "message_id">): Promise<boolean>;
		react(
			a?:
				| string
				| ReactionInput
				| ReactionInput[]
				| Omit<t.SetMessageReactionParams, "chat_id" | "message_id">,
			b?: string | ReactExtra,
			c?: ReactExtra,
		): Promise<boolean> {
			let params: Omit<t.SetMessageReactionParams, "chat_id" | "message_id">;
			if (a === undefined) {
				params = { reaction: [] };
			} else if (typeof a === "string") {
				params =
					typeof b === "string"
						? { reaction: [{ type: "custom_emoji", custom_emoji_id: b }], ...c }
						: { reaction: [{ type: "emoji", emoji: a }], ...b };
			} else if (Array.isArray(a)) {
				params = { reaction: a.map(toReaction), ...(b as ReactExtra) };
			} else if ("emoji" in a || "custom_emoji_id" in a || "type" in a) {
				params = { reaction: [toReaction(a as ReactionInput)], ...(b as ReactExtra) };
			} else {
				params = a;
			}
			return this.api.call<boolean>("setMessageReaction", {
				chat_id: this.chat.id,
				message_id: this.message_id,
				...params,
			});
		}

		/** Send a chat action — the "bot is typing…" indicator. Defaults to `"typing"`. */
		typing(action: t.SendChatActionParams["action"] = "typing"): Promise<boolean> {
			return this.api.call<boolean>("sendChatAction", {
				chat_id: this.chat.id,
				action,
				...routing(this),
			});
		}

		/** Reply quoting a piece of this message's text (`reply_parameters.quote`). */
		quote(quoteText: string, text: string, params?: QuoteExtra): Promise<t.Message> {
			return this.api.call<t.Message>("sendMessage", {
				chat_id: this.chat.id,
				text,
				reply_parameters: { message_id: this.message_id, quote: quoteText },
				...routing(this),
				...params,
			});
		}

		/** Ban a user from this chat. Defaults to the sender of this message. */
		ban(userId?: number, params?: BanExtra): Promise<boolean> {
			return this.api.call<boolean>("banChatMember", {
				chat_id: this.chat.id,
				user_id: targetUser(this, userId, "ban"),
				...params,
			});
		}

		/** Unban a user from this chat. Defaults to the sender of this message. */
		unban(userId?: number, params?: UnbanExtra): Promise<boolean> {
			return this.api.call<boolean>("unbanChatMember", {
				chat_id: this.chat.id,
				user_id: targetUser(this, userId, "unban"),
				...params,
			});
		}

		/** Restrict a user in this chat. The target defaults to the sender of this message. */
		restrict(permissions: t.ChatPermissions, params?: RestrictExtra): Promise<boolean> {
			const { user_id, ...rest } = params ?? {};
			return this.api.call<boolean>("restrictChatMember", {
				chat_id: this.chat.id,
				user_id: targetUser(this, user_id, "restrict"),
				permissions,
				...rest,
			});
		}

		/**
		 * Mute a user (all send permissions off), optionally for `seconds` from now.
		 * The target defaults to the sender of this message.
		 */
		mute(seconds?: number, params?: RestrictExtra): Promise<boolean> {
			return this.restrict(
				{ can_send_messages: false },
				{
					...(seconds === undefined ? {} : { until_date: Math.floor(Date.now() / 1000) + seconds }),
					...params,
				},
			);
		}
	}
	return Sugared;
}
