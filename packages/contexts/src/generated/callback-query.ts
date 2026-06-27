// AUTO-GENERATED — do not edit by hand. Regenerate: pnpm --filter @yaebal/contexts generate
import type { Api } from "@yaebal/core";
import type * as t from "@yaebal/types";

export interface CallbackQueryContextBase extends t.CallbackQuery {}
export class CallbackQueryContextBase {
	readonly api: Api;
	readonly update: t.Update;
	constructor(api: Api, update: t.Update) {
		this.api = api;
		this.update = update;
		Object.assign(this, update.callback_query ?? {});
	}
	/** Id of the user this update is from. */
	get senderId(): number {
		return this.from.id;
	}
	/** First name of the user this update is from. */
	get firstName(): string | undefined {
		return this.from.first_name;
	}
	/** Use this method to send text messages. On success, the sent [Message](https://core.telegram.org/bots/api/#message) is returned. */
	send(params: Omit<t.SendMessageParams, "chat_id">) {
		return this.api.call<t.Message>("sendMessage", { chat_id: this.message?.chat.id, ...params });
	}
	/** Use this method to send photos. On success, the sent [Message](https://core.telegram.org/bots/api/#message) is returned. */
	sendPhoto(params: Omit<t.SendPhotoParams, "chat_id">) {
		return this.api.call<t.Message>("sendPhoto", { chat_id: this.message?.chat.id, ...params });
	}
	/** Use this method to send audio files, if you want Telegram clients to display them in the music player. Your audio must be in the .MP3 or .M4A format. On success, the sent [Message](https://core.telegram.org/bots/api/#message) is returned. Bots can currently send audio files of up to 50 MB in size, this limit may be changed in the future.  For sending voice messages, use the [sendVoice](https://core.telegram.org/bots/api/#sendvoice) method instead. */
	sendAudio(params: Omit<t.SendAudioParams, "chat_id">) {
		return this.api.call<t.Message>("sendAudio", { chat_id: this.message?.chat.id, ...params });
	}
	/** Use this method to send general files. On success, the sent [Message](https://core.telegram.org/bots/api/#message) is returned. Bots can currently send files of any type of up to 50 MB in size, this limit may be changed in the future. */
	sendDocument(params: Omit<t.SendDocumentParams, "chat_id">) {
		return this.api.call<t.Message>("sendDocument", { chat_id: this.message?.chat.id, ...params });
	}
	/** Use this method to send video files, Telegram clients support MPEG4 videos (other formats may be sent as [Document](https://core.telegram.org/bots/api/#document)). On success, the sent [Message](https://core.telegram.org/bots/api/#message) is returned. Bots can currently send video files of up to 50 MB in size, this limit may be changed in the future. */
	sendVideo(params: Omit<t.SendVideoParams, "chat_id">) {
		return this.api.call<t.Message>("sendVideo", { chat_id: this.message?.chat.id, ...params });
	}
	/** Use this method to send animation files (GIF or H.264/MPEG-4 AVC video without sound). On success, the sent [Message](https://core.telegram.org/bots/api/#message) is returned. Bots can currently send animation files of up to 50 MB in size, this limit may be changed in the future. */
	sendAnimation(params: Omit<t.SendAnimationParams, "chat_id">) {
		return this.api.call<t.Message>("sendAnimation", { chat_id: this.message?.chat.id, ...params });
	}
	/** Use this method to send audio files, if you want Telegram clients to display the file as a playable voice message. For this to work, your audio must be in an .OGG file encoded with OPUS, or in .MP3 format, or in .M4A format (other formats may be sent as [Audio](https://core.telegram.org/bots/api/#audio) or [Document](https://core.telegram.org/bots/api/#document)). On success, the sent [Message](https://core.telegram.org/bots/api/#message) is returned. Bots can currently send voice messages of up to 50 MB in size, this limit may be changed in the future. */
	sendVoice(params: Omit<t.SendVoiceParams, "chat_id">) {
		return this.api.call<t.Message>("sendVoice", { chat_id: this.message?.chat.id, ...params });
	}
	/** As of [v.4.0](https://telegram.org/blog/video-messages-and-telescope), Telegram clients support rounded square MPEG4 videos of up to 1 minute long. Use this method to send video messages. On success, the sent [Message](https://core.telegram.org/bots/api/#message) is returned. */
	sendVideoNote(params: Omit<t.SendVideoNoteParams, "chat_id">) {
		return this.api.call<t.Message>("sendVideoNote", { chat_id: this.message?.chat.id, ...params });
	}
	/** Use this method to send paid media. On success, the sent [Message](https://core.telegram.org/bots/api/#message) is returned. */
	sendPaidMedia(params: Omit<t.SendPaidMediaParams, "chat_id">) {
		return this.api.call<t.Message>("sendPaidMedia", { chat_id: this.message?.chat.id, ...params });
	}
	/** Use this method to send a group of photos, videos, documents or audios as an album. Documents and audio files can be only grouped in an album with messages of the same type. On success, an array of [Messages](https://core.telegram.org/bots/api/#message) that were sent is returned. */
	sendMediaGroup(params: Omit<t.SendMediaGroupParams, "chat_id">) {
		return this.api.call<t.Message[]>("sendMediaGroup", { chat_id: this.message?.chat.id, ...params });
	}
	/** Use this method to send point on the map. On success, the sent [Message](https://core.telegram.org/bots/api/#message) is returned. */
	sendLocation(params: Omit<t.SendLocationParams, "chat_id">) {
		return this.api.call<t.Message>("sendLocation", { chat_id: this.message?.chat.id, ...params });
	}
	/** Use this method to send information about a venue. On success, the sent [Message](https://core.telegram.org/bots/api/#message) is returned. */
	sendVenue(params: Omit<t.SendVenueParams, "chat_id">) {
		return this.api.call<t.Message>("sendVenue", { chat_id: this.message?.chat.id, ...params });
	}
	/** Use this method to send phone contacts. On success, the sent [Message](https://core.telegram.org/bots/api/#message) is returned. */
	sendContact(params: Omit<t.SendContactParams, "chat_id">) {
		return this.api.call<t.Message>("sendContact", { chat_id: this.message?.chat.id, ...params });
	}
	/** Use this method to send a native poll. On success, the sent [Message](https://core.telegram.org/bots/api/#message) is returned. */
	sendPoll(params: Omit<t.SendPollParams, "chat_id">) {
		return this.api.call<t.Message>("sendPoll", { chat_id: this.message?.chat.id, ...params });
	}
	/** Use this method to send an animated emoji that will display a random value. On success, the sent [Message](https://core.telegram.org/bots/api/#message) is returned. */
	sendDice(params: Omit<t.SendDiceParams, "chat_id">) {
		return this.api.call<t.Message>("sendDice", { chat_id: this.message?.chat.id, ...params });
	}
	/** Use this method when you need to tell the user that something is happening on the bot's side. The status is set for 5 seconds or less (when a message arrives from your bot, Telegram clients clear its typing status). Returns *True* on success.  Example: The [ImageBot](https://t.me/imagebot) needs some time to process a request and upload the image. Instead of sending a text message along the lines of “Retrieving image, please wait…”, the bot may use [sendChatAction](https://core.telegram.org/bots/api/#sendchataction) with *action* = *upload\_photo*. The user will see a “sending photo” status for the bot.  We only recommend using this method when a response from the bot will take a **noticeable** amount of time to arrive. */
	sendChatAction(params: Omit<t.SendChatActionParams, "chat_id">) {
		return this.api.call<boolean>("sendChatAction", { chat_id: this.message?.chat.id, ...params });
	}
	/** Use this method to change the chosen reactions on a message. Service messages of some types can't be reacted to. Automatically forwarded messages from a channel to its discussion group have the same available reactions as messages in the channel. Bots can't use paid reactions. Returns *True* on success. */
	react(params: Omit<t.SetMessageReactionParams, "chat_id" | "message_id">) {
		return this.api.call<boolean>("setMessageReaction", { chat_id: this.message?.chat.id, message_id: this.message?.message_id, ...params });
	}
	/** Use this method to get a list of profile pictures for a user. Returns a [UserProfilePhotos](https://core.telegram.org/bots/api/#userprofilephotos) object. */
	getUserProfilePhotos(params: Omit<t.GetUserProfilePhotosParams, "user_id">) {
		return this.api.call<t.UserProfilePhotos>("getUserProfilePhotos", { user_id: this.from.id, ...params });
	}
	/** Changes the emoji status for a given user that previously allowed the bot to manage their emoji status via the Mini App method [requestEmojiStatusAccess](https://core.telegram.org/bots/webapps#initializing-mini-apps). Returns *True* on success. */
	setUserEmojiStatus(params: Omit<t.SetUserEmojiStatusParams, "user_id">) {
		return this.api.call<boolean>("setUserEmojiStatus", { user_id: this.from.id, ...params });
	}
	/** Use this method to ban a user in a group, a supergroup or a channel. In the case of supergroups and channels, the user will not be able to return to the chat on their own using invite links, etc., unless [unbanned](https://core.telegram.org/bots/api/#unbanchatmember) first. The bot must be an administrator in the chat for this to work and must have the appropriate administrator rights. Returns *True* on success. */
	banChatMember(params: Omit<t.BanChatMemberParams, "chat_id" | "user_id">) {
		return this.api.call<boolean>("banChatMember", { chat_id: this.message?.chat.id, user_id: this.from.id, ...params });
	}
	/** Use this method to unban a previously banned user in a supergroup or channel. The user will **not** return to the group or channel automatically, but will be able to join via link, etc. The bot must be an administrator for this to work. By default, this method guarantees that after the call the user is not a member of the chat, but will be able to join it. So if the user is a member of the chat they will also be **removed** from the chat. If you don't want this, use the parameter *only\_if\_banned*. Returns *True* on success. */
	unbanChatMember(params: Omit<t.UnbanChatMemberParams, "chat_id" | "user_id">) {
		return this.api.call<boolean>("unbanChatMember", { chat_id: this.message?.chat.id, user_id: this.from.id, ...params });
	}
	/** Use this method to restrict a user in a supergroup. The bot must be an administrator in the supergroup for this to work and must have the appropriate administrator rights. Pass *True* for all permissions to lift restrictions from a user. Returns *True* on success. */
	restrictChatMember(params: Omit<t.RestrictChatMemberParams, "chat_id" | "user_id">) {
		return this.api.call<boolean>("restrictChatMember", { chat_id: this.message?.chat.id, user_id: this.from.id, ...params });
	}
	/** Use this method to promote or demote a user in a supergroup or a channel. The bot must be an administrator in the chat for this to work and must have the appropriate administrator rights. Pass *False* for all boolean parameters to demote a user. Returns *True* on success. */
	promoteChatMember(params: Omit<t.PromoteChatMemberParams, "chat_id" | "user_id">) {
		return this.api.call<boolean>("promoteChatMember", { chat_id: this.message?.chat.id, user_id: this.from.id, ...params });
	}
	/** Use this method to set a custom title for an administrator in a supergroup promoted by the bot. Returns *True* on success. */
	setChatAdministratorCustomTitle(params: Omit<t.SetChatAdministratorCustomTitleParams, "chat_id" | "user_id">) {
		return this.api.call<boolean>("setChatAdministratorCustomTitle", { chat_id: this.message?.chat.id, user_id: this.from.id, ...params });
	}
	/** Use this method to ban a channel chat in a supergroup or a channel. Until the chat is [unbanned](https://core.telegram.org/bots/api/#unbanchatsenderchat), the owner of the banned chat won't be able to send messages on behalf of **any of their channels**. The bot must be an administrator in the supergroup or channel for this to work and must have the appropriate administrator rights. Returns *True* on success. */
	banChatSenderChat(params: Omit<t.BanChatSenderChatParams, "chat_id">) {
		return this.api.call<boolean>("banChatSenderChat", { chat_id: this.message?.chat.id, ...params });
	}
	/** Use this method to unban a previously banned channel chat in a supergroup or channel. The bot must be an administrator for this to work and must have the appropriate administrator rights. Returns *True* on success. */
	unbanChatSenderChat(params: Omit<t.UnbanChatSenderChatParams, "chat_id">) {
		return this.api.call<boolean>("unbanChatSenderChat", { chat_id: this.message?.chat.id, ...params });
	}
	/** Use this method to set default chat permissions for all members. The bot must be an administrator in the group or a supergroup for this to work and must have the *can\_restrict\_members* administrator rights. Returns *True* on success. */
	setChatPermissions(params: Omit<t.SetChatPermissionsParams, "chat_id">) {
		return this.api.call<boolean>("setChatPermissions", { chat_id: this.message?.chat.id, ...params });
	}
	/** Use this method to generate a new primary invite link for a chat; any previously generated primary link is revoked. The bot must be an administrator in the chat for this to work and must have the appropriate administrator rights. Returns the new invite link as *String* on success. */
	exportChatInviteLink(params?: Omit<t.ExportChatInviteLinkParams, "chat_id">) {
		return this.api.call<string>("exportChatInviteLink", { chat_id: this.message?.chat.id, ...params });
	}
	/** Use this method to create an additional invite link for a chat. The bot must be an administrator in the chat for this to work and must have the appropriate administrator rights. The link can be revoked using the method [revokeChatInviteLink](https://core.telegram.org/bots/api/#revokechatinvitelink). Returns the new invite link as [ChatInviteLink](https://core.telegram.org/bots/api/#chatinvitelink) object. */
	createChatInviteLink(params: Omit<t.CreateChatInviteLinkParams, "chat_id">) {
		return this.api.call<t.ChatInviteLink>("createChatInviteLink", { chat_id: this.message?.chat.id, ...params });
	}
	/** Use this method to edit a non-primary invite link created by the bot. The bot must be an administrator in the chat for this to work and must have the appropriate administrator rights. Returns the edited invite link as a [ChatInviteLink](https://core.telegram.org/bots/api/#chatinvitelink) object. */
	editChatInviteLink(params: Omit<t.EditChatInviteLinkParams, "chat_id">) {
		return this.api.call<t.ChatInviteLink>("editChatInviteLink", { chat_id: this.message?.chat.id, ...params });
	}
	/** Use this method to create a [subscription invite link](https://telegram.org/blog/superchannels-star-reactions-subscriptions#star-subscriptions) for a channel chat. The bot must have the *can\_invite\_users* administrator rights. The link can be edited using the method [editChatSubscriptionInviteLink](https://core.telegram.org/bots/api/#editchatsubscriptioninvitelink) or revoked using the method [revokeChatInviteLink](https://core.telegram.org/bots/api/#revokechatinvitelink). Returns the new invite link as a [ChatInviteLink](https://core.telegram.org/bots/api/#chatinvitelink) object. */
	createChatSubscriptionInviteLink(params: Omit<t.CreateChatSubscriptionInviteLinkParams, "chat_id">) {
		return this.api.call<t.ChatInviteLink>("createChatSubscriptionInviteLink", { chat_id: this.message?.chat.id, ...params });
	}
	/** Use this method to edit a subscription invite link created by the bot. The bot must have the *can\_invite\_users* administrator rights. Returns the edited invite link as a [ChatInviteLink](https://core.telegram.org/bots/api/#chatinvitelink) object. */
	editChatSubscriptionInviteLink(params: Omit<t.EditChatSubscriptionInviteLinkParams, "chat_id">) {
		return this.api.call<t.ChatInviteLink>("editChatSubscriptionInviteLink", { chat_id: this.message?.chat.id, ...params });
	}
	/** Use this method to revoke an invite link created by the bot. If the primary link is revoked, a new link is automatically generated. The bot must be an administrator in the chat for this to work and must have the appropriate administrator rights. Returns the revoked invite link as [ChatInviteLink](https://core.telegram.org/bots/api/#chatinvitelink) object. */
	revokeChatInviteLink(params: Omit<t.RevokeChatInviteLinkParams, "chat_id">) {
		return this.api.call<t.ChatInviteLink>("revokeChatInviteLink", { chat_id: this.message?.chat.id, ...params });
	}
	/** Use this method to approve a chat join request. The bot must be an administrator in the chat for this to work and must have the *can\_invite\_users* administrator right. Returns *True* on success. */
	approveChatJoinRequest(params?: Omit<t.ApproveChatJoinRequestParams, "chat_id" | "user_id">) {
		return this.api.call<boolean>("approveChatJoinRequest", { chat_id: this.message?.chat.id, user_id: this.from.id, ...params });
	}
	/** Use this method to decline a chat join request. The bot must be an administrator in the chat for this to work and must have the *can\_invite\_users* administrator right. Returns *True* on success. */
	declineChatJoinRequest(params?: Omit<t.DeclineChatJoinRequestParams, "chat_id" | "user_id">) {
		return this.api.call<boolean>("declineChatJoinRequest", { chat_id: this.message?.chat.id, user_id: this.from.id, ...params });
	}
	/** Use this method to set a new profile photo for the chat. Photos can't be changed for private chats. The bot must be an administrator in the chat for this to work and must have the appropriate administrator rights. Returns *True* on success. */
	setChatPhoto(params: Omit<t.SetChatPhotoParams, "chat_id">) {
		return this.api.call<boolean>("setChatPhoto", { chat_id: this.message?.chat.id, ...params });
	}
	/** Use this method to delete a chat photo. Photos can't be changed for private chats. The bot must be an administrator in the chat for this to work and must have the appropriate administrator rights. Returns *True* on success. */
	deleteChatPhoto(params?: Omit<t.DeleteChatPhotoParams, "chat_id">) {
		return this.api.call<boolean>("deleteChatPhoto", { chat_id: this.message?.chat.id, ...params });
	}
	/** Use this method to change the title of a chat. Titles can't be changed for private chats. The bot must be an administrator in the chat for this to work and must have the appropriate administrator rights. Returns *True* on success. */
	setChatTitle(params: Omit<t.SetChatTitleParams, "chat_id">) {
		return this.api.call<boolean>("setChatTitle", { chat_id: this.message?.chat.id, ...params });
	}
	/** Use this method to change the description of a group, a supergroup or a channel. The bot must be an administrator in the chat for this to work and must have the appropriate administrator rights. Returns *True* on success. */
	setChatDescription(params: Omit<t.SetChatDescriptionParams, "chat_id">) {
		return this.api.call<boolean>("setChatDescription", { chat_id: this.message?.chat.id, ...params });
	}
	/** Use this method to add a message to the list of pinned messages in a chat. If the chat is not a private chat, the bot must be an administrator in the chat for this to work and must have the 'can\_pin\_messages' administrator right in a supergroup or 'can\_edit\_messages' administrator right in a channel. Returns *True* on success. */
	pin(params: Omit<t.PinChatMessageParams, "chat_id" | "message_id">) {
		return this.api.call<boolean>("pinChatMessage", { chat_id: this.message?.chat.id, message_id: this.message?.message_id, ...params });
	}
	/** Use this method to remove a message from the list of pinned messages in a chat. If the chat is not a private chat, the bot must be an administrator in the chat for this to work and must have the 'can\_pin\_messages' administrator right in a supergroup or 'can\_edit\_messages' administrator right in a channel. Returns *True* on success. */
	unpin(params: Omit<t.UnpinChatMessageParams, "chat_id" | "message_id">) {
		return this.api.call<boolean>("unpinChatMessage", { chat_id: this.message?.chat.id, message_id: this.message?.message_id, ...params });
	}
	/** Use this method to clear the list of pinned messages in a chat. If the chat is not a private chat, the bot must be an administrator in the chat for this to work and must have the 'can\_pin\_messages' administrator right in a supergroup or 'can\_edit\_messages' administrator right in a channel. Returns *True* on success. */
	unpinAllChatMessages(params?: Omit<t.UnpinAllChatMessagesParams, "chat_id">) {
		return this.api.call<boolean>("unpinAllChatMessages", { chat_id: this.message?.chat.id, ...params });
	}
	/** Use this method for your bot to leave a group, supergroup or channel. Returns *True* on success. */
	leaveChat(params?: Omit<t.LeaveChatParams, "chat_id">) {
		return this.api.call<boolean>("leaveChat", { chat_id: this.message?.chat.id, ...params });
	}
	/** Use this method to get up-to-date information about the chat. Returns a [ChatFullInfo](https://core.telegram.org/bots/api/#chatfullinfo) object on success. */
	getChat(params?: Omit<t.GetChatParams, "chat_id">) {
		return this.api.call<t.ChatFullInfo>("getChat", { chat_id: this.message?.chat.id, ...params });
	}
	/** Use this method to get a list of administrators in a chat, which aren't bots. Returns an Array of [ChatMember](https://core.telegram.org/bots/api/#chatmember) objects. */
	getChatAdministrators(params?: Omit<t.GetChatAdministratorsParams, "chat_id">) {
		return this.api.call<t.ChatMember[]>("getChatAdministrators", { chat_id: this.message?.chat.id, ...params });
	}
	/** Use this method to get the number of members in a chat. Returns *Int* on success. */
	getChatMemberCount(params?: Omit<t.GetChatMemberCountParams, "chat_id">) {
		return this.api.call<number>("getChatMemberCount", { chat_id: this.message?.chat.id, ...params });
	}
	/** Use this method to get information about a member of a chat. The method is only guaranteed to work for other users if the bot is an administrator in the chat. Returns a [ChatMember](https://core.telegram.org/bots/api/#chatmember) object on success. */
	getChatMember(params?: Omit<t.GetChatMemberParams, "chat_id" | "user_id">) {
		return this.api.call<t.ChatMember>("getChatMember", { chat_id: this.message?.chat.id, user_id: this.from.id, ...params });
	}
	/** Use this method to set a new group sticker set for a supergroup. The bot must be an administrator in the chat for this to work and must have the appropriate administrator rights. Use the field *can\_set\_sticker\_set* optionally returned in [getChat](https://core.telegram.org/bots/api/#getchat) requests to check if the bot can use this method. Returns *True* on success. */
	setChatStickerSet(params: Omit<t.SetChatStickerSetParams, "chat_id">) {
		return this.api.call<boolean>("setChatStickerSet", { chat_id: this.message?.chat.id, ...params });
	}
	/** Use this method to delete a group sticker set from a supergroup. The bot must be an administrator in the chat for this to work and must have the appropriate administrator rights. Use the field *can\_set\_sticker\_set* optionally returned in [getChat](https://core.telegram.org/bots/api/#getchat) requests to check if the bot can use this method. Returns *True* on success. */
	deleteChatStickerSet(params?: Omit<t.DeleteChatStickerSetParams, "chat_id">) {
		return this.api.call<boolean>("deleteChatStickerSet", { chat_id: this.message?.chat.id, ...params });
	}
	/** Use this method to create a topic in a forum supergroup chat. The bot must be an administrator in the chat for this to work and must have the *can\_manage\_topics* administrator rights. Returns information about the created topic as a [ForumTopic](https://core.telegram.org/bots/api/#forumtopic) object. */
	createForumTopic(params: Omit<t.CreateForumTopicParams, "chat_id">) {
		return this.api.call<t.ForumTopic>("createForumTopic", { chat_id: this.message?.chat.id, ...params });
	}
	/** Use this method to edit name and icon of a topic in a forum supergroup chat. The bot must be an administrator in the chat for this to work and must have the *can\_manage\_topics* administrator rights, unless it is the creator of the topic. Returns *True* on success. */
	editForumTopic(params: Omit<t.EditForumTopicParams, "chat_id">) {
		return this.api.call<boolean>("editForumTopic", { chat_id: this.message?.chat.id, ...params });
	}
	/** Use this method to close an open topic in a forum supergroup chat. The bot must be an administrator in the chat for this to work and must have the *can\_manage\_topics* administrator rights, unless it is the creator of the topic. Returns *True* on success. */
	closeForumTopic(params: Omit<t.CloseForumTopicParams, "chat_id">) {
		return this.api.call<boolean>("closeForumTopic", { chat_id: this.message?.chat.id, ...params });
	}
	/** Use this method to reopen a closed topic in a forum supergroup chat. The bot must be an administrator in the chat for this to work and must have the *can\_manage\_topics* administrator rights, unless it is the creator of the topic. Returns *True* on success. */
	reopenForumTopic(params: Omit<t.ReopenForumTopicParams, "chat_id">) {
		return this.api.call<boolean>("reopenForumTopic", { chat_id: this.message?.chat.id, ...params });
	}
	/** Use this method to delete a forum topic along with all its messages in a forum supergroup chat. The bot must be an administrator in the chat for this to work and must have the *can\_delete\_messages* administrator rights. Returns *True* on success. */
	deleteForumTopic(params: Omit<t.DeleteForumTopicParams, "chat_id">) {
		return this.api.call<boolean>("deleteForumTopic", { chat_id: this.message?.chat.id, ...params });
	}
	/** Use this method to clear the list of pinned messages in a forum topic. The bot must be an administrator in the chat for this to work and must have the *can\_pin\_messages* administrator right in the supergroup. Returns *True* on success. */
	unpinAllForumTopicMessages(params: Omit<t.UnpinAllForumTopicMessagesParams, "chat_id">) {
		return this.api.call<boolean>("unpinAllForumTopicMessages", { chat_id: this.message?.chat.id, ...params });
	}
	/** Use this method to edit the name of the 'General' topic in a forum supergroup chat. The bot must be an administrator in the chat for this to work and must have the *can\_manage\_topics* administrator rights. Returns *True* on success. */
	editGeneralForumTopic(params: Omit<t.EditGeneralForumTopicParams, "chat_id">) {
		return this.api.call<boolean>("editGeneralForumTopic", { chat_id: this.message?.chat.id, ...params });
	}
	/** Use this method to close an open 'General' topic in a forum supergroup chat. The bot must be an administrator in the chat for this to work and must have the *can\_manage\_topics* administrator rights. Returns *True* on success. */
	closeGeneralForumTopic(params?: Omit<t.CloseGeneralForumTopicParams, "chat_id">) {
		return this.api.call<boolean>("closeGeneralForumTopic", { chat_id: this.message?.chat.id, ...params });
	}
	/** Use this method to reopen a closed 'General' topic in a forum supergroup chat. The bot must be an administrator in the chat for this to work and must have the *can\_manage\_topics* administrator rights. The topic will be automatically unhidden if it was hidden. Returns *True* on success. */
	reopenGeneralForumTopic(params?: Omit<t.ReopenGeneralForumTopicParams, "chat_id">) {
		return this.api.call<boolean>("reopenGeneralForumTopic", { chat_id: this.message?.chat.id, ...params });
	}
	/** Use this method to hide the 'General' topic in a forum supergroup chat. The bot must be an administrator in the chat for this to work and must have the *can\_manage\_topics* administrator rights. The topic will be automatically closed if it was open. Returns *True* on success. */
	hideGeneralForumTopic(params?: Omit<t.HideGeneralForumTopicParams, "chat_id">) {
		return this.api.call<boolean>("hideGeneralForumTopic", { chat_id: this.message?.chat.id, ...params });
	}
	/** Use this method to unhide the 'General' topic in a forum supergroup chat. The bot must be an administrator in the chat for this to work and must have the *can\_manage\_topics* administrator rights. Returns *True* on success. */
	unhideGeneralForumTopic(params?: Omit<t.UnhideGeneralForumTopicParams, "chat_id">) {
		return this.api.call<boolean>("unhideGeneralForumTopic", { chat_id: this.message?.chat.id, ...params });
	}
	/** Use this method to clear the list of pinned messages in a General forum topic. The bot must be an administrator in the chat for this to work and must have the *can\_pin\_messages* administrator right in the supergroup. Returns *True* on success. */
	unpinAllGeneralForumTopicMessages(params?: Omit<t.UnpinAllGeneralForumTopicMessagesParams, "chat_id">) {
		return this.api.call<boolean>("unpinAllGeneralForumTopicMessages", { chat_id: this.message?.chat.id, ...params });
	}
	/** Use this method to send answers to callback queries sent from [inline keyboards](https://core.telegram.org/bots/features#inline-keyboards). The answer will be displayed to the user as a notification at the top of the chat screen or as an alert. On success, *True* is returned.  Alternatively, the user can be redirected to the specified Game URL. For this option to work, you must first create a game for your bot via [@BotFather](https://t.me/botfather) and accept the terms. Otherwise, you may use links like `t.me/your_bot?start=XXXX` that open your bot with a parameter. */
	answer(params: Omit<t.AnswerCallbackQueryParams, "callback_query_id">) {
		return this.api.call<boolean>("answerCallbackQuery", { callback_query_id: this.id, ...params });
	}
	/** Use this method to get the list of boosts added to a chat by a user. Requires administrator rights in the chat. Returns a [UserChatBoosts](https://core.telegram.org/bots/api/#userchatboosts) object. */
	getUserChatBoosts(params?: Omit<t.GetUserChatBoostsParams, "chat_id" | "user_id">) {
		return this.api.call<t.UserChatBoosts>("getUserChatBoosts", { chat_id: this.message?.chat.id, user_id: this.from.id, ...params });
	}
	/** Use this method to change the bot's menu button in a private chat, or the default menu button. Returns *True* on success. */
	setChatMenuButton(params: Omit<t.SetChatMenuButtonParams, "chat_id">) {
		return this.api.call<boolean>("setChatMenuButton", { chat_id: this.message?.chat.id, ...params });
	}
	/** Use this method to get the current value of the bot's menu button in a private chat, or the default menu button. Returns [MenuButton](https://core.telegram.org/bots/api/#menubutton) on success. */
	getChatMenuButton(params?: Omit<t.GetChatMenuButtonParams, "chat_id">) {
		return this.api.call<t.MenuButton>("getChatMenuButton", { chat_id: this.message?.chat.id, ...params });
	}
	/** Use this method to edit text and [game](https://core.telegram.org/bots/api/#games) messages. On success, if the edited message is not an inline message, the edited [Message](https://core.telegram.org/bots/api/#message) is returned, otherwise *True* is returned. Note that business messages that were not sent by the bot and do not contain an inline keyboard can only be edited within **48 hours** from the time they were sent. */
	editText(params: Omit<t.EditMessageTextParams, "chat_id" | "message_id">) {
		return this.api.call<t.Message | boolean>("editMessageText", { chat_id: this.message?.chat.id, message_id: this.message?.message_id, ...params });
	}
	/** Use this method to edit captions of messages. On success, if the edited message is not an inline message, the edited [Message](https://core.telegram.org/bots/api/#message) is returned, otherwise *True* is returned. Note that business messages that were not sent by the bot and do not contain an inline keyboard can only be edited within **48 hours** from the time they were sent. */
	editCaption(params: Omit<t.EditMessageCaptionParams, "chat_id" | "message_id">) {
		return this.api.call<t.Message | boolean>("editMessageCaption", { chat_id: this.message?.chat.id, message_id: this.message?.message_id, ...params });
	}
	/** Use this method to edit animation, audio, document, photo, or video messages, or to add media to text messages. If a message is part of a message album, then it can be edited only to an audio for audio albums, only to a document for document albums and to a photo or a video otherwise. When an inline message is edited, a new file can't be uploaded; use a previously uploaded file via its file\_id or specify a URL. On success, if the edited message is not an inline message, the edited [Message](https://core.telegram.org/bots/api/#message) is returned, otherwise *True* is returned. Note that business messages that were not sent by the bot and do not contain an inline keyboard can only be edited within **48 hours** from the time they were sent. */
	editMedia(params: Omit<t.EditMessageMediaParams, "chat_id" | "message_id">) {
		return this.api.call<t.Message | boolean>("editMessageMedia", { chat_id: this.message?.chat.id, message_id: this.message?.message_id, ...params });
	}
	/** Use this method to edit live location messages. A location can be edited until its *live\_period* expires or editing is explicitly disabled by a call to [stopMessageLiveLocation](https://core.telegram.org/bots/api/#stopmessagelivelocation). On success, if the edited message is not an inline message, the edited [Message](https://core.telegram.org/bots/api/#message) is returned, otherwise *True* is returned. */
	editLiveLocation(params: Omit<t.EditMessageLiveLocationParams, "chat_id" | "message_id">) {
		return this.api.call<t.Message | boolean>("editMessageLiveLocation", { chat_id: this.message?.chat.id, message_id: this.message?.message_id, ...params });
	}
	/** Use this method to stop updating a live location message before *live\_period* expires. On success, if the message is not an inline message, the edited [Message](https://core.telegram.org/bots/api/#message) is returned, otherwise *True* is returned. */
	stopMessageLiveLocation(params: Omit<t.StopMessageLiveLocationParams, "chat_id" | "message_id">) {
		return this.api.call<t.Message | boolean>("stopMessageLiveLocation", { chat_id: this.message?.chat.id, message_id: this.message?.message_id, ...params });
	}
	/** Use this method to edit only the reply markup of messages. On success, if the edited message is not an inline message, the edited [Message](https://core.telegram.org/bots/api/#message) is returned, otherwise *True* is returned. Note that business messages that were not sent by the bot and do not contain an inline keyboard can only be edited within **48 hours** from the time they were sent. */
	editReplyMarkup(params: Omit<t.EditMessageReplyMarkupParams, "chat_id" | "message_id">) {
		return this.api.call<t.Message | boolean>("editMessageReplyMarkup", { chat_id: this.message?.chat.id, message_id: this.message?.message_id, ...params });
	}
	/** Use this method to stop a poll which was sent by the bot. On success, the stopped [Poll](https://core.telegram.org/bots/api/#poll) is returned. */
	stopPoll(params: Omit<t.StopPollParams, "chat_id" | "message_id">) {
		return this.api.call<t.Poll>("stopPoll", { chat_id: this.message?.chat.id, message_id: this.message?.message_id, ...params });
	}
	/** Use this method to delete a message, including service messages, with the following limitations:   \- A message can only be deleted if it was sent less than 48 hours ago.   \- Service messages about a supergroup, channel, or forum topic creation can't be deleted.   \- A dice message in a private chat can only be deleted if it was sent more than 24 hours ago.   \- Bots can delete outgoing messages in private chats, groups, and supergroups.   \- Bots can delete incoming messages in private chats.   \- Bots granted *can\_post\_messages* permissions can delete outgoing messages in channels.   \- If the bot is an administrator of a group, it can delete any message there.   \- If the bot has *can\_delete\_messages* permission in a supergroup or a channel, it can delete any message there.   Returns *True* on success. */
	delete(params?: Omit<t.DeleteMessageParams, "chat_id" | "message_id">) {
		return this.api.call<boolean>("deleteMessage", { chat_id: this.message?.chat.id, message_id: this.message?.message_id, ...params });
	}
	/** Use this method to delete multiple messages simultaneously. If some of the specified messages can't be found, they are skipped. Returns *True* on success. */
	deleteMessages(params: Omit<t.DeleteMessagesParams, "chat_id">) {
		return this.api.call<boolean>("deleteMessages", { chat_id: this.message?.chat.id, ...params });
	}
	/** Use this method to send static .WEBP, [animated](https://telegram.org/blog/animated-stickers) .TGS, or [video](https://telegram.org/blog/video-stickers-better-reactions) .WEBM stickers. On success, the sent [Message](https://core.telegram.org/bots/api/#message) is returned. */
	sendSticker(params: Omit<t.SendStickerParams, "chat_id">) {
		return this.api.call<t.Message>("sendSticker", { chat_id: this.message?.chat.id, ...params });
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
	/** Sends a gift to the given user or channel chat. The gift can't be converted to Telegram Stars by the receiver. Returns *True* on success. */
	sendGift(params: Omit<t.SendGiftParams, "user_id" | "chat_id">) {
		return this.api.call<boolean>("sendGift", { user_id: this.from.id, chat_id: this.message?.chat.id, ...params });
	}
	/** Verifies a user [on behalf of the organization](https://telegram.org/verify#third-party-verification) which is represented by the bot. Returns *True* on success. */
	verifyUser(params: Omit<t.VerifyUserParams, "user_id">) {
		return this.api.call<boolean>("verifyUser", { user_id: this.from.id, ...params });
	}
	/** Verifies a chat [on behalf of the organization](https://telegram.org/verify#third-party-verification) which is represented by the bot. Returns *True* on success. */
	verifyChat(params: Omit<t.VerifyChatParams, "chat_id">) {
		return this.api.call<boolean>("verifyChat", { chat_id: this.message?.chat.id, ...params });
	}
	/** Removes verification from a user who is currently verified [on behalf of the organization](https://telegram.org/verify#third-party-verification) represented by the bot. Returns *True* on success. */
	removeUserVerification(params?: Omit<t.RemoveUserVerificationParams, "user_id">) {
		return this.api.call<boolean>("removeUserVerification", { user_id: this.from.id, ...params });
	}
	/** Removes verification from a chat that is currently verified [on behalf of the organization](https://telegram.org/verify#third-party-verification) represented by the bot. Returns *True* on success. */
	removeChatVerification(params?: Omit<t.RemoveChatVerificationParams, "chat_id">) {
		return this.api.call<boolean>("removeChatVerification", { chat_id: this.message?.chat.id, ...params });
	}
	/** Stores a message that can be sent by a user of a Mini App. Returns a [PreparedInlineMessage](https://core.telegram.org/bots/api/#preparedinlinemessage) object. */
	savePreparedInlineMessage(params: Omit<t.SavePreparedInlineMessageParams, "user_id">) {
		return this.api.call<t.PreparedInlineMessage>("savePreparedInlineMessage", { user_id: this.from.id, ...params });
	}
	/** Use this method to send invoices. On success, the sent [Message](https://core.telegram.org/bots/api/#message) is returned. */
	sendInvoice(params: Omit<t.SendInvoiceParams, "chat_id">) {
		return this.api.call<t.Message>("sendInvoice", { chat_id: this.message?.chat.id, ...params });
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
	/** Use this method to send a game. On success, the sent [Message](https://core.telegram.org/bots/api/#message) is returned. */
	sendGame(params: Omit<t.SendGameParams, "chat_id">) {
		return this.api.call<t.Message>("sendGame", { chat_id: this.message?.chat.id, ...params });
	}
	/** Use this method to set the score of the specified user in a game message. On success, if the message is not an inline message, the [Message](https://core.telegram.org/bots/api/#message) is returned, otherwise *True* is returned. Returns an error, if the new score is not greater than the user's current score in the chat and *force* is *False*. */
	setGameScore(params: Omit<t.SetGameScoreParams, "user_id" | "chat_id" | "message_id">) {
		return this.api.call<t.Message | boolean>("setGameScore", { user_id: this.from.id, chat_id: this.message?.chat.id, message_id: this.message?.message_id, ...params });
	}
	/** Use this method to get data for high score tables. Will return the score of the specified user and several of their neighbors in a game. Returns an Array of [GameHighScore](https://core.telegram.org/bots/api/#gamehighscore) objects.  This method will currently return scores for the target user, plus two of their closest neighbors on each side. Will also return the top three users if the user and their neighbors are not among them. Please note that this behavior is subject to change. */
	getGameHighScores(params: Omit<t.GetGameHighScoresParams, "user_id" | "chat_id" | "message_id">) {
		return this.api.call<t.GameHighScore[]>("getGameHighScores", { user_id: this.from.id, chat_id: this.message?.chat.id, message_id: this.message?.message_id, ...params });
	}
}
