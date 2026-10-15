import type { Context, FormatResult, Plugin } from "@yaebal/core";
import type {
	Chat,
	EditEphemeralMessageCaptionParams,
	EditEphemeralMessageMediaParams,
	EditEphemeralMessageTextParams,
	EphemeralMessageParameters,
	InlineKeyboardMarkup,
	InputMedia,
	InputMediaVoiceNote,
	InputRichMessage,
	Message,
	SendMessageParams,
} from "@yaebal/types";

/** the same plain/formatted text accepted by core's send/reply helpers. */
export type EphemeralText = string | FormatResult;
/** structural support for @yaebal/rich's RichDocument without a plugin dependency. */
export type EphemeralRichSource = InputRichMessage | { toInputRichMessage(): InputRichMessage };
export type EphemeralMedia = InputMedia | InputMediaVoiceNote;
export type EphemeralContent =
	| EphemeralText
	| { rich_message: EphemeralRichSource }
	| { media: EphemeralMedia };
type Markup = InlineKeyboardMarkup | { toJSON(): InlineKeyboardMarkup };
type Address = "chat_id" | "receiver_user_id" | "ephemeral_message_id";
type WithMarkup<T> = Omit<T, "reply_markup"> & { reply_markup?: Markup };
export type EphemeralSendOptions = WithMarkup<
	Omit<SendMessageParams, "chat_id" | "text" | "ephemeral_message_parameters" | "reply_markup">
> & {
	/** the recipient is always supplied by the helper. */
	ephemeral_message_parameters?: Omit<EphemeralMessageParameters, "receiver_user_id">;
};
export type EphemeralEditOptions = WithMarkup<
	Omit<EditEphemeralMessageTextParams, Address | "text" | "rich_message">
>;
export type EphemeralCaptionOptions = WithMarkup<
	Omit<EditEphemeralMessageCaptionParams, Address | "caption">
>;
export type EphemeralMediaOptions = WithMarkup<
	Omit<EditEphemeralMessageMediaParams, Address | "media">
>;

export interface EphemeralApi {
	call<T = unknown>(method: string, params?: Record<string, unknown>): Promise<T>;
}
/**
 * private chats: "message" (default) sends a normal message behind the same handle;
 * "error" rejects. channels always reject, because a normal channel post is public.
 */
export type EphemeralFallback = "message" | "error";
/**
 * "throw" (default) rethrows expired edits; "ignore" resolves false; "resend" sends
 * known content again and retargets the handle. recovery never repeats an old callback
 * replacement or a reply to an expired command.
 */
export type EphemeralExpiredAction = "throw" | "ignore" | "resend";
export interface EphemeralOptions {
	/** private-chat policy. default "message". */
	fallback?: EphemeralFallback;
	/** expired-edit policy. default "throw". */
	onExpired?: EphemeralExpiredAction;
	/** override the message-related 400 detector when telegram's wording changes. */
	isExpiredError?: (error: unknown) => boolean;
}

/**
 * a short-lived handle. never persist it or its ids: telegram may reuse them after
 * expiry. delivery and edits are best-effort, especially for offline receivers.
 * edit methods resolve false when expiry recovery is skipped; delete is idempotent.
 */
