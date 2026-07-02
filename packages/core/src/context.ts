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
		return this.update.message ?? this.update.edited_message ?? this.update.channel_post;
	}

	get callbackQuery(): CallbackQuery | undefined {
		return this.update.callback_query;
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

		return this.api.sendMessage({ chat_id: chatId, ...resolveText(text), ...extra });
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
