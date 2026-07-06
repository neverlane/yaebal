// AUTO-GENERATED — do not edit by hand. regenerate: pnpm --filter @yaebal/contexts generate
import type { Api } from "@yaebal/core";
import type * as t from "@yaebal/types";

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
	/** Use this method to get information about the connection of the bot with a business account. Returns a [BusinessConnection](https://core.telegram.org/bots/api/#businessconnection) object on success. */
	getBusinessConnection(params?: Omit<t.GetBusinessConnectionParams, "business_connection_id">) {
		return this.api.call<t.BusinessConnection>("getBusinessConnection", { ...((this.id) === undefined ? {} : { business_connection_id: this.id }), ...params });
	}
	/** Delete messages on behalf of a business account. Requires the *can\_delete\_sent\_messages* business bot right to delete messages sent by the bot itself, or the *can\_delete\_all\_messages* business bot right to delete any message. Returns *True* on success. */
	deleteBusinessMessages(params: Omit<t.DeleteBusinessMessagesParams, "business_connection_id">) {
		return this.api.call<boolean>("deleteBusinessMessages", { ...((this.id) === undefined ? {} : { business_connection_id: this.id }), ...params });
	}
	/** Changes the first and last name of a managed business account. Requires the *can\_change\_name* business bot right. Returns *True* on success. */
	setBusinessAccountName(params: Omit<t.SetBusinessAccountNameParams, "business_connection_id">) {
		return this.api.call<boolean>("setBusinessAccountName", { ...((this.id) === undefined ? {} : { business_connection_id: this.id }), ...params });
	}
	/** Changes the username of a managed business account. Requires the *can\_change\_username* business bot right. Returns *True* on success. */
	setBusinessAccountUsername(params: Omit<t.SetBusinessAccountUsernameParams, "business_connection_id">) {
		return this.api.call<boolean>("setBusinessAccountUsername", { ...((this.id) === undefined ? {} : { business_connection_id: this.id }), ...params });
	}
	/** Changes the bio of a managed business account. Requires the *can\_change\_bio* business bot right. Returns *True* on success. */
	setBusinessAccountBio(params: Omit<t.SetBusinessAccountBioParams, "business_connection_id">) {
		return this.api.call<boolean>("setBusinessAccountBio", { ...((this.id) === undefined ? {} : { business_connection_id: this.id }), ...params });
	}
	/** Changes the profile photo of a managed business account. Requires the *can\_edit\_profile\_photo* business bot right. Returns *True* on success. */
	setBusinessAccountProfilePhoto(params: Omit<t.SetBusinessAccountProfilePhotoParams, "business_connection_id">) {
		return this.api.call<boolean>("setBusinessAccountProfilePhoto", { ...((this.id) === undefined ? {} : { business_connection_id: this.id }), ...params });
	}
	/** Removes the current profile photo of a managed business account. Requires the *can\_edit\_profile\_photo* business bot right. Returns *True* on success. */
	removeBusinessAccountProfilePhoto(params: Omit<t.RemoveBusinessAccountProfilePhotoParams, "business_connection_id">) {
		return this.api.call<boolean>("removeBusinessAccountProfilePhoto", { ...((this.id) === undefined ? {} : { business_connection_id: this.id }), ...params });
	}
	/** Changes the privacy settings pertaining to incoming gifts in a managed business account. Requires the *can\_change\_gift\_settings* business bot right. Returns *True* on success. */
	setBusinessAccountGiftSettings(params: Omit<t.SetBusinessAccountGiftSettingsParams, "business_connection_id">) {
		return this.api.call<boolean>("setBusinessAccountGiftSettings", { ...((this.id) === undefined ? {} : { business_connection_id: this.id }), ...params });
	}
	/** Returns the amount of Telegram Stars owned by a managed business account. Requires the *can\_view\_gifts\_and\_stars* business bot right. Returns [StarAmount](https://core.telegram.org/bots/api/#staramount) on success. */
	getBusinessAccountStarBalance(params?: Omit<t.GetBusinessAccountStarBalanceParams, "business_connection_id">) {
		return this.api.call<t.StarAmount>("getBusinessAccountStarBalance", { ...((this.id) === undefined ? {} : { business_connection_id: this.id }), ...params });
	}
	/** Transfers Telegram Stars from the business account balance to the bot's balance. Requires the *can\_transfer\_stars* business bot right. Returns *True* on success. */
	transferBusinessAccountStars(params: Omit<t.TransferBusinessAccountStarsParams, "business_connection_id">) {
		return this.api.call<boolean>("transferBusinessAccountStars", { ...((this.id) === undefined ? {} : { business_connection_id: this.id }), ...params });
	}
	/** Returns the gifts received and owned by a managed business account. Requires the *can\_view\_gifts\_and\_stars* business bot right. Returns [OwnedGifts](https://core.telegram.org/bots/api/#ownedgifts) on success. */
	getBusinessAccountGifts(params: Omit<t.GetBusinessAccountGiftsParams, "business_connection_id">) {
		return this.api.call<t.OwnedGifts>("getBusinessAccountGifts", { ...((this.id) === undefined ? {} : { business_connection_id: this.id }), ...params });
	}
	/** Converts a given regular gift to Telegram Stars. Requires the *can\_convert\_gifts\_to\_stars* business bot right. Returns *True* on success. */
	convertGiftToStars(params: Omit<t.ConvertGiftToStarsParams, "business_connection_id">) {
		return this.api.call<boolean>("convertGiftToStars", { ...((this.id) === undefined ? {} : { business_connection_id: this.id }), ...params });
	}
	/** Upgrades a given regular gift to a unique gift. Requires the *can\_transfer\_and\_upgrade\_gifts* business bot right. Additionally requires the *can\_transfer\_stars* business bot right if the upgrade is paid. Returns *True* on success. */
	upgradeGift(params: Omit<t.UpgradeGiftParams, "business_connection_id">) {
		return this.api.call<boolean>("upgradeGift", { ...((this.id) === undefined ? {} : { business_connection_id: this.id }), ...params });
	}
	/** Transfers an owned unique gift to another user. Requires the *can\_transfer\_and\_upgrade\_gifts* business bot right. Requires *can\_transfer\_stars* business bot right if the transfer is paid. Returns *True* on success. */
	transferGift(params: Omit<t.TransferGiftParams, "business_connection_id">) {
		return this.api.call<boolean>("transferGift", { ...((this.id) === undefined ? {} : { business_connection_id: this.id }), ...params });
	}
	/** Posts a story on behalf of a managed business account. Requires the *can\_manage\_stories* business bot right. Returns [Story](https://core.telegram.org/bots/api/#story) on success. */
	postStory(params: Omit<t.PostStoryParams, "business_connection_id">) {
		return this.api.call<t.Story>("postStory", { ...((this.id) === undefined ? {} : { business_connection_id: this.id }), ...params });
	}
	/** Edits a story previously posted by the bot on behalf of a managed business account. Requires the *can\_manage\_stories* business bot right. Returns [Story](https://core.telegram.org/bots/api/#story) on success. */
	editStory(params: Omit<t.EditStoryParams, "business_connection_id">) {
		return this.api.call<t.Story>("editStory", { ...((this.id) === undefined ? {} : { business_connection_id: this.id }), ...params });
	}
	/** Deletes a story previously posted by the bot on behalf of a managed business account. Requires the *can\_manage\_stories* business bot right. Returns *True* on success. */
	deleteStory(params: Omit<t.DeleteStoryParams, "business_connection_id">) {
		return this.api.call<boolean>("deleteStory", { ...((this.id) === undefined ? {} : { business_connection_id: this.id }), ...params });
	}
	/** Use this method to edit text, rich and [game](https://core.telegram.org/bots/api/#games) messages. On success, if the edited message is not an inline message, the edited [Message](https://core.telegram.org/bots/api/#message) is returned, otherwise *True* is returned. Note that business messages that were not sent by the bot and do not contain an inline keyboard can only be edited within **48 hours** from the time they were sent. */
	editText(params: Omit<t.EditMessageTextParams, "business_connection_id">) {
		return this.api.call<t.Message | boolean>("editMessageText", { ...((this.id) === undefined ? {} : { business_connection_id: this.id }), ...params });
	}
	/** Use this method to edit captions of messages. On success, if the edited message is not an inline message, the edited [Message](https://core.telegram.org/bots/api/#message) is returned, otherwise *True* is returned. Note that business messages that were not sent by the bot and do not contain an inline keyboard can only be edited within **48 hours** from the time they were sent. */
	editCaption(params: Omit<t.EditMessageCaptionParams, "business_connection_id">) {
		return this.api.call<t.Message | boolean>("editMessageCaption", { ...((this.id) === undefined ? {} : { business_connection_id: this.id }), ...params });
	}
	/** Use this method to edit animation, audio, document, live photo, photo, or video messages, or to replace a text or a rich message with a media. If a message is part of a message album, then it can be edited only to an audio for audio albums, only to a document for document albums and to a photo, a live photo, or a video otherwise. When an inline message is edited, a new file can't be uploaded; use a previously uploaded file via its file_id or specify a URL. On success, if the edited message is not an inline message, the edited [Message](https://core.telegram.org/bots/api/#message) is returned, otherwise *True* is returned. Note that business messages that were not sent by the bot and do not contain an inline keyboard can only be edited within **48 hours** from the time they were sent. */
	editMedia(params: Omit<t.EditMessageMediaParams, "business_connection_id">) {
		return this.api.call<t.Message | boolean>("editMessageMedia", { ...((this.id) === undefined ? {} : { business_connection_id: this.id }), ...params });
	}
	/** Use this method to edit live location messages. A location can be edited until its *live\_period* expires or editing is explicitly disabled by a call to [stopMessageLiveLocation](https://core.telegram.org/bots/api/#stopmessagelivelocation). On success, if the edited message is not an inline message, the edited [Message](https://core.telegram.org/bots/api/#message) is returned, otherwise *True* is returned. */
	editLiveLocation(params: Omit<t.EditMessageLiveLocationParams, "business_connection_id">) {
		return this.api.call<t.Message | boolean>("editMessageLiveLocation", { ...((this.id) === undefined ? {} : { business_connection_id: this.id }), ...params });
	}
	/** Use this method to stop updating a live location message before *live\_period* expires. On success, if the message is not an inline message, the edited [Message](https://core.telegram.org/bots/api/#message) is returned, otherwise *True* is returned. */
	stopMessageLiveLocation(params: Omit<t.StopMessageLiveLocationParams, "business_connection_id">) {
		return this.api.call<t.Message | boolean>("stopMessageLiveLocation", { ...((this.id) === undefined ? {} : { business_connection_id: this.id }), ...params });
	}
	/** Use this method to edit only the reply markup of messages. On success, if the edited message is not an inline message, the edited [Message](https://core.telegram.org/bots/api/#message) is returned, otherwise *True* is returned. Note that business messages that were not sent by the bot and do not contain an inline keyboard can only be edited within **48 hours** from the time they were sent. */
	editReplyMarkup(replyMarkup: t.InlineKeyboardMarkup | { toJSON(): t.InlineKeyboardMarkup }, params?: Omit<t.EditMessageReplyMarkupParams, "business_connection_id" | "reply_markup">): Promise<t.Message | boolean>;
	editReplyMarkup(params?: Omit<t.EditMessageReplyMarkupParams, "business_connection_id">): Promise<t.Message | boolean>;
	editReplyMarkup(a?: t.InlineKeyboardMarkup | { toJSON(): t.InlineKeyboardMarkup } | Omit<t.EditMessageReplyMarkupParams, "business_connection_id">, b?: Omit<t.EditMessageReplyMarkupParams, "business_connection_id" | "reply_markup">): Promise<t.Message | boolean> {
		const params = a !== undefined && (typeof a === "object" && a !== null && ("inline_keyboard" in a || "toJSON" in a))
			? ({ reply_markup: a, ...b } as unknown as Omit<t.EditMessageReplyMarkupParams, "business_connection_id">)
			: ((a ?? {}) as Omit<t.EditMessageReplyMarkupParams, "business_connection_id">);
		return this.api.call<t.Message | boolean>("editMessageReplyMarkup", { ...((this.id) === undefined ? {} : { business_connection_id: this.id }), ...params });
	}
	/** Use this method to create a link for an invoice. Returns the created invoice link as *String* on success. */
	createInvoiceLink(params: Omit<t.CreateInvoiceLinkParams, "business_connection_id">) {
		return this.api.call<string>("createInvoiceLink", { ...((this.id) === undefined ? {} : { business_connection_id: this.id }), ...params });
	}
}
