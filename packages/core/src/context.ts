import type { Api } from "./api.js";
import { type FormatResult, isFormatResult } from "./format.js";
import { isMediaSource, type MediaSource } from "./media.js";
import type {
	CallbackQuery,
	Chat,
	Message,
	MessageEntity,
	Update,
	UpdateName,
	User,
} from "./telegram-types.js";

export interface ContextOptions {
	api: Api;
	update: Update;
	updateType: UpdateName;
	/** the bot's own account (from `getMe`), when known — long polling fills it in. */
	me?: User;
}

type SendText = string | FormatResult;
/** the object form of `send`/`reply` — full `sendMessage` params minus `chat_id`. */
type SendParams = { text: string } & Record<string, unknown>;

/**
 * the message payload an update carries, straight from the raw update — unlike
 * `ctx.message` this can't be shadowed by enrichment, so filter queries and
 * `command`/`hears` route on what telegram actually sent.
 */
export function messageOf(update: Update): Message | undefined {
	return (
		update.message ??
		update.edited_message ??
		update.channel_post ??
		update.edited_channel_post ??
		update.business_message ??
		update.edited_business_message
	);
}

function resolveText(text: SendText): { text: string; entities?: FormatResult["entities"] } {
	if (typeof text === "string") return { text };
	return { text: text.text, entities: text.entities };
}

/**
 * exactly a `format` result — `{ text, entities }` and nothing else. anything with
 * extra keys is the params-object form of `send`/`reply`, not a formatted text.
 */
function isPureFormatResult(value: object): value is FormatResult {
	return isFormatResult(value) && Object.keys(value).every((k) => k === "text" || k === "entities");
}

