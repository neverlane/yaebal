// AUTO-GENERATED — do not edit by hand. regenerate: pnpm --filter @yaebal/contexts generate
import type { Api } from "@yaebal/core";
import type * as t from "@yaebal/types";

export interface ChosenInlineResultContext extends t.ChosenInlineResult {}
export class ChosenInlineResultContext {
	readonly api: Api;
	readonly update: t.Update;
	constructor(api: Api, update: t.Update) {
		this.api = api;
		this.update = update;
		Object.assign(this, update.chosen_inline_result ?? {});
	}
	/** id of the user this update is from. */
	get senderId(): number {
		return this.from.id;
	}
	/** first name of the user this update is from. */
	get firstName(): string | undefined {
		return this.from.first_name;
	}
	/** Use this method to get a list of profile pictures for a user. Returns a [UserProfilePhotos](https://core.telegram.org/bots/api/#userprofilephotos) object. */
	getUserProfilePhotos(params: Omit<t.GetUserProfilePhotosParams, "user_id">) {
		return this.api.call<t.UserProfilePhotos>("getUserProfilePhotos", { user_id: this.from.id, ...params });
	}
	/** Use this method to get a list of profile audios for a user. Returns a [UserProfileAudios](https://core.telegram.org/bots/api/#userprofileaudios) object. */
	getUserProfileAudios(params: Omit<t.GetUserProfileAudiosParams, "user_id">) {
		return this.api.call<t.UserProfileAudios>("getUserProfileAudios", { user_id: this.from.id, ...params });
	}
	/** Changes the emoji status for a given user that previously allowed the bot to manage their emoji status via the Mini App method [requestEmojiStatusAccess](/bots/webapps#initializing-mini-apps). Returns *True* on success. */
	setUserEmojiStatus(params: Omit<t.SetUserEmojiStatusParams, "user_id">) {
		return this.api.call<boolean>("setUserEmojiStatus", { user_id: this.from.id, ...params });
	}
	/** Use this method to get the last messages from the personal chat (i.e., the chat currently added to their profile) of a given user. On success, an array of [Message](https://core.telegram.org/bots/api/#message) objects is returned. */
	getUserPersonalChatMessages(params: Omit<t.GetUserPersonalChatMessagesParams, "user_id">) {
		return this.api.call<t.Message[]>("getUserPersonalChatMessages", { user_id: this.from.id, ...params });
	}
	/** Use this method to get the token of a managed bot. Returns the token as *String* on success. */
	getManagedBotToken(params?: Omit<t.GetManagedBotTokenParams, "user_id">) {
		return this.api.call<string>("getManagedBotToken", { user_id: this.from.id, ...params });
	}
	/** Use this method to revoke the current token of a managed bot and generate a new one. Returns the new token as *String* on success. */
	replaceManagedBotToken(params?: Omit<t.ReplaceManagedBotTokenParams, "user_id">) {
		return this.api.call<string>("replaceManagedBotToken", { user_id: this.from.id, ...params });
	}
	/** Use this method to get the access settings of a managed bot. Returns a [BotAccessSettings](https://core.telegram.org/bots/api/#botaccesssettings) object on success. */
	getManagedBotAccessSettings(params?: Omit<t.GetManagedBotAccessSettingsParams, "user_id">) {
		return this.api.call<t.BotAccessSettings>("getManagedBotAccessSettings", { user_id: this.from.id, ...params });
	}
	/** Use this method to change the access settings of a managed bot. Returns *True* on success. */
	setManagedBotAccessSettings(params: Omit<t.SetManagedBotAccessSettingsParams, "user_id">) {
		return this.api.call<boolean>("setManagedBotAccessSettings", { user_id: this.from.id, ...params });
	}
	/** Sends a gift to the given user or channel chat. The gift can't be converted to Telegram Stars by the receiver. Returns *True* on success. */
	sendGift(params: Omit<t.SendGiftParams, "user_id">) {
		return this.api.call<boolean>("sendGift", { user_id: this.from.id, ...params });
	}
	/** Gifts a Telegram Premium subscription to the given user. Returns *True* on success. */
	giftPremiumSubscription(params: Omit<t.GiftPremiumSubscriptionParams, "user_id">) {
		return this.api.call<boolean>("giftPremiumSubscription", { user_id: this.from.id, ...params });
	}
	/** Verifies a user [on behalf of the organization](https://telegram.org/verify#third-party-verification) which is represented by the bot. Returns *True* on success. */
	verifyUser(params: Omit<t.VerifyUserParams, "user_id">) {
		return this.api.call<boolean>("verifyUser", { user_id: this.from.id, ...params });
	}
	/** Removes verification from a user who is currently verified [on behalf of the organization](https://telegram.org/verify#third-party-verification) represented by the bot. Returns *True* on success. */
	removeUserVerification(params?: Omit<t.RemoveUserVerificationParams, "user_id">) {
		return this.api.call<boolean>("removeUserVerification", { user_id: this.from.id, ...params });
	}
	/** Returns the gifts owned and hosted by a user. Returns [OwnedGifts](https://core.telegram.org/bots/api/#ownedgifts) on success. */
	getUserGifts(params: Omit<t.GetUserGiftsParams, "user_id">) {
		return this.api.call<t.OwnedGifts>("getUserGifts", { user_id: this.from.id, ...params });
	}
	/** Stores a message that can be sent by a user of a Mini App. Returns a [PreparedInlineMessage](https://core.telegram.org/bots/api/#preparedinlinemessage) object. */
	savePreparedInlineMessage(params: Omit<t.SavePreparedInlineMessageParams, "user_id">) {
		return this.api.call<t.PreparedInlineMessage>("savePreparedInlineMessage", { user_id: this.from.id, ...params });
	}
	/** Stores a keyboard button that can be used by a user within a Mini App. Returns a [PreparedKeyboardButton](https://core.telegram.org/bots/api/#preparedkeyboardbutton) object. */
	savePreparedKeyboardButton(params: Omit<t.SavePreparedKeyboardButtonParams, "user_id">) {
		return this.api.call<t.PreparedKeyboardButton>("savePreparedKeyboardButton", { user_id: this.from.id, ...params });
	}
	/** Use this method to upload a file with a sticker for later use in the [createNewStickerSet](https://core.telegram.org/bots/api/#createnewstickerset), [addStickerToSet](https://core.telegram.org/bots/api/#addstickertoset), or [replaceStickerInSet](https://core.telegram.org/bots/api/#replacestickerinset) methods (the file can be used multiple times). Returns the uploaded [File](https://core.telegram.org/bots/api/#file) on success. */
	uploadStickerFile(params: Omit<t.UploadStickerFileParams, "user_id">) {
		return this.api.call<t.File>("uploadStickerFile", { user_id: this.from.id, ...params });
	}
	/** Use this method to create a new sticker set owned by a user. The bot will be able to edit the sticker set thus created. Returns *True* on success. */
	createNewStickerSet(params: Omit<t.CreateNewStickerSetParams, "user_id">) {
		return this.api.call<boolean>("createNewStickerSet", { user_id: this.from.id, ...params });
	}
	/** Use this method to add a new sticker to a set created by the bot. Emoji sticker sets can have up to 200 stickers. Other sticker sets can have up to 120 stickers. Returns *True* on success. */
	addStickerToSet(params: Omit<t.AddStickerToSetParams, "user_id">) {
		return this.api.call<boolean>("addStickerToSet", { user_id: this.from.id, ...params });
	}
	/** Use this method to replace an existing sticker in a sticker set with a new one. The method is equivalent to calling [deleteStickerFromSet](https://core.telegram.org/bots/api/#deletestickerfromset), then [addStickerToSet](https://core.telegram.org/bots/api/#addstickertoset), then [setStickerPositionInSet](https://core.telegram.org/bots/api/#setstickerpositioninset). Returns *True* on success. */
	replaceStickerInSet(params: Omit<t.ReplaceStickerInSetParams, "user_id">) {
		return this.api.call<boolean>("replaceStickerInSet", { user_id: this.from.id, ...params });
	}
	/** Use this method to set the thumbnail of a regular or mask sticker set. The format of the thumbnail file must match the format of the stickers in the set. Returns *True* on success. */
	setStickerSetThumbnail(params: Omit<t.SetStickerSetThumbnailParams, "user_id">) {
		return this.api.call<boolean>("setStickerSetThumbnail", { user_id: this.from.id, ...params });
	}
	/** Refunds a successful payment in [Telegram Stars](https://t.me/BotNews/90). Returns *True* on success. */
	refundStarPayment(params: Omit<t.RefundStarPaymentParams, "user_id">) {
		return this.api.call<boolean>("refundStarPayment", { user_id: this.from.id, ...params });
	}
	/** Allows the bot to cancel or re-enable extension of a subscription paid in Telegram Stars. Returns *True* on success. */
	editUserStarSubscription(params: Omit<t.EditUserStarSubscriptionParams, "user_id">) {
		return this.api.call<boolean>("editUserStarSubscription", { user_id: this.from.id, ...params });
	}
	/** Informs a user that some of the Telegram Passport elements they provided contains errors. The user will not be able to re-submit their Passport to you until the errors are fixed (the contents of the field for which you returned the error must change). Returns *True* on success.  Use this if the data submitted by the user doesn't satisfy the standards your service requires for any reason. For example, if a birthday date seems invalid, a submitted document is blurry, a scan shows evidence of tampering, etc. Supply some details in the error message to make sure the user knows how to correct the issues. */
	setPassportDataErrors(params: Omit<t.SetPassportDataErrorsParams, "user_id">) {
		return this.api.call<boolean>("setPassportDataErrors", { user_id: this.from.id, ...params });
	}
	/** Use this method to set the score of the specified user in a game message. On success, if the message is not an inline message, the [Message](https://core.telegram.org/bots/api/#message) is returned, otherwise *True* is returned. Returns an error, if the new score is not greater than the user's current score in the chat and *force* is *False*. */
	setGameScore(params: Omit<t.SetGameScoreParams, "user_id">) {
		return this.api.call<t.Message | boolean>("setGameScore", { user_id: this.from.id, ...params });
	}
	/** Use this method to get data for high score tables. Will return the score of the specified user and several of their neighbors in a game. Returns an Array of [GameHighScore](https://core.telegram.org/bots/api/#gamehighscore) objects.  This method will currently return scores for the target user, plus two of their closest neighbors on each side. Will also return the top three users if the user and their neighbors are not among them. Please note that this behavior is subject to change. */
	getGameHighScores(params: Omit<t.GetGameHighScoresParams, "user_id">) {
		return this.api.call<t.GameHighScore[]>("getGameHighScores", { user_id: this.from.id, ...params });
	}
}
