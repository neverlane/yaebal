// AUTO-GENERATED — do not edit by hand. regenerate: pnpm --filter @yaebal/contexts generate
import type { Api } from "@yaebal/core";
import { isMediaSource } from "@yaebal/core";
import type * as t from "@yaebal/types";
import { requiredId } from "../require-id.js";

export interface BusinessConnectionContext extends t.BusinessConnection {}
export class BusinessConnectionContext {
	readonly api: Api;
	readonly update: t.Update;
	constructor(api: Api, update: t.Update) {
		this.api = api;
		this.update = update;
		Object.assign(this, update.business_connection ?? {});
	}
	/** id of the user this update is from. */
	get senderId(): number {
		return this.user.id;
	}
	/** first name of the user this update is from. */
	get firstName(): string | undefined {
		return this.user.first_name;
	}
	/** Use this method to send text messages. On success, the sent [Message](https://core.telegram.org/bots/api/#message) is returned. */
	send(params: Omit<t.SendMessageParams, never>) {
		return this.api.call<t.Message>("sendMessage", { ...(((this.id) === undefined) ? {} : { business_connection_id: this.id }), ...params });
	}
	/** Use this method to send photos. On success, the sent [Message](https://core.telegram.org/bots/api/#message) is returned. */
	sendPhoto(photo: t.InputFile | string, params?: Omit<t.SendPhotoParams, never | "photo">): Promise<t.Message>;
	sendPhoto(params: Omit<t.SendPhotoParams, never>): Promise<t.Message>;
	sendPhoto(a: t.InputFile | string | Omit<t.SendPhotoParams, never>, b?: Omit<t.SendPhotoParams, never | "photo">): Promise<t.Message> {
		const params = a !== undefined && (typeof a === "string" || isMediaSource(a))
			? ({ photo: a, ...b } as unknown as Omit<t.SendPhotoParams, never>)
			: ((a ?? {}) as Omit<t.SendPhotoParams, never>);
		return this.api.call<t.Message>("sendPhoto", { ...(((this.id) === undefined) ? {} : { business_connection_id: this.id }), ...params });
	}
	/** Use this method to send live photos. On success, the sent [Message](https://core.telegram.org/bots/api/#message) is returned. */
	sendLivePhoto(params: Omit<t.SendLivePhotoParams, never>) {
		return this.api.call<t.Message>("sendLivePhoto", { ...(((this.id) === undefined) ? {} : { business_connection_id: this.id }), ...params });
	}
	/** Use this method to send audio files, if you want Telegram clients to display them in the music player. Your audio must be in the .MP3 or .M4A format. On success, the sent [Message](https://core.telegram.org/bots/api/#message) is returned. Bots can currently send audio files of up to 50 MB in size, this limit may be changed in the future.  For sending voice messages, use the [sendVoice](https://core.telegram.org/bots/api/#sendvoice) method instead. */
	sendAudio(audio: t.InputFile | string, params?: Omit<t.SendAudioParams, never | "audio">): Promise<t.Message>;
	sendAudio(params: Omit<t.SendAudioParams, never>): Promise<t.Message>;
	sendAudio(a: t.InputFile | string | Omit<t.SendAudioParams, never>, b?: Omit<t.SendAudioParams, never | "audio">): Promise<t.Message> {
		const params = a !== undefined && (typeof a === "string" || isMediaSource(a))
			? ({ audio: a, ...b } as unknown as Omit<t.SendAudioParams, never>)
			: ((a ?? {}) as Omit<t.SendAudioParams, never>);
		return this.api.call<t.Message>("sendAudio", { ...(((this.id) === undefined) ? {} : { business_connection_id: this.id }), ...params });
	}
	/** Use this method to send general files. On success, the sent [Message](https://core.telegram.org/bots/api/#message) is returned. Bots can currently send files of any type of up to 50 MB in size, this limit may be changed in the future. */
	sendDocument(document: t.InputFile | string, params?: Omit<t.SendDocumentParams, never | "document">): Promise<t.Message>;
	sendDocument(params: Omit<t.SendDocumentParams, never>): Promise<t.Message>;
	sendDocument(a: t.InputFile | string | Omit<t.SendDocumentParams, never>, b?: Omit<t.SendDocumentParams, never | "document">): Promise<t.Message> {
		const params = a !== undefined && (typeof a === "string" || isMediaSource(a))
			? ({ document: a, ...b } as unknown as Omit<t.SendDocumentParams, never>)
			: ((a ?? {}) as Omit<t.SendDocumentParams, never>);
		return this.api.call<t.Message>("sendDocument", { ...(((this.id) === undefined) ? {} : { business_connection_id: this.id }), ...params });
	}
	/** Use this method to send video files, Telegram clients support MPEG4 videos (other formats may be sent as [Document](https://core.telegram.org/bots/api/#document)). On success, the sent [Message](https://core.telegram.org/bots/api/#message) is returned. Bots can currently send video files of up to 50 MB in size, this limit may be changed in the future. */
	sendVideo(video: t.InputFile | string, params?: Omit<t.SendVideoParams, never | "video">): Promise<t.Message>;
	sendVideo(params: Omit<t.SendVideoParams, never>): Promise<t.Message>;
	sendVideo(a: t.InputFile | string | Omit<t.SendVideoParams, never>, b?: Omit<t.SendVideoParams, never | "video">): Promise<t.Message> {
		const params = a !== undefined && (typeof a === "string" || isMediaSource(a))
			? ({ video: a, ...b } as unknown as Omit<t.SendVideoParams, never>)
			: ((a ?? {}) as Omit<t.SendVideoParams, never>);
		return this.api.call<t.Message>("sendVideo", { ...(((this.id) === undefined) ? {} : { business_connection_id: this.id }), ...params });
	}
	/** Use this method to send animation files (GIF or H.264/MPEG-4 AVC video without sound). On success, the sent [Message](https://core.telegram.org/bots/api/#message) is returned. Bots can currently send animation files of up to 50 MB in size, this limit may be changed in the future. */
	sendAnimation(animation: t.InputFile | string, params?: Omit<t.SendAnimationParams, never | "animation">): Promise<t.Message>;
	sendAnimation(params: Omit<t.SendAnimationParams, never>): Promise<t.Message>;
	sendAnimation(a: t.InputFile | string | Omit<t.SendAnimationParams, never>, b?: Omit<t.SendAnimationParams, never | "animation">): Promise<t.Message> {
		const params = a !== undefined && (typeof a === "string" || isMediaSource(a))
			? ({ animation: a, ...b } as unknown as Omit<t.SendAnimationParams, never>)
			: ((a ?? {}) as Omit<t.SendAnimationParams, never>);
		return this.api.call<t.Message>("sendAnimation", { ...(((this.id) === undefined) ? {} : { business_connection_id: this.id }), ...params });
	}
	/** Use this method to send audio files, if you want Telegram clients to display the file as a playable voice message. For this to work, your audio must be in an .OGG file encoded with OPUS, or in .MP3 format, or in .M4A format (other formats may be sent as [Audio](https://core.telegram.org/bots/api/#audio) or [Document](https://core.telegram.org/bots/api/#document)). On success, the sent [Message](https://core.telegram.org/bots/api/#message) is returned. Bots can currently send voice messages of up to 50 MB in size, this limit may be changed in the future. */
	sendVoice(voice: t.InputFile | string, params?: Omit<t.SendVoiceParams, never | "voice">): Promise<t.Message>;
	sendVoice(params: Omit<t.SendVoiceParams, never>): Promise<t.Message>;
	sendVoice(a: t.InputFile | string | Omit<t.SendVoiceParams, never>, b?: Omit<t.SendVoiceParams, never | "voice">): Promise<t.Message> {
		const params = a !== undefined && (typeof a === "string" || isMediaSource(a))
			? ({ voice: a, ...b } as unknown as Omit<t.SendVoiceParams, never>)
			: ((a ?? {}) as Omit<t.SendVoiceParams, never>);
		return this.api.call<t.Message>("sendVoice", { ...(((this.id) === undefined) ? {} : { business_connection_id: this.id }), ...params });
	}
	/** Use this method to send a rounded square MPEG4 video of up to 1 minute long. On success, the sent [Message](https://core.telegram.org/bots/api/#message) is returned. */
	sendVideoNote(videoNote: t.InputFile | string, params?: Omit<t.SendVideoNoteParams, never | "video_note">): Promise<t.Message>;
	sendVideoNote(params: Omit<t.SendVideoNoteParams, never>): Promise<t.Message>;
	sendVideoNote(a: t.InputFile | string | Omit<t.SendVideoNoteParams, never>, b?: Omit<t.SendVideoNoteParams, never | "video_note">): Promise<t.Message> {
		const params = a !== undefined && (typeof a === "string" || isMediaSource(a))
			? ({ video_note: a, ...b } as unknown as Omit<t.SendVideoNoteParams, never>)
			: ((a ?? {}) as Omit<t.SendVideoNoteParams, never>);
		return this.api.call<t.Message>("sendVideoNote", { ...(((this.id) === undefined) ? {} : { business_connection_id: this.id }), ...params });
	}
	/** Use this method to send point on the map. On success, the sent [Message](https://core.telegram.org/bots/api/#message) is returned. */
	sendLocation(latitude: number, longitude: number, params?: Omit<t.SendLocationParams, never | "latitude" | "longitude">): Promise<t.Message>;
	sendLocation(params: Omit<t.SendLocationParams, never>): Promise<t.Message>;
	sendLocation(a: number | Omit<t.SendLocationParams, never>, b?: number, c?: Omit<t.SendLocationParams, never | "latitude" | "longitude">): Promise<t.Message> {
		const params = typeof a === "number" ? ({ latitude: a, longitude: b as number, ...c } as unknown as Omit<t.SendLocationParams, never>) : a;
		return this.api.call<t.Message>("sendLocation", { ...(((this.id) === undefined) ? {} : { business_connection_id: this.id }), ...params });
	}
	/** Use this method to send information about a venue. On success, the sent [Message](https://core.telegram.org/bots/api/#message) is returned. */
	sendVenue(params: Omit<t.SendVenueParams, never>) {
		return this.api.call<t.Message>("sendVenue", { ...(((this.id) === undefined) ? {} : { business_connection_id: this.id }), ...params });
	}
	/** Use this method to send phone contacts. On success, the sent [Message](https://core.telegram.org/bots/api/#message) is returned. */
	sendContact(params: Omit<t.SendContactParams, never>) {
		return this.api.call<t.Message>("sendContact", { ...(((this.id) === undefined) ? {} : { business_connection_id: this.id }), ...params });
	}
	/** Use this method to get information about the connection of the bot with a business account. Returns a [BusinessConnection](https://core.telegram.org/bots/api/#businessconnection) object on success. */
	getBusinessConnection(params?: Omit<t.GetBusinessConnectionParams, "business_connection_id"> & { business_connection_id?: string }) {
		return this.api.call<t.BusinessConnection>("getBusinessConnection", { ...(params?.business_connection_id !== undefined ? {} : { business_connection_id: requiredId(this.id, "business_connection_id", "getBusinessConnection") }), ...params });
	}
	/** Delete messages on behalf of a business account. Requires the *can\_delete\_sent\_messages* business bot right to delete messages sent by the bot itself, or the *can\_delete\_all\_messages* business bot right to delete any message. Returns *True* on success. */
	deleteBusinessMessages(params: Omit<t.DeleteBusinessMessagesParams, "business_connection_id"> & { business_connection_id?: string }) {
		return this.api.call<boolean>("deleteBusinessMessages", { ...(params?.business_connection_id !== undefined ? {} : { business_connection_id: requiredId(this.id, "business_connection_id", "deleteBusinessMessages") }), ...params });
	}
	/** Changes the first and last name of a managed business account. Requires the *can\_change\_name* business bot right. Returns *True* on success. */
	setBusinessAccountName(params: Omit<t.SetBusinessAccountNameParams, "business_connection_id"> & { business_connection_id?: string }) {
		return this.api.call<boolean>("setBusinessAccountName", { ...(params?.business_connection_id !== undefined ? {} : { business_connection_id: requiredId(this.id, "business_connection_id", "setBusinessAccountName") }), ...params });
	}
	/** Changes the username of a managed business account. Requires the *can\_change\_username* business bot right. Returns *True* on success. */
	setBusinessAccountUsername(params?: Omit<t.SetBusinessAccountUsernameParams, "business_connection_id"> & { business_connection_id?: string }) {
		return this.api.call<boolean>("setBusinessAccountUsername", { ...(params?.business_connection_id !== undefined ? {} : { business_connection_id: requiredId(this.id, "business_connection_id", "setBusinessAccountUsername") }), ...params });
	}
	/** Changes the bio of a managed business account. Requires the *can\_change\_bio* business bot right. Returns *True* on success. */
	setBusinessAccountBio(params?: Omit<t.SetBusinessAccountBioParams, "business_connection_id"> & { business_connection_id?: string }) {
		return this.api.call<boolean>("setBusinessAccountBio", { ...(params?.business_connection_id !== undefined ? {} : { business_connection_id: requiredId(this.id, "business_connection_id", "setBusinessAccountBio") }), ...params });
	}
	/** Changes the profile photo of a managed business account. Requires the *can\_edit\_profile\_photo* business bot right. Returns *True* on success. */
	setBusinessAccountProfilePhoto(params: Omit<t.SetBusinessAccountProfilePhotoParams, "business_connection_id"> & { business_connection_id?: string }) {
		return this.api.call<boolean>("setBusinessAccountProfilePhoto", { ...(params?.business_connection_id !== undefined ? {} : { business_connection_id: requiredId(this.id, "business_connection_id", "setBusinessAccountProfilePhoto") }), ...params });
	}
	/** Removes the current profile photo of a managed business account. Requires the *can\_edit\_profile\_photo* business bot right. Returns *True* on success. */
	removeBusinessAccountProfilePhoto(params?: Omit<t.RemoveBusinessAccountProfilePhotoParams, "business_connection_id"> & { business_connection_id?: string }) {
		return this.api.call<boolean>("removeBusinessAccountProfilePhoto", { ...(params?.business_connection_id !== undefined ? {} : { business_connection_id: requiredId(this.id, "business_connection_id", "removeBusinessAccountProfilePhoto") }), ...params });
	}
	/** Changes the privacy settings pertaining to incoming gifts in a managed business account. Requires the *can\_change\_gift\_settings* business bot right. Returns *True* on success. */
	setBusinessAccountGiftSettings(params: Omit<t.SetBusinessAccountGiftSettingsParams, "business_connection_id"> & { business_connection_id?: string }) {
		return this.api.call<boolean>("setBusinessAccountGiftSettings", { ...(params?.business_connection_id !== undefined ? {} : { business_connection_id: requiredId(this.id, "business_connection_id", "setBusinessAccountGiftSettings") }), ...params });
	}
	/** Returns the amount of Telegram Stars owned by a managed business account. Requires the *can\_view\_gifts\_and\_stars* business bot right. Returns [StarAmount](https://core.telegram.org/bots/api/#staramount) on success. */
	getBusinessAccountStarBalance(params?: Omit<t.GetBusinessAccountStarBalanceParams, "business_connection_id"> & { business_connection_id?: string }) {
		return this.api.call<t.StarAmount>("getBusinessAccountStarBalance", { ...(params?.business_connection_id !== undefined ? {} : { business_connection_id: requiredId(this.id, "business_connection_id", "getBusinessAccountStarBalance") }), ...params });
	}
	/** Transfers Telegram Stars from the business account balance to the bot's balance. Requires the *can\_transfer\_stars* business bot right. Returns *True* on success. */
	transferBusinessAccountStars(params: Omit<t.TransferBusinessAccountStarsParams, "business_connection_id"> & { business_connection_id?: string }) {
		return this.api.call<boolean>("transferBusinessAccountStars", { ...(params?.business_connection_id !== undefined ? {} : { business_connection_id: requiredId(this.id, "business_connection_id", "transferBusinessAccountStars") }), ...params });
	}
	/** Returns the gifts received and owned by a managed business account. Requires the *can\_view\_gifts\_and\_stars* business bot right. Returns [OwnedGifts](https://core.telegram.org/bots/api/#ownedgifts) on success. */
	getBusinessAccountGifts(params?: Omit<t.GetBusinessAccountGiftsParams, "business_connection_id"> & { business_connection_id?: string }) {
		return this.api.call<t.OwnedGifts>("getBusinessAccountGifts", { ...(params?.business_connection_id !== undefined ? {} : { business_connection_id: requiredId(this.id, "business_connection_id", "getBusinessAccountGifts") }), ...params });
	}
	/** Converts a given regular gift to Telegram Stars. Requires the *can\_convert\_gifts\_to\_stars* business bot right. Returns *True* on success. */
	convertGiftToStars(params: Omit<t.ConvertGiftToStarsParams, "business_connection_id"> & { business_connection_id?: string }) {
		return this.api.call<boolean>("convertGiftToStars", { ...(params?.business_connection_id !== undefined ? {} : { business_connection_id: requiredId(this.id, "business_connection_id", "convertGiftToStars") }), ...params });
	}
	/** Upgrades a given regular gift to a unique gift. Requires the *can\_transfer\_and\_upgrade\_gifts* business bot right. Additionally requires the *can\_transfer\_stars* business bot right if the upgrade is paid. Returns *True* on success. */
	upgradeGift(params: Omit<t.UpgradeGiftParams, "business_connection_id"> & { business_connection_id?: string }) {
		return this.api.call<boolean>("upgradeGift", { ...(params?.business_connection_id !== undefined ? {} : { business_connection_id: requiredId(this.id, "business_connection_id", "upgradeGift") }), ...params });
	}
	/** Transfers an owned unique gift to another user. Requires the *can\_transfer\_and\_upgrade\_gifts* business bot right. Requires *can\_transfer\_stars* business bot right if the transfer is paid. Returns *True* on success. */
	transferGift(params: Omit<t.TransferGiftParams, "business_connection_id"> & { business_connection_id?: string }) {
		return this.api.call<boolean>("transferGift", { ...(params?.business_connection_id !== undefined ? {} : { business_connection_id: requiredId(this.id, "business_connection_id", "transferGift") }), ...params });
	}
	/** Deletes a regular gift owned by a managed business account without receiving Telegram Stars for it. Requires the *can\_convert\_gifts\_to\_stars* business bot right. The gift can be deleted only if it isn't limited (the field *total\_count* of the [Gift](https://core.telegram.org/bots/api/#gift) is omitted) and wasn't refunded. Returns *True* on success. */
	deleteBusinessAccountGift(params: Omit<t.DeleteBusinessAccountGiftParams, "business_connection_id"> & { business_connection_id?: string }) {
		return this.api.call<boolean>("deleteBusinessAccountGift", { ...(params?.business_connection_id !== undefined ? {} : { business_connection_id: requiredId(this.id, "business_connection_id", "deleteBusinessAccountGift") }), ...params });
	}
	/** Posts a story on behalf of a managed business account. Requires the *can\_manage\_stories* business bot right. Returns [Story](https://core.telegram.org/bots/api/#story) on success. */
	postStory(params: Omit<t.PostStoryParams, "business_connection_id"> & { business_connection_id?: string }) {
		return this.api.call<t.Story>("postStory", { ...(params?.business_connection_id !== undefined ? {} : { business_connection_id: requiredId(this.id, "business_connection_id", "postStory") }), ...params });
	}
	/** Edits a story previously posted by the bot on behalf of a managed business account. Requires the *can\_manage\_stories* business bot right. Returns [Story](https://core.telegram.org/bots/api/#story) on success. */
	editStory(params: Omit<t.EditStoryParams, "business_connection_id"> & { business_connection_id?: string }) {
		return this.api.call<t.Story>("editStory", { ...(params?.business_connection_id !== undefined ? {} : { business_connection_id: requiredId(this.id, "business_connection_id", "editStory") }), ...params });
	}
	/** Deletes a story previously posted by the bot on behalf of a managed business account. Requires the *can\_manage\_stories* business bot right. Returns *True* on success. */
	deleteStory(params: Omit<t.DeleteStoryParams, "business_connection_id"> & { business_connection_id?: string }) {
		return this.api.call<boolean>("deleteStory", { ...(params?.business_connection_id !== undefined ? {} : { business_connection_id: requiredId(this.id, "business_connection_id", "deleteStory") }), ...params });
	}
	/** Use this method to edit text, rich and [game](https://core.telegram.org/bots/api/#games) messages. On success, if the edited message is not an inline message, the edited [Message](https://core.telegram.org/bots/api/#message) is returned, otherwise *True* is returned. Note that business messages that were not sent by the bot and do not contain an inline keyboard can only be edited within **48 hours** from the time they were sent. */
	editText(params?: Omit<t.EditMessageTextParams, never>) {
		return this.api.call<t.Message | boolean>("editMessageText", { ...(((this.id) === undefined) ? {} : { business_connection_id: this.id }), ...params });
	}
	/** Use this method to edit captions of messages. On success, if the edited message is not an inline message, the edited [Message](https://core.telegram.org/bots/api/#message) is returned, otherwise *True* is returned. Note that business messages that were not sent by the bot and do not contain an inline keyboard can only be edited within **48 hours** from the time they were sent. */
	editCaption(params?: Omit<t.EditMessageCaptionParams, never>) {
		return this.api.call<t.Message | boolean>("editMessageCaption", { ...(((this.id) === undefined) ? {} : { business_connection_id: this.id }), ...params });
	}
	/** Use this method to edit animation, audio, document, live photo, photo, or video messages, or to replace a text or a rich message with a media. If a message is part of a message album, then it can be edited only to an audio for audio albums, only to a document for document albums and to a photo, a live photo, or a video otherwise. When an inline message is edited, a new file can't be uploaded; use a previously uploaded file via its file_id or specify a URL. On success, if the edited message is not an inline message, the edited [Message](https://core.telegram.org/bots/api/#message) is returned, otherwise *True* is returned. Note that business messages that were not sent by the bot and do not contain an inline keyboard can only be edited within **48 hours** from the time they were sent. */
	editMedia(params: Omit<t.EditMessageMediaParams, never>) {
		return this.api.call<t.Message | boolean>("editMessageMedia", { ...(((this.id) === undefined) ? {} : { business_connection_id: this.id }), ...params });
	}
	/** Use this method to edit live location messages. A location can be edited until its *live\_period* expires or editing is explicitly disabled by a call to [stopMessageLiveLocation](https://core.telegram.org/bots/api/#stopmessagelivelocation). On success, if the edited message is not an inline message, the edited [Message](https://core.telegram.org/bots/api/#message) is returned, otherwise *True* is returned. */
	editLiveLocation(params: Omit<t.EditMessageLiveLocationParams, never>) {
		return this.api.call<t.Message | boolean>("editMessageLiveLocation", { ...(((this.id) === undefined) ? {} : { business_connection_id: this.id }), ...params });
	}
	/** Use this method to stop updating a live location message before *live\_period* expires. On success, if the message is not an inline message, the edited [Message](https://core.telegram.org/bots/api/#message) is returned, otherwise *True* is returned. */
	stopMessageLiveLocation(params?: Omit<t.StopMessageLiveLocationParams, never>) {
		return this.api.call<t.Message | boolean>("stopMessageLiveLocation", { ...(((this.id) === undefined) ? {} : { business_connection_id: this.id }), ...params });
	}
	/** Use this method to edit only the reply markup of messages. On success, if the edited message is not an inline message, the edited [Message](https://core.telegram.org/bots/api/#message) is returned, otherwise *True* is returned. Note that business messages that were not sent by the bot and do not contain an inline keyboard can only be edited within **48 hours** from the time they were sent. */
	editReplyMarkup(replyMarkup: t.InlineKeyboardMarkup | { toJSON(): t.InlineKeyboardMarkup }, params?: Omit<t.EditMessageReplyMarkupParams, never | "reply_markup">): Promise<t.Message | boolean>;
	editReplyMarkup(params?: Omit<t.EditMessageReplyMarkupParams, never>): Promise<t.Message | boolean>;
	editReplyMarkup(a?: t.InlineKeyboardMarkup | { toJSON(): t.InlineKeyboardMarkup } | Omit<t.EditMessageReplyMarkupParams, never>, b?: Omit<t.EditMessageReplyMarkupParams, never | "reply_markup">): Promise<t.Message | boolean> {
		const params = a !== undefined && (typeof a === "object" && a !== null && ("inline_keyboard" in a || "toJSON" in a))
			? ({ reply_markup: a, ...b } as unknown as Omit<t.EditMessageReplyMarkupParams, never>)
			: ((a ?? {}) as Omit<t.EditMessageReplyMarkupParams, never>);
		return this.api.call<t.Message | boolean>("editMessageReplyMarkup", { ...(((this.id) === undefined) ? {} : { business_connection_id: this.id }), ...params });
	}
	/** Use this method to send static .WEBP, [animated](https://telegram.org/blog/animated-stickers) .TGS, or [video](https://telegram.org/blog/video-stickers-better-reactions) .WEBM stickers. On success, the sent [Message](https://core.telegram.org/bots/api/#message) is returned. */
	sendSticker(sticker: t.InputFile | string, params?: Omit<t.SendStickerParams, never | "sticker">): Promise<t.Message>;
	sendSticker(params: Omit<t.SendStickerParams, never>): Promise<t.Message>;
	sendSticker(a: t.InputFile | string | Omit<t.SendStickerParams, never>, b?: Omit<t.SendStickerParams, never | "sticker">): Promise<t.Message> {
		const params = a !== undefined && (typeof a === "string" || isMediaSource(a))
			? ({ sticker: a, ...b } as unknown as Omit<t.SendStickerParams, never>)
			: ((a ?? {}) as Omit<t.SendStickerParams, never>);
		return this.api.call<t.Message>("sendSticker", { ...(((this.id) === undefined) ? {} : { business_connection_id: this.id }), ...params });
	}
	/** Use this method to send rich messages. If the message contains a block with a media element, then the bot must have the right to send the media to the chat. On success, the sent [Message](https://core.telegram.org/bots/api/#message) is returned. */
	sendRichMessage(params: Omit<t.SendRichMessageParams, never>) {
		return this.api.call<t.Message>("sendRichMessage", { ...(((this.id) === undefined) ? {} : { business_connection_id: this.id }), ...params });
	}
	/** Use this method to create a link for an invoice. Returns the created invoice link as *String* on success. */
	createInvoiceLink(params: Omit<t.CreateInvoiceLinkParams, never>) {
		return this.api.call<string>("createInvoiceLink", { ...(((this.id) === undefined) ? {} : { business_connection_id: this.id }), ...params });
	}
}