/** if `params.text` is a `FormatResult`, split it into `text`/`entities` (mirrors {@link resolveCaption}). */
function resolveTextParam(params: Record<string, unknown>): Record<string, unknown> {
	const { text } = params;
	if (!isFormatResult(text)) return params;

	return { ...params, text: text.text, entities: params.entities ?? text.entities };
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
	/** the bot's own account (from `getMe`), when known — e.g. `command` checks `/cmd@botname` against it. */
	readonly me?: User;

	constructor(options: ContextOptions) {
		this.api = options.api;
		this.update = options.update;
		this.updateType = options.updateType;
		this.me = options.me;
	}

	get message(): Message | undefined {
		return messageOf(this.update);
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

	/** the user this update came from, whatever kind of update carries it. */
	get from(): User | undefined {
		const u = this.update;

		return (
			this.message?.from ??
			u.callback_query?.from ??
			u.inline_query?.from ??
			u.chosen_inline_result?.from ??
			u.shipping_query?.from ??
			u.pre_checkout_query?.from ??
			u.purchased_paid_media?.from ??
			u.my_chat_member?.from ??
			u.chat_member?.from ??
			u.chat_join_request?.from ??
			u.message_reaction?.user ??
			u.poll_answer?.user ??
			u.business_connection?.user
		);
	}

	/** the chat this update happened in, whatever kind of update carries it. */
	get chat(): Chat | undefined {
		const u = this.update;

		return (
			this.message?.chat ??
			u.callback_query?.message?.chat ??
			u.my_chat_member?.chat ??
			u.chat_member?.chat ??
			u.chat_join_request?.chat ??
			u.message_reaction?.chat ??
			u.message_reaction_count?.chat ??
			u.chat_boost?.chat ??
			u.removed_chat_boost?.chat ??
			u.deleted_business_messages?.chat
		);
	}

	/**
	 * the chat that sent this update's message on the user's behalf, if any — an anonymous
	 * admin/owner posting as the group, or an automatic forward from a linked channel. equal
	 * to `ctx.chat.id` for the former, different for the latter (see `@yaebal/guards`'
	 * `isAnonymousAdmin`/`fromLinkedChannel`, which key off this).
	 */
	get senderChat(): Chat | undefined {
		const cbMessage = this.callbackQuery?.message;

		return (
			this.message?.sender_chat ??
			(cbMessage && "sender_chat" in cbMessage ? cbMessage.sender_chat : undefined)
		);
	}

	get text(): string | undefined {
		return this.message?.text ?? this.message?.caption;
	}

	/** entities of `text` — `message.entities` falling back to `message.caption_entities`. */
	get entities(): MessageEntity[] | undefined {
		return this.message?.entities ?? this.message?.caption_entities;
	}

	/** narrowing helper in the puregram spirit: `if (ctx.is("callback_query"))`. */
	is(updateType: UpdateName): boolean {
		return this.updateType === updateType;
	}

	/** send a message to the current chat. accepts a plain string or a `format` result. */
	send(text: SendText, extra?: Record<string, unknown>): Promise<Message>;
	/** object form: full `sendMessage` params (minus `chat_id`) in one object. */
	send(params: SendParams): Promise<Message>;
	send(text: SendText | SendParams, extra: Record<string, unknown> = {}): Promise<Message> {
		const chatId = this.chat?.id;
		if (chatId === undefined) {
			return Promise.reject(new Error("send(): no chat in this update"));
		}

		// params-object form — also what the rich per-update contexts type via their
		// generated overloads, so both forms must hit the same runtime. defaults from
		// `extra` (e.g. reply()'s reply_parameters) lose to explicit params.
		if (typeof text !== "string" && !isPureFormatResult(text)) {
			return this.api.call<Message>("sendMessage", {
				chat_id: chatId,
				...this.routing(),
				...extra,
				...resolveTextParam(text),
			});
		}

		return this.api.call<Message>("sendMessage", {
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
	reply(text: SendText, extra?: Record<string, unknown>): Promise<Message>;
	/** object form: full `sendMessage` params (minus `chat_id`) in one object. */
	reply(params: SendParams): Promise<Message>;
	reply(text: SendText | SendParams, extra: Record<string, unknown> = {}): Promise<Message> {
		const replyTo = this.message?.message_id;

		return this.send(text as SendText, {
			...(replyTo !== undefined ? { reply_parameters: { message_id: replyTo } } : {}),
			...extra,
		});
	}

	/**
	 * send a photo. accepts a {@link MediaSource} or a raw file_id / URL string.
	 * `extra.caption` accepts a plain string or a `format`/`fmt` result.
	 */
	sendPhoto(photo: MediaSource | string, extra?: Record<string, unknown>): Promise<Message>;
	/** object form: full `sendPhoto` params (minus `chat_id`) in one object. */
	sendPhoto(params: { photo: MediaSource | string } & Record<string, unknown>): Promise<Message>;
	sendPhoto(
		photo: MediaSource | string | Record<string, unknown>,
		extra: Record<string, unknown> = {},
	): Promise<Message> {
		const chatId = this.chat?.id;
		if (chatId === undefined)
			return Promise.reject(new Error("sendPhoto(): no chat in this update"));

		// params-object form (typed by the rich contexts' generated overloads)
		if (typeof photo !== "string" && !isMediaSource(photo)) {
			return this.api.call<Message>("sendPhoto", {
				chat_id: chatId,
				...this.routing(),
				...extra,
				...resolveCaption(photo),
			});
		}

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
	sendDocument(document: MediaSource | string, extra?: Record<string, unknown>): Promise<Message>;
	/** object form: full `sendDocument` params (minus `chat_id`) in one object. */
	sendDocument(
		params: { document: MediaSource | string } & Record<string, unknown>,
	): Promise<Message>;
	sendDocument(
		document: MediaSource | string | Record<string, unknown>,
		extra: Record<string, unknown> = {},
	): Promise<Message> {
		const chatId = this.chat?.id;
		if (chatId === undefined) {
			return Promise.reject(new Error("sendDocument(): no chat in this update"));
		}

		// params-object form (typed by the rich contexts' generated overloads)
		if (typeof document !== "string" && !isMediaSource(document)) {
			return this.api.call<Message>("sendDocument", {
				chat_id: chatId,
				...this.routing(),
				...extra,
				...resolveCaption(document),
			});
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

		return this.api.call<boolean>("answerCallbackQuery", { callback_query_id: id, ...extra });
	}
}