export interface EphemeralMessage {
	/** false on the normal private-chat fallback. */
	readonly isEphemeral: boolean;
	readonly chatId: number;
	readonly receiverUserId: number;
	/** may change after onExpired: "resend" recovery. */
	readonly ephemeralMessageId: number | undefined;
	/** the regular id, on the private-chat fallback only. */
	readonly messageId: number | undefined;
	/** replace text and entities; extra options follow editEphemeralMessageText. */
	edit(text: EphemeralText, extra?: EphemeralEditOptions): Promise<boolean>;
	/** replace rich content without sending a conflicting text field. */
	editRich(input: EphemeralRichSource, extra?: EphemeralEditOptions): Promise<boolean>;
	/** replace media; new uploads are supported by bot api 10.3. */
	editMedia(media: InputMedia, extra?: EphemeralMediaOptions): Promise<boolean>;
	/** replace the caption, entities and optional caption placement. */
	editCaption(caption: EphemeralText, extra?: EphemeralCaptionOptions): Promise<boolean>;
	/** replace the inline keyboard; undefined clears it. */
	editReplyMarkup(replyMarkup: Markup | undefined): Promise<boolean>;
	/** an already-gone message resolves false. */
	delete(): Promise<boolean>;
}
export interface EphemeralControl {
	/** only the update's author sees the answer; private chats follow the fallback policy. */
	replyEphemeral(
		content: EphemeralContent,
		extra?: EphemeralSendOptions,
	): Promise<EphemeralMessage>;
	/** target one user in a group; never fall back to a public message. */
	sendEphemeral(
		receiverUserId: number,
		content: EphemeralContent,
		extra?: EphemeralSendOptions,
	): Promise<EphemeralMessage>;
	/** show a personalized overlay in place of a regular callback message. groups only. */
	replaceWithEphemeral(
		content: EphemeralContent,
		extra?: EphemeralSendOptions,
	): Promise<EphemeralMessage>;
}

