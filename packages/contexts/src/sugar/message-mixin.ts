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

/** Fields every Message-based context carries (merged from the payload). */
interface MessageFields {
	readonly api: Api;
	chat: t.Chat;
	message_id: number;
	from?: t.User;
}

// biome-ignore lint/suspicious/noExplicitAny: mixin base constructor
type Ctor<T> = abstract new (...args: any[]) => T;

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
			return this.api.call<t.Message>("sendMessage", { chat_id: this.chat.id, ...params });
		}

		/** Reply to this message. Pass a string for the common case. */
		reply(text: string, params?: SendExtra): Promise<t.Message>;
		reply(params: Omit<t.SendMessageParams, "chat_id">): Promise<t.Message>;
		reply(a: string | Omit<t.SendMessageParams, "chat_id">, b?: SendExtra): Promise<t.Message> {
			const params = typeof a === "string" ? { text: a, ...b } : a;
			return this.api.call<t.Message>("sendMessage", {
				chat_id: this.chat.id,
				reply_parameters: { message_id: this.message_id },
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
	}
	return Sugared;
}
