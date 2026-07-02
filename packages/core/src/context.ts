import type { Api } from "./api.js";
import type { FormatResult } from "./format.js";
import type { MediaSource } from "./media.js";
import type { CallbackQuery, Chat, Message, Update, UpdateName, User } from "./telegram-types.js";

export interface ContextOptions {
	api: Api;
	update: Update;
	updateType: UpdateName;
}

type SendText = string | FormatResult;

function resolveText(text: SendText): { text: string; entities?: FormatResult["entities"] } {
	if (typeof text === "string") return { text };
	return { text: text.text, entities: text.entities };
}

function isFormatResult(value: unknown): value is FormatResult {
	return (
		typeof value === "object" &&
		value !== null &&
		"text" in value &&
		"entities" in value &&
		Array.isArray((value as FormatResult).entities)
	);
}

/** if `extra.caption` is a `FormatResult`, split it into `caption`/`caption_entities`. */
function resolveCaption(extra: Record<string, unknown>): Record<string, unknown> {
	const { caption } = extra;
	if (!isFormatResult(caption)) return extra;

	return { ...extra, caption: caption.text, caption_entities: caption.entities };
}

/**
 * the base context every update is wrapped in. plugins and `derive`/`decorate`
 * enrich it with extra properties; those extras are tracked at the type level
 * by the Composer, so handlers see them without casting.
 */
export class Context {
	readonly api: Api;
	readonly update: Update;
	readonly updateType: UpdateName;

	constructor(options: ContextOptions) {
		this.api = options.api;
		this.update = options.update;
		this.updateType = options.updateType;
	}

	get message(): Message | undefined {
		return (
			this.update.message ??
			this.update.edited_message ??
			this.update.channel_post ??
			this.update.business_message ??
			this.update.edited_business_message
		);
	}

	get callbackQuery(): CallbackQuery | undefined {
		return this.update.callback_query;
	}

	/**
	 * the business connection this update belongs to, if any. `send`/`reply` thread it
	 * into outgoing calls automatically — without it Telegram would deliver the message
	 * as the bot (into the bot's own chat with the user) instead of as the connected
	 * business account.
	 */
	get businessConnectionId(): string | undefined {
		const cbMessage = this.callbackQuery?.message;

		return (
			this.message?.business_connection_id ??
			this.update.deleted_business_messages?.business_connection_id ??
			this.update.business_connection?.id ??
			(cbMessage && "business_connection_id" in cbMessage
				? cbMessage.business_connection_id
				: undefined)
		);
	}

	/** the forum topic this update's message is in, if any — `send`/`reply` stay in it. */
	get messageThreadId(): number | undefined {
		const cbMessage = this.callbackQuery?.message;

		return (
			this.message?.message_thread_id ??
			(cbMessage && "message_thread_id" in cbMessage ? cbMessage.message_thread_id : undefined)
		);
	}

	/** the direct-messages topic (channel DM chat) this update's message is in, if any. */
	get directMessagesTopicId(): number | undefined {
		const cbMessage = this.callbackQuery?.message;

		return (
			this.message?.direct_messages_topic?.topic_id ??
			(cbMessage && "direct_messages_topic" in cbMessage
				? cbMessage.direct_messages_topic?.topic_id
				: undefined)
		);
	}

	get from(): User | undefined {
		return this.message?.from ?? this.callbackQuery?.from;
	}

	get chat(): Chat | undefined {
		return this.message?.chat ?? this.callbackQuery?.message?.chat;
	}

	get text(): string | undefined {
		return this.message?.text ?? this.message?.caption;
	}

	/** narrowing helper in the puregram spirit: `if (ctx.is("callback_query"))`. */
	is(updateType: UpdateName): boolean {
		return this.updateType === updateType;
	}

	/** send a message to the current chat. accepts a plain string or a `format` result. */
	send(text: SendText, extra: Record<string, unknown> = {}): Promise<Message> {
		const chatId = this.chat?.id;
		if (chatId === undefined) {
			return Promise.reject(new Error("send(): no chat in this update"));
		}

		return this.api.sendMessage({
			chat_id: chatId,
			...this.routing(),
			...resolveText(text),
			...extra,
		});
	}

	/**
	 * the business connection this update's message must be routed through, as a spreadable
	 * params fragment — empty object if there isn't one. safe for any method (send or edit).
	 * exposed so plugins that build their own `api.call(...)` params (editMessageText,
	 * deleteMessage, …) get the same routing send/sendPhoto/sendDocument use, instead of
	 * re-deriving it by hand.
	 */
	businessRouting(): Record<string, unknown> {
		const id = this.businessConnectionId;
		return id === undefined ? {} : { business_connection_id: id };
	}

	/**
	 * full outgoing routing for a NEW message: {@link businessRouting} plus the forum /
	 * direct-messages topic this update's message lives in, so a reply doesn't fall back to
	 * General. only send-family methods accept the topic ids — edits don't.
	 */
	routing(): Record<string, unknown> {
		const messageThreadId = this.messageThreadId;
		const directMessagesTopicId = this.directMessagesTopicId;

		return {
			...this.businessRouting(),
			...(messageThreadId === undefined ? {} : { message_thread_id: messageThreadId }),
			...(directMessagesTopicId === undefined
				? {}
				: { direct_messages_topic_id: directMessagesTopicId }),
		};
	}

	/** reply to the triggering message. */
	reply(text: SendText, extra: Record<string, unknown> = {}): Promise<Message> {
		const replyTo = this.message?.message_id;

		return this.send(text, {
			...(replyTo !== undefined ? { reply_parameters: { message_id: replyTo } } : {}),
			...extra,
		});
	}

	/**
	 * send a photo. accepts a {@link MediaSource} or a raw file_id / URL string.
	 * `extra.caption` accepts a plain string or a `format`/`fmt` result.
	 */
	sendPhoto(photo: MediaSource | string, extra: Record<string, unknown> = {}): Promise<Message> {
		const chatId = this.chat?.id;
		if (chatId === undefined)
			return Promise.reject(new Error("sendPhoto(): no chat in this update"));

		return this.api.call<Message>("sendPhoto", {
			chat_id: chatId,
			photo,
			...this.routing(),
			...resolveCaption(extra),
		});
	}

	/**
	 * send a document. accepts a {@link MediaSource} or a raw file_id / URL string.
	 * `extra.caption` accepts a plain string or a `format`/`fmt` result.
	 */
	sendDocument(
		document: MediaSource | string,
		extra: Record<string, unknown> = {},
	): Promise<Message> {
		const chatId = this.chat?.id;
		if (chatId === undefined) {
			return Promise.reject(new Error("sendDocument(): no chat in this update"));
		}

		return this.api.call<Message>("sendDocument", {
			chat_id: chatId,
			document,
			...this.routing(),
			...resolveCaption(extra),
		});
	}

	/** answer the current callback query (no-op if there is none). */
	answerCallbackQuery(extra: Record<string, unknown> = {}): Promise<boolean> {
		const id = this.callbackQuery?.id;
		if (id === undefined) return Promise.resolve(false);

		return this.api.answerCallbackQuery({ callback_query_id: id, ...extra });
	}
}