export function supportsEphemeral(chat: Pick<Chat, "type"> | undefined): boolean {
	return chat?.type === "group" || chat?.type === "supergroup";
}
export function isExpiredEphemeralError(error: unknown): boolean {
	if (typeof error !== "object" || error === null) return false;
	const { code, description } = error as { code?: unknown; description?: unknown };
	return (
		code === 400 &&
		typeof description === "string" &&
		/(?:message(?: to (?:edit|delete))? (?:not found|(?:is |has )?expired)|ephemeral[_ ]message(?:[_ ]id)?[_ ](?:invalid|expired|not[_ ]found)|invalid (?:ephemeral message(?: id)?|message (?:id|identifier)))/i.test(
			description,
		)
	);
}
function resolveText(text: EphemeralText): { text: string; entities?: FormatResult["entities"] } {
	return typeof text === "string" ? { text } : { text: text.text, entities: text.entities };
}
function resolveRich(input: EphemeralRichSource): InputRichMessage {
	return "toInputRichMessage" in input ? input.toInputRichMessage() : input;
}
interface Outbound {
	method: string;
	params: Record<string, unknown>;
}
const MEDIA_METHODS: Record<string, [string, string]> = {
	animation: ["sendAnimation", "animation"],
	audio: ["sendAudio", "audio"],
	document: ["sendDocument", "document"],
	photo: ["sendPhoto", "photo"],
	video: ["sendVideo", "video"],
	live_photo: ["sendLivePhoto", "live_photo"],
	voice_note: ["sendVoice", "voice"],
};
function mediaOutbound(input: EphemeralMedia): Outbound {
	const entry = MEDIA_METHODS[input.type];
	if (!entry) throw new TypeError(`@yaebal/ephemeral: unsupported media type "${input.type}"`);
	const { type: _type, media, ...properties } = input;
	return { method: entry[0], params: { ...properties, [entry[1]]: media } };
}
function outbound(content: EphemeralContent): Outbound {
	if (typeof content === "object" && "rich_message" in content) {
		return {
			method: "sendRichMessage",
			params: { rich_message: resolveRich(content.rich_message) },
		};
	}
	if (typeof content === "object" && "media" in content) return mediaOutbound(content.media);
	return { method: "sendMessage", params: resolveText(content) };
}
interface HandleState {
	api: EphemeralApi;
	chatId: number;
	receiverUserId: number;
	id: number;
	isEphemeral: boolean;
	last?: Outbound;
	routing: Record<string, unknown>;
	onExpired: EphemeralExpiredAction;
	isExpired: (error: unknown) => boolean;
}
function makeHandle(state: HandleState): EphemeralMessage {
	const address = (): Record<string, unknown> =>
		state.isEphemeral
			? {
					chat_id: state.chatId,
					receiver_user_id: state.receiverUserId,
					ephemeral_message_id: state.id,
				}
			: { chat_id: state.chatId, message_id: state.id };
	const resend = async (next: Outbound): Promise<boolean> => {
		const sent = await state.api.call<Message>(next.method, {
			...state.routing,
			...next.params,
			chat_id: state.chatId,
			...(state.isEphemeral
				? { ephemeral_message_parameters: { receiver_user_id: state.receiverUserId } }
				: {}),
		});
		const id = state.isEphemeral ? sent.ephemeral_message_id : sent.message_id;
		if (id === undefined) throw new Error("@yaebal/ephemeral: resend returned no message id");
		state.id = id;
		return true;
	};
	const attempt = async (
		method: string,
		params: Record<string, unknown>,
		next?: Outbound,
	): Promise<boolean> => {
		try {
			await state.api.call(method, { ...params, ...address() });
		} catch (error) {
			if (!state.isEphemeral || !state.isExpired(error) || state.onExpired === "throw") throw error;
			if (state.onExpired !== "resend" || !next) return false;
			await resend(next);
		}
		if (next) state.last = next;
		return true;
	};
	return {
		get isEphemeral() {
			return state.isEphemeral;
		},
		get chatId() {
			return state.chatId;
		},
		get receiverUserId() {
			return state.receiverUserId;
		},
		get ephemeralMessageId() {
			return state.isEphemeral ? state.id : undefined;
		},
		get messageId() {
			return state.isEphemeral ? undefined : state.id;
		},
		edit(text, extra = {}) {
			const params = { ...resolveText(text), ...extra };
			return attempt(state.isEphemeral ? "editEphemeralMessageText" : "editMessageText", params, {
				method: "sendMessage",
				params,
			});
		},
		editRich(input, extra = {}) {
			const params = { rich_message: resolveRich(input), ...extra };
			return attempt(state.isEphemeral ? "editEphemeralMessageText" : "editMessageText", params, {
				method: "sendRichMessage",
				params,
			});
		},
		editMedia(media, extra = {}) {
			const next = mediaOutbound(media);
			next.params = { ...next.params, ...extra };
			return attempt(
				state.isEphemeral ? "editEphemeralMessageMedia" : "editMessageMedia",
				{ media, ...extra },
				next,
			);
		},
		editCaption(caption, extra = {}) {
			const resolved = resolveText(caption);
			const params = {
				caption: resolved.text,
				...(resolved.entities === undefined ? {} : { caption_entities: resolved.entities }),
				...extra,
			};
			const next =
				state.last && state.last.method !== "sendMessage" && state.last.method !== "sendRichMessage"
					? { method: state.last.method, params: { ...state.last.params, ...params } }
					: undefined;
			return attempt(
				state.isEphemeral ? "editEphemeralMessageCaption" : "editMessageCaption",
				params,
				next,
			);
		},
		editReplyMarkup(replyMarkup) {
			const params = { reply_markup: replyMarkup ?? { inline_keyboard: [] } };
			const next = state.last
				? { method: state.last.method, params: { ...state.last.params, ...params } }
				: undefined;
			return attempt(
				state.isEphemeral ? "editEphemeralMessageReplyMarkup" : "editMessageReplyMarkup",
				params,
				next,
			);
		},
		async delete() {
			try {
				await state.api.call(
					state.isEphemeral ? "deleteEphemeralMessage" : "deleteMessage",
					address(),
				);
				return true;
			} catch (error) {
				if (state.isExpired(error)) return false;
				throw error;
			}
		},
	};
}
/** reconstruct a resend payload only when the read-side message supplies reusable content. */
function fromMessage(sent: Message): Outbound | undefined {
	if (sent.text !== undefined)
		return {
			method: "sendMessage",
			params: { text: sent.text, ...(sent.entities ? { entities: sent.entities } : {}) },
		};
	for (const kind of ["animation", "audio", "document", "photo", "video", "voice"] as const) {
		const value = sent[kind];
		const file = Array.isArray(value) ? value.at(-1) : value;
		if (file)
			return mediaOutbound({
				type: kind === "voice" ? "voice_note" : kind,
				media: file.file_id,
				caption: sent.caption,
				caption_entities: sent.caption_entities,
				show_caption_above_media: sent.show_caption_above_media,
			});
	}
	return undefined;
}
export function wrapEphemeralMessage(
	api: EphemeralApi,
	sent: Message,
	options: Pick<EphemeralOptions, "onExpired" | "isExpiredError"> = {},
): EphemeralMessage {
	const id = sent.ephemeral_message_id;
	const receiverUserId = sent.receiver_user?.id;
	if (id === undefined || receiverUserId === undefined)
		throw new TypeError(
			"@yaebal/ephemeral: wrapEphemeralMessage() needs a message with ephemeral_message_id and receiver_user",
		);
	return makeHandle({
		api,
		chatId: sent.chat.id,
		receiverUserId,
		id,
		isEphemeral: true,
		last: fromMessage(sent),
		routing:
			sent.message_thread_id === undefined ? {} : { message_thread_id: sent.message_thread_id },
		onExpired: options.onExpired ?? "throw",
		isExpired: options.isExpiredError ?? isExpiredEphemeralError,
	});
}
/** installs typed text, rich and media replies, callback overlays and short-lived edit handles. */
export function ephemeral(options: EphemeralOptions = {}): Plugin<Context, EphemeralControl> {
	return (composer) =>
		composer.derive((ctx) => {
			const send = async (
				receiverUserId: number,
				content: EphemeralContent,
				extra: EphemeralSendOptions,
				fallback: boolean,
			): Promise<EphemeralMessage> => {
				const chat = ctx.chat;
				const isEphemeral = supportsEphemeral(chat);
				if (
					!chat ||
					(!isEphemeral && (!fallback || chat.type !== "private" || options.fallback === "error"))
				) {
					throw new Error(
						"@yaebal/ephemeral: ephemeral messages exist only in group and supergroup chats",
					);
				}
				const { ephemeral_message_parameters: parameters, ...rest } = extra;
				const route = ctx.routing();
				const next = outbound(content);
				next.params = { ...next.params, ...rest };
				const incoming = ctx.message?.ephemeral_message_id;
				const sent = await ctx.api.call<Message>(next.method, {
					...route,
					...next.params,
					chat_id: chat.id,
					...(isEphemeral
						? {
								ephemeral_message_parameters: {
									...(ctx.callbackQuery ? { callback_query_id: ctx.callbackQuery.id } : {}),
									...parameters,
									receiver_user_id: receiverUserId,
								},
							}
						: {}),
					...(isEphemeral &&
					incoming !== undefined &&
					receiverUserId === ctx.from?.id &&
					rest.reply_parameters === undefined
						? { reply_parameters: { ephemeral_message_id: incoming } }
						: {}),
				});
				const id = isEphemeral ? sent.ephemeral_message_id : sent.message_id;
				if (id === undefined)
					throw new Error("@yaebal/ephemeral: telegram returned no ephemeral_message_id");
				// callback ids, replacement flags and reply ids must not survive expiry recovery.
				const { reply_parameters: _reply, ...recoverable } = next.params;
				return makeHandle({
					api: ctx.api,
					chatId: chat.id,
					receiverUserId,
					id,
					isEphemeral,
					last: { ...next, params: recoverable },
					routing: route,
					onExpired: options.onExpired ?? "throw",
					isExpired: options.isExpiredError ?? isExpiredEphemeralError,
				});
			};
			const author = (): number => {
				const id = ctx.from?.id;
				if (id === undefined)
					throw new Error("@yaebal/ephemeral: replyEphemeral() — no user in this update");
				return id;
			};
			const control: EphemeralControl = {
				sendEphemeral: (id, content, extra = {}) => send(id, content, extra, false),
				replyEphemeral: (content, extra = {}) => send(author(), content, extra, true),
				replaceWithEphemeral(content, extra = {}) {
					const callback = ctx.callbackQuery;
					if (
						!callback?.message ||
						("ephemeral_message_id" in callback.message &&
							callback.message.ephemeral_message_id !== undefined)
					) {
						return Promise.reject(
							new Error(
								"@yaebal/ephemeral: replacement needs a callback from a regular chat message; edit an existing ephemeral message instead",
							),
						);
					}
					return send(
						author(),
						content,
						{
							...extra,
							ephemeral_message_parameters: {
								...extra.ephemeral_message_parameters,
								callback_query_id: callback.id,
								replace_callback_query_message: true,
							},
						},
						false,
					);
				},
			};
			return control;
		});
}
