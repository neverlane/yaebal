// AUTO-GENERATED — do not edit by hand. regenerate: pnpm --filter @yaebal/contexts generate
import type { Api } from "@yaebal/core";
import { isMediaSource } from "@yaebal/core";
import type * as t from "@yaebal/types";

export interface MyChatMemberContext extends t.ChatMemberUpdated {}
export class MyChatMemberContext {
	readonly api: Api;
	readonly update: t.Update;
	constructor(api: Api, update: t.Update) {
		this.api = api;
		this.update = update;
		Object.assign(this, update.my_chat_member ?? {});
	}
	/** id of the user this update is from. */
	get senderId(): number {
		return this.from.id;
	}
	/** first name of the user this update is from. */
	get firstName(): string | undefined {
		return this.from.first_name;
	}
	/** id of the chat this update is in. */
	get chatId(): number {
		return this.chat.id;
	}
	/** whether this is a private (1:1) chat. */
	get isPM(): boolean {
		return this.chat.type === "private";
	}
	/** whether this is a group or supergroup. */
	get isGroup(): boolean {
		return this.chat.type === "group" || this.chat.type === "supergroup";
	}
	/** Use this method to send text messages. On success, the sent [Message](https://core.telegram.org/bots/api/#message) is returned. */
	send(params: Omit<t.SendMessageParams, "chat_id">) {
		return this.api.call<t.Message>("sendMessage", { chat_id: this.chat.id, ...params });
	}
	/** Use this method to send photos. On success, the sent [Message](https://core.telegram.org/bots/api/#message) is returned. */
	sendPhoto(photo: t.InputFile | string, params?: Omit<t.SendPhotoParams, "chat_id" | "photo">): Promise<t.Message>;
	sendPhoto(params: Omit<t.SendPhotoParams, "chat_id">): Promise<t.Message>;
	sendPhoto(a: t.InputFile | string | Omit<t.SendPhotoParams, "chat_id">, b?: Omit<t.SendPhotoParams, "chat_id" | "photo">): Promise<t.Message> {
		const params = a !== undefined && (typeof a === "string" || isMediaSource(a))
			? ({ photo: a, ...b } as unknown as Omit<t.SendPhotoParams, "chat_id">)
			: ((a ?? {}) as Omit<t.SendPhotoParams, "chat_id">);
		return this.api.call<t.Message>("sendPhoto", { chat_id: this.chat.id, ...params });
	}
	/** Use this method to send live photos. On success, the sent [Message](https://core.telegram.org/bots/api/#message) is returned. */
	sendLivePhoto(params: Omit<t.SendLivePhotoParams, "chat_id">) {
		return this.api.call<t.Message>("sendLivePhoto", { chat_id: this.chat.id, ...params });
	}
	/** Use this method to send audio files, if you want Telegram clients to display them in the music player. Your audio must be in the .MP3 or .M4A format. On success, the sent [Message](https://core.telegram.org/bots/api/#message) is returned. Bots can currently send audio files of up to 50 MB in size, this limit may be changed in the future.  For sending voice messages, use the [sendVoice](https://core.telegram.org/bots/api/#sendvoice) method instead. */
	sendAudio(audio: t.InputFile | string, params?: Omit<t.SendAudioParams, "chat_id" | "audio">): Promise<t.Message>;
	sendAudio(params: Omit<t.SendAudioParams, "chat_id">): Promise<t.Message>;
	sendAudio(a: t.InputFile | string | Omit<t.SendAudioParams, "chat_id">, b?: Omit<t.SendAudioParams, "chat_id" | "audio">): Promise<t.Message> {
		const params = a !== undefined && (typeof a === "string" || isMediaSource(a))
			? ({ audio: a, ...b } as unknown as Omit<t.SendAudioParams, "chat_id">)
			: ((a ?? {}) as Omit<t.SendAudioParams, "chat_id">);
		return this.api.call<t.Message>("sendAudio", { chat_id: this.chat.id, ...params });
	}
	/** Use this method to send general files. On success, the sent [Message](https://core.telegram.org/bots/api/#message) is returned. Bots can currently send files of any type of up to 50 MB in size, this limit may be changed in the future. */
	sendDocument(document: t.InputFile | string, params?: Omit<t.SendDocumentParams, "chat_id" | "document">): Promise<t.Message>;
	sendDocument(params: Omit<t.SendDocumentParams, "chat_id">): Promise<t.Message>;
	sendDocument(a: t.InputFile | string | Omit<t.SendDocumentParams, "chat_id">, b?: Omit<t.SendDocumentParams, "chat_id" | "document">): Promise<t.Message> {
		const params = a !== undefined && (typeof a === "string" || isMediaSource(a))
			? ({ document: a, ...b } as unknown as Omit<t.SendDocumentParams, "chat_id">)
			: ((a ?? {}) as Omit<t.SendDocumentParams, "chat_id">);
		return this.api.call<t.Message>("sendDocument", { chat_id: this.chat.id, ...params });
	}
	/** Use this method to send video files, Telegram clients support MPEG4 videos (other formats may be sent as [Document](https://core.telegram.org/bots/api/#document)). On success, the sent [Message](https://core.telegram.org/bots/api/#message) is returned. Bots can currently send video files of up to 50 MB in size, this limit may be changed in the future. */
	sendVideo(video: t.InputFile | string, params?: Omit<t.SendVideoParams, "chat_id" | "video">): Promise<t.Message>;
	sendVideo(params: Omit<t.SendVideoParams, "chat_id">): Promise<t.Message>;
	sendVideo(a: t.InputFile | string | Omit<t.SendVideoParams, "chat_id">, b?: Omit<t.SendVideoParams, "chat_id" | "video">): Promise<t.Message> {
		const params = a !== undefined && (typeof a === "string" || isMediaSource(a))
			? ({ video: a, ...b } as unknown as Omit<t.SendVideoParams, "chat_id">)
			: ((a ?? {}) as Omit<t.SendVideoParams, "chat_id">);
		return this.api.call<t.Message>("sendVideo", { chat_id: this.chat.id, ...params });
	}
	/** Use this method to send animation files (GIF or H.264/MPEG-4 AVC video without sound). On success, the sent [Message](https://core.telegram.org/bots/api/#message) is returned. Bots can currently send animation files of up to 50 MB in size, this limit may be changed in the future. */
	sendAnimation(animation: t.InputFile | string, params?: Omit<t.SendAnimationParams, "chat_id" | "animation">): Promise<t.Message>;
	sendAnimation(params: Omit<t.SendAnimationParams, "chat_id">): Promise<t.Message>;
	sendAnimation(a: t.InputFile | string | Omit<t.SendAnimationParams, "chat_id">, b?: Omit<t.SendAnimationParams, "chat_id" | "animation">): Promise<t.Message> {
		const params = a !== undefined && (typeof a === "string" || isMediaSource(a))
			? ({ animation: a, ...b } as unknown as Omit<t.SendAnimationParams, "chat_id">)
			: ((a ?? {}) as Omit<t.SendAnimationParams, "chat_id">);
		return this.api.call<t.Message>("sendAnimation", { chat_id: this.chat.id, ...params });
	}
	/** Use this method to send audio files, if you want Telegram clients to display the file as a playable voice message. For this to work, your audio must be in an .OGG file encoded with OPUS, or in .MP3 format, or in .M4A format (other formats may be sent as [Audio](https://core.telegram.org/bots/api/#audio) or [Document](https://core.telegram.org/bots/api/#document)). On success, the sent [Message](https://core.telegram.org/bots/api/#message) is returned. Bots can currently send voice messages of up to 50 MB in size, this limit may be changed in the future. */
	sendVoice(voice: t.InputFile | string, params?: Omit<t.SendVoiceParams, "chat_id" | "voice">): Promise<t.Message>;
	sendVoice(params: Omit<t.SendVoiceParams, "chat_id">): Promise<t.Message>;
	sendVoice(a: t.InputFile | string | Omit<t.SendVoiceParams, "chat_id">, b?: Omit<t.SendVoiceParams, "chat_id" | "voice">): Promise<t.Message> {
		const params = a !== undefined && (typeof a === "string" || isMediaSource(a))
			? ({ voice: a, ...b } as unknown as Omit<t.SendVoiceParams, "chat_id">)
			: ((a ?? {}) as Omit<t.SendVoiceParams, "chat_id">);
		return this.api.call<t.Message>("sendVoice", { chat_id: this.chat.id, ...params });
	}
	/** As of [v.4.0](https://telegram.org/blog/video-messages-and-telescope), Telegram clients support rounded square MPEG4 videos of up to 1 minute long. Use this method to send video messages. On success, the sent [Message](https://core.telegram.org/bots/api/#message) is returned. */
	sendVideoNote(videoNote: t.InputFile | string, params?: Omit<t.SendVideoNoteParams, "chat_id" | "video_note">): Promise<t.Message>;
	sendVideoNote(params: Omit<t.SendVideoNoteParams, "chat_id">): Promise<t.Message>;
	sendVideoNote(a: t.InputFile | string | Omit<t.SendVideoNoteParams, "chat_id">, b?: Omit<t.SendVideoNoteParams, "chat_id" | "video_note">): Promise<t.Message> {
		const params = a !== undefined && (typeof a === "string" || isMediaSource(a))
			? ({ video_note: a, ...b } as unknown as Omit<t.SendVideoNoteParams, "chat_id">)
			: ((a ?? {}) as Omit<t.SendVideoNoteParams, "chat_id">);
		return this.api.call<t.Message>("sendVideoNote", { chat_id: this.chat.id, ...params });
	}
	/** Use this method to send paid media. On success, the sent [Message](https://core.telegram.org/bots/api/#message) is returned. */
	sendPaidMedia(params: Omit<t.SendPaidMediaParams, "chat_id">) {
		return this.api.call<t.Message>("sendPaidMedia", { chat_id: this.chat.id, ...params });
	}
	/** Use this method to send a group of photos, live photos, videos, documents or audios as an album. Documents and audio files can be only grouped in an album with messages of the same type. On success, an array of [Message](https://core.telegram.org/bots/api/#message) objects that were sent is returned. */
	sendMediaGroup(params: Omit<t.SendMediaGroupParams, "chat_id">) {
		return this.api.call<t.Message[]>("sendMediaGroup", { chat_id: this.chat.id, ...params });
	}
	/** Use this method to send point on the map. On success, the sent [Message](https://core.telegram.org/bots/api/#message) is returned. */
	sendLocation(latitude: number, longitude: number, params?: Omit<t.SendLocationParams, "chat_id" | "latitude" | "longitude">): Promise<t.Message>;
	sendLocation(params: Omit<t.SendLocationParams, "chat_id">): Promise<t.Message>;
	sendLocation(a: number | Omit<t.SendLocationParams, "chat_id">, b?: number, c?: Omit<t.SendLocationParams, "chat_id" | "latitude" | "longitude">): Promise<t.Message> {
		const params = typeof a === "number" ? ({ latitude: a, longitude: b as number, ...c } as unknown as Omit<t.SendLocationParams, "chat_id">) : a;
		return this.api.call<t.Message>("sendLocation", { chat_id: this.chat.id, ...params });
	}
	/** Use this method to send information about a venue. On success, the sent [Message](https://core.telegram.org/bots/api/#message) is returned. */
	sendVenue(params: Omit<t.SendVenueParams, "chat_id">) {
		return this.api.call<t.Message>("sendVenue", { chat_id: this.chat.id, ...params });
	}
	/** Use this method to send phone contacts. On success, the sent [Message](https://core.telegram.org/bots/api/#message) is returned. */
	sendContact(params: Omit<t.SendContactParams, "chat_id">) {
		return this.api.call<t.Message>("sendContact", { chat_id: this.chat.id, ...params });
	}
	/** Use this method to send a native poll. On success, the sent [Message](https://core.telegram.org/bots/api/#message) is returned. */
	sendPoll(question: string, options: readonly (string | t.InputPollOption)[], params?: Omit<t.SendPollParams, "chat_id" | "question" | "options">): Promise<t.Message>;
	sendPoll(params: Omit<t.SendPollParams, "chat_id">): Promise<t.Message>;
	sendPoll(a: string | Omit<t.SendPollParams, "chat_id">, b?: readonly (string | t.InputPollOption)[], c?: Omit<t.SendPollParams, "chat_id" | "question" | "options">): Promise<t.Message> {
		const params = typeof a === "string"
			? ({ question: a, options: (b ?? []).map((o) => (typeof o === "string" ? { text: o } : o)), ...c } as unknown as Omit<t.SendPollParams, "chat_id">)
			: a;
		return this.api.call<t.Message>("sendPoll", { chat_id: this.chat.id, ...params });
	}
	/** Use this method to send an animated emoji that will display a random value. On success, the sent [Message](https://core.telegram.org/bots/api/#message) is returned. */
	sendDice(emoji: string, params?: Omit<t.SendDiceParams, "chat_id" | "emoji">): Promise<t.Message>;
	sendDice(params?: Omit<t.SendDiceParams, "chat_id">): Promise<t.Message>;
	sendDice(a?: string | Omit<t.SendDiceParams, "chat_id">, b?: Omit<t.SendDiceParams, "chat_id" | "emoji">): Promise<t.Message> {
		const params = a !== undefined && (typeof a === "string")
			? ({ emoji: a, ...b } as unknown as Omit<t.SendDiceParams, "chat_id">)
			: ((a ?? {}) as Omit<t.SendDiceParams, "chat_id">);
		return this.api.call<t.Message>("sendDice", { chat_id: this.chat.id, ...params });
	}
	/** Use this method to stream a partial message to a user while the message is being generated. Note that the streamed draft is ephemeral and acts as a temporary 30-second preview - once the output is finalized, you **must** call [sendMessage](https://core.telegram.org/bots/api/#sendmessage) with the complete message to persist it in the user's chat. Returns *True* on success. */
	sendMessageDraft(params: Omit<t.SendMessageDraftParams, "chat_id">) {
		return this.api.call<boolean>("sendMessageDraft", { chat_id: this.chat.id, ...params });
	}
	/** Use this method when you need to tell the user that something is happening on the bot's side. The status is set for 5 seconds or less (when a message arrives from your bot, Telegram clients clear its typing status). Returns *True* on success.  Example: The [ImageBot](https://t.me/imagebot) needs some time to process a request and upload the image. Instead of sending a text message along the lines of “Retrieving image, please wait…”, the bot may use [sendChatAction](https://core.telegram.org/bots/api/#sendchataction) with *action* = *upload\_photo*. The user will see a “sending photo” status for the bot.  We only recommend using this method when a response from the bot will take a **noticeable** amount of time to arrive. */
	sendChatAction(params: Omit<t.SendChatActionParams, "chat_id">) {
		return this.api.call<boolean>("sendChatAction", { chat_id: this.chat.id, ...params });
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
	/** Use this method to ban a user in a group, a supergroup or a channel. In the case of supergroups and channels, the user will not be able to return to the chat on their own using invite links, etc., unless [unbanned](https://core.telegram.org/bots/api/#unbanchatmember) first. The bot must be an administrator in the chat for this to work and must have the appropriate administrator rights. Returns *True* on success. */
	banChatMember(params: Omit<t.BanChatMemberParams, "chat_id" | "user_id">) {
		return this.api.call<boolean>("banChatMember", { chat_id: this.chat.id, user_id: this.from.id, ...params });
	}
	/** Use this method to unban a previously banned user in a supergroup or channel. The user will **not** return to the group or channel automatically, but will be able to join via link, etc. The bot must be an administrator for this to work. By default, this method guarantees that after the call the user is not a member of the chat, but will be able to join it. So if the user is a member of the chat they will also be **removed** from the chat. If you don't want this, use the parameter *only\_if\_banned*. Returns *True* on success. */
	unbanChatMember(params: Omit<t.UnbanChatMemberParams, "chat_id" | "user_id">) {
		return this.api.call<boolean>("unbanChatMember", { chat_id: this.chat.id, user_id: this.from.id, ...params });
	}
	/** Use this method to restrict a user in a supergroup. The bot must be an administrator in the supergroup for this to work and must have the appropriate administrator rights. Pass *True* for all permissions to lift restrictions from a user. Returns *True* on success. */
	restrictChatMember(params: Omit<t.RestrictChatMemberParams, "chat_id" | "user_id">) {
		return this.api.call<boolean>("restrictChatMember", { chat_id: this.chat.id, user_id: this.from.id, ...params });
	}
	/** Use this method to promote or demote a user in a supergroup or a channel. The bot must be an administrator in the chat for this to work and must have the appropriate administrator rights. Pass *False* for all boolean parameters to demote a user. Returns *True* on success. */
	promoteChatMember(params: Omit<t.PromoteChatMemberParams, "chat_id" | "user_id">) {
		return this.api.call<boolean>("promoteChatMember", { chat_id: this.chat.id, user_id: this.from.id, ...params });
	}
	/** Use this method to set a custom title for an administrator in a supergroup promoted by the bot. Returns *True* on success. */
	setChatAdministratorCustomTitle(params: Omit<t.SetChatAdministratorCustomTitleParams, "chat_id" | "user_id">) {
		return this.api.call<boolean>("setChatAdministratorCustomTitle", { chat_id: this.chat.id, user_id: this.from.id, ...params });
	}
	/** Use this method to set a tag for a regular member in a group or a supergroup. The bot must be an administrator in the chat for this to work and must have the *can\_manage\_tags* administrator right. Returns *True* on success. */
	setChatMemberTag(params: Omit<t.SetChatMemberTagParams, "chat_id" | "user_id">) {
		return this.api.call<boolean>("setChatMemberTag", { chat_id: this.chat.id, user_id: this.from.id, ...params });
	}
	/** Use this method to ban a channel chat in a supergroup or a channel. Until the chat is [unbanned](https://core.telegram.org/bots/api/#unbanchatsenderchat), the owner of the banned chat won't be able to send messages on behalf of **any of their channels**. The bot must be an administrator in the supergroup or channel for this to work and must have the appropriate administrator rights. Returns *True* on success. */
	banChatSenderChat(params: Omit<t.BanChatSenderChatParams, "chat_id">) {
		return this.api.call<boolean>("banChatSenderChat", { chat_id: this.chat.id, ...params });
	}
	/** Use this method to unban a previously banned channel chat in a supergroup or channel. The bot must be an administrator for this to work and must have the appropriate administrator rights. Returns *True* on success. */
	unbanChatSenderChat(params: Omit<t.UnbanChatSenderChatParams, "chat_id">) {
		return this.api.call<boolean>("unbanChatSenderChat", { chat_id: this.chat.id, ...params });
	}
	/** Use this method to set default chat permissions for all members. The bot must be an administrator in the group or a supergroup for this to work and must have the *can\_restrict\_members* administrator rights. Returns *True* on success. */
	setChatPermissions(params: Omit<t.SetChatPermissionsParams, "chat_id">) {
		return this.api.call<boolean>("setChatPermissions", { chat_id: this.chat.id, ...params });
	}
	/** Use this method to generate a new primary invite link for a chat; any previously generated primary link is revoked. The bot must be an administrator in the chat for this to work and must have the appropriate administrator rights. Returns the new invite link as *String* on success. */
	exportChatInviteLink(params?: Omit<t.ExportChatInviteLinkParams, "chat_id">) {
		return this.api.call<string>("exportChatInviteLink", { chat_id: this.chat.id, ...params });
	}
	/** Use this method to create an additional invite link for a chat. The bot must be an administrator in the chat for this to work and must have the appropriate administrator rights. The link can be revoked using the method [revokeChatInviteLink](https://core.telegram.org/bots/api/#revokechatinvitelink). Returns the new invite link as [ChatInviteLink](https://core.telegram.org/bots/api/#chatinvitelink) object. */
	createChatInviteLink(params: Omit<t.CreateChatInviteLinkParams, "chat_id">) {
		return this.api.call<t.ChatInviteLink>("createChatInviteLink", { chat_id: this.chat.id, ...params });
	}
	/** Use this method to edit a non-primary invite link created by the bot. The bot must be an administrator in the chat for this to work and must have the appropriate administrator rights. Returns the edited invite link as a [ChatInviteLink](https://core.telegram.org/bots/api/#chatinvitelink) object. */
	editChatInviteLink(params: Omit<t.EditChatInviteLinkParams, "chat_id">) {
		return this.api.call<t.ChatInviteLink>("editChatInviteLink", { chat_id: this.chat.id, ...params });
	}
	/** Use this method to create a [subscription invite link](https://telegram.org/blog/superchannels-star-reactions-subscriptions#star-subscriptions) for a channel chat. The bot must have the *can\_invite\_users* administrator rights. The link can be edited using the method [editChatSubscriptionInviteLink](https://core.telegram.org/bots/api/#editchatsubscriptioninvitelink) or revoked using the method [revokeChatInviteLink](https://core.telegram.org/bots/api/#revokechatinvitelink). Returns the new invite link as a [ChatInviteLink](https://core.telegram.org/bots/api/#chatinvitelink) object. */
	createChatSubscriptionInviteLink(params: Omit<t.CreateChatSubscriptionInviteLinkParams, "chat_id">) {
		return this.api.call<t.ChatInviteLink>("createChatSubscriptionInviteLink", { chat_id: this.chat.id, ...params });
	}
	/** Use this method to edit a subscription invite link created by the bot. The bot must have the *can\_invite\_users* administrator rights. Returns the edited invite link as a [ChatInviteLink](https://core.telegram.org/bots/api/#chatinvitelink) object. */
	editChatSubscriptionInviteLink(params: Omit<t.EditChatSubscriptionInviteLinkParams, "chat_id">) {
		return this.api.call<t.ChatInviteLink>("editChatSubscriptionInviteLink", { chat_id: this.chat.id, ...params });
	}
	/** Use this method to revoke an invite link created by the bot. If the primary link is revoked, a new link is automatically generated. The bot must be an administrator in the chat for this to work and must have the appropriate administrator rights. Returns the revoked invite link as [ChatInviteLink](https://core.telegram.org/bots/api/#chatinvitelink) object. */
	revokeChatInviteLink(params: Omit<t.RevokeChatInviteLinkParams, "chat_id">) {
		return this.api.call<t.ChatInviteLink>("revokeChatInviteLink", { chat_id: this.chat.id, ...params });
	}
	/** Use this method to approve a chat join request. The bot must be an administrator in the chat for this to work and must have the *can\_invite\_users* administrator right. Returns *True* on success. */
	approveChatJoinRequest(params?: Omit<t.ApproveChatJoinRequestParams, "chat_id" | "user_id">) {
		return this.api.call<boolean>("approveChatJoinRequest", { chat_id: this.chat.id, user_id: this.from.id, ...params });
	}
	/** Use this method to decline a chat join request. The bot must be an administrator in the chat for this to work and must have the *can\_invite\_users* administrator right. Returns *True* on success. */
	declineChatJoinRequest(params?: Omit<t.DeclineChatJoinRequestParams, "chat_id" | "user_id">) {
		return this.api.call<boolean>("declineChatJoinRequest", { chat_id: this.chat.id, user_id: this.from.id, ...params });
	}
	/** Use this method to set a new profile photo for the chat. Photos can't be changed for private chats. The bot must be an administrator in the chat for this to work and must have the appropriate administrator rights. Returns *True* on success. */
	setChatPhoto(params: Omit<t.SetChatPhotoParams, "chat_id">) {
		return this.api.call<boolean>("setChatPhoto", { chat_id: this.chat.id, ...params });
	}
	/** Use this method to delete a chat photo. Photos can't be changed for private chats. The bot must be an administrator in the chat for this to work and must have the appropriate administrator rights. Returns *True* on success. */
	deleteChatPhoto(params?: Omit<t.DeleteChatPhotoParams, "chat_id">) {
		return this.api.call<boolean>("deleteChatPhoto", { chat_id: this.chat.id, ...params });
	}
	/** Use this method to change the title of a chat. Titles can't be changed for private chats. The bot must be an administrator in the chat for this to work and must have the appropriate administrator rights. Returns *True* on success. */
	setChatTitle(params: Omit<t.SetChatTitleParams, "chat_id">) {
		return this.api.call<boolean>("setChatTitle", { chat_id: this.chat.id, ...params });
	}
	/** Use this method to change the description of a group, a supergroup or a channel. The bot must be an administrator in the chat for this to work and must have the appropriate administrator rights. Returns *True* on success. */
	setChatDescription(params: Omit<t.SetChatDescriptionParams, "chat_id">) {
		return this.api.call<boolean>("setChatDescription", { chat_id: this.chat.id, ...params });
	}
	/** Use this method to remove a message from the list of pinned messages in a chat. In private chats and channel direct messages chats, all messages can be unpinned. Conversely, the bot must be an administrator with the 'can_pin_messages' right or the 'can_edit_messages' right to unpin messages in groups and channels respectively. Returns *True* on success. */
	unpin(params: Omit<t.UnpinChatMessageParams, "chat_id">) {
		return this.api.call<boolean>("unpinChatMessage", { chat_id: this.chat.id, ...params });
	}
	/** Use this method to clear the list of pinned messages in a chat. In private chats and channel direct messages chats, no additional rights are required to unpin all pinned messages. Conversely, the bot must be an administrator with the 'can_pin_messages' right or the 'can_edit_messages' right to unpin all pinned messages in groups and channels respectively. Returns *True* on success. */
	unpinAllChatMessages(params?: Omit<t.UnpinAllChatMessagesParams, "chat_id">) {
		return this.api.call<boolean>("unpinAllChatMessages", { chat_id: this.chat.id, ...params });
	}
	/** Use this method for your bot to leave a group, supergroup or channel. Returns *True* on success. */
	leaveChat(params?: Omit<t.LeaveChatParams, "chat_id">) {
		return this.api.call<boolean>("leaveChat", { chat_id: this.chat.id, ...params });
	}
	/** Use this method to get up-to-date information about the chat. Returns a [ChatFullInfo](https://core.telegram.org/bots/api/#chatfullinfo) object on success. */
	getChat(params?: Omit<t.GetChatParams, "chat_id">) {
		return this.api.call<t.ChatFullInfo>("getChat", { chat_id: this.chat.id, ...params });
	}
	/** Use this method to get a list of administrators in a chat. Returns an Array of [ChatMember](https://core.telegram.org/bots/api/#chatmember) objects. */
	getChatAdministrators(params: Omit<t.GetChatAdministratorsParams, "chat_id">) {
		return this.api.call<t.ChatMember[]>("getChatAdministrators", { chat_id: this.chat.id, ...params });
	}
	/** Use this method to get the number of members in a chat. Returns *Int* on success. */
	getChatMemberCount(params?: Omit<t.GetChatMemberCountParams, "chat_id">) {
		return this.api.call<number>("getChatMemberCount", { chat_id: this.chat.id, ...params });
	}
	/** Use this method to get information about a member of a chat. The method is only guaranteed to work for other users if the bot is an administrator in the chat. Returns a [ChatMember](https://core.telegram.org/bots/api/#chatmember) object on success. */
	getChatMember(params?: Omit<t.GetChatMemberParams, "chat_id" | "user_id">) {
		return this.api.call<t.ChatMember>("getChatMember", { chat_id: this.chat.id, user_id: this.from.id, ...params });
	}
	/** Use this method to get the last messages from the personal chat (i.e., the chat currently added to their profile) of a given user. On success, an array of [Message](https://core.telegram.org/bots/api/#message) objects is returned. */
	getUserPersonalChatMessages(params: Omit<t.GetUserPersonalChatMessagesParams, "user_id">) {
		return this.api.call<t.Message[]>("getUserPersonalChatMessages", { user_id: this.from.id, ...params });
	}
	/** Use this method to set a new group sticker set for a supergroup. The bot must be an administrator in the chat for this to work and must have the appropriate administrator rights. Use the field *can\_set\_sticker\_set* optionally returned in [getChat](https://core.telegram.org/bots/api/#getchat) requests to check if the bot can use this method. Returns *True* on success. */
	setChatStickerSet(params: Omit<t.SetChatStickerSetParams, "chat_id">) {
		return this.api.call<boolean>("setChatStickerSet", { chat_id: this.chat.id, ...params });
	}
	/** Use this method to delete a group sticker set from a supergroup. The bot must be an administrator in the chat for this to work and must have the appropriate administrator rights. Use the field *can\_set\_sticker\_set* optionally returned in [getChat](https://core.telegram.org/bots/api/#getchat) requests to check if the bot can use this method. Returns *True* on success. */
	deleteChatStickerSet(params?: Omit<t.DeleteChatStickerSetParams, "chat_id">) {
		return this.api.call<boolean>("deleteChatStickerSet", { chat_id: this.chat.id, ...params });
	}
	/** Use this method to create a topic in a forum supergroup chat or a private chat with a user. In the case of a supergroup chat the bot must be an administrator in the chat for this to work and must have the *can\_manage\_topics* administrator right. Returns information about the created topic as a [ForumTopic](https://core.telegram.org/bots/api/#forumtopic) object. */
	createForumTopic(params: Omit<t.CreateForumTopicParams, "chat_id">) {
		return this.api.call<t.ForumTopic>("createForumTopic", { chat_id: this.chat.id, ...params });
	}
	/** Use this method to edit the name of the 'General' topic in a forum supergroup chat. The bot must be an administrator in the chat for this to work and must have the *can\_manage\_topics* administrator rights. Returns *True* on success. */
	editGeneralForumTopic(params: Omit<t.EditGeneralForumTopicParams, "chat_id">) {
		return this.api.call<boolean>("editGeneralForumTopic", { chat_id: this.chat.id, ...params });
	}
	/** Use this method to close an open 'General' topic in a forum supergroup chat. The bot must be an administrator in the chat for this to work and must have the *can\_manage\_topics* administrator rights. Returns *True* on success. */
	closeGeneralForumTopic(params?: Omit<t.CloseGeneralForumTopicParams, "chat_id">) {
		return this.api.call<boolean>("closeGeneralForumTopic", { chat_id: this.chat.id, ...params });
	}
	/** Use this method to reopen a closed 'General' topic in a forum supergroup chat. The bot must be an administrator in the chat for this to work and must have the *can\_manage\_topics* administrator rights. The topic will be automatically unhidden if it was hidden. Returns *True* on success. */
	reopenGeneralForumTopic(params?: Omit<t.ReopenGeneralForumTopicParams, "chat_id">) {
		return this.api.call<boolean>("reopenGeneralForumTopic", { chat_id: this.chat.id, ...params });
	}
	/** Use this method to hide the 'General' topic in a forum supergroup chat. The bot must be an administrator in the chat for this to work and must have the *can\_manage\_topics* administrator rights. The topic will be automatically closed if it was open. Returns *True* on success. */
	hideGeneralForumTopic(params?: Omit<t.HideGeneralForumTopicParams, "chat_id">) {
		return this.api.call<boolean>("hideGeneralForumTopic", { chat_id: this.chat.id, ...params });
	}
	/** Use this method to unhide the 'General' topic in a forum supergroup chat. The bot must be an administrator in the chat for this to work and must have the *can\_manage\_topics* administrator rights. Returns *True* on success. */
	unhideGeneralForumTopic(params?: Omit<t.UnhideGeneralForumTopicParams, "chat_id">) {
		return this.api.call<boolean>("unhideGeneralForumTopic", { chat_id: this.chat.id, ...params });
	}
	/** Use this method to clear the list of pinned messages in a General forum topic. The bot must be an administrator in the chat for this to work and must have the *can\_pin\_messages* administrator right in the supergroup. Returns *True* on success. */
	unpinAllGeneralForumTopicMessages(params?: Omit<t.UnpinAllGeneralForumTopicMessagesParams, "chat_id">) {
		return this.api.call<boolean>("unpinAllGeneralForumTopicMessages", { chat_id: this.chat.id, ...params });
	}
	/** Use this method to get the list of boosts added to a chat by a user. Requires administrator rights in the chat. Returns a [UserChatBoosts](https://core.telegram.org/bots/api/#userchatboosts) object. */
	getUserChatBoosts(params?: Omit<t.GetUserChatBoostsParams, "chat_id" | "user_id">) {
		return this.api.call<t.UserChatBoosts>("getUserChatBoosts", { chat_id: this.chat.id, user_id: this.from.id, ...params });
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
	/** Use this method to change the bot's menu button in a private chat, or the default menu button. Returns *True* on success. */
	setChatMenuButton(params: Omit<t.SetChatMenuButtonParams, "chat_id">) {
		return this.api.call<boolean>("setChatMenuButton", { chat_id: this.chat.id, ...params });
	}
	/** Use this method to get the current value of the bot's menu button in a private chat, or the default menu button. Returns [MenuButton](https://core.telegram.org/bots/api/#menubutton) on success. */
	getChatMenuButton(params?: Omit<t.GetChatMenuButtonParams, "chat_id">) {
		return this.api.call<t.MenuButton>("getChatMenuButton", { chat_id: this.chat.id, ...params });
	}
	/** Sends a gift to the given user or channel chat. The gift can't be converted to Telegram Stars by the receiver. Returns *True* on success. */
	sendGift(params: Omit<t.SendGiftParams, "user_id">) {
		return this.api.call<boolean>("sendGift", { ...((params?.chat_id !== undefined || (this.from.id) === undefined) ? {} : { user_id: this.from.id }), ...params });
	}
	/** Gifts a Telegram Premium subscription to the given user. Returns *True* on success. */
	giftPremiumSubscription(params: Omit<t.GiftPremiumSubscriptionParams, "user_id">) {
		return this.api.call<boolean>("giftPremiumSubscription", { user_id: this.from.id, ...params });
	}
	/** Verifies a user [on behalf of the organization](https://telegram.org/verify#third-party-verification) which is represented by the bot. Returns *True* on success. */
	verifyUser(params: Omit<t.VerifyUserParams, "user_id">) {
		return this.api.call<boolean>("verifyUser", { user_id: this.from.id, ...params });
	}
	/** Verifies a chat [on behalf of the organization](https://telegram.org/verify#third-party-verification) which is represented by the bot. Returns *True* on success. */
	verifyChat(params: Omit<t.VerifyChatParams, "chat_id">) {
		return this.api.call<boolean>("verifyChat", { chat_id: this.chat.id, ...params });
	}
	/** Removes verification from a user who is currently verified [on behalf of the organization](https://telegram.org/verify#third-party-verification) represented by the bot. Returns *True* on success. */
	removeUserVerification(params?: Omit<t.RemoveUserVerificationParams, "user_id">) {
		return this.api.call<boolean>("removeUserVerification", { user_id: this.from.id, ...params });
	}
	/** Removes verification from a chat that is currently verified [on behalf of the organization](https://telegram.org/verify#third-party-verification) represented by the bot. Returns *True* on success. */
	removeChatVerification(params?: Omit<t.RemoveChatVerificationParams, "chat_id">) {
		return this.api.call<boolean>("removeChatVerification", { chat_id: this.chat.id, ...params });
	}
	/** Returns the gifts owned and hosted by a user. Returns [OwnedGifts](https://core.telegram.org/bots/api/#ownedgifts) on success. */
	getUserGifts(params: Omit<t.GetUserGiftsParams, "user_id">) {
		return this.api.call<t.OwnedGifts>("getUserGifts", { user_id: this.from.id, ...params });
	}
	/** Returns the gifts owned by a chat. Returns [OwnedGifts](https://core.telegram.org/bots/api/#ownedgifts) on success. */
	getChatGifts(params: Omit<t.GetChatGiftsParams, "chat_id">) {
		return this.api.call<t.OwnedGifts>("getChatGifts", { chat_id: this.chat.id, ...params });
	}
	/** Stores a message that can be sent by a user of a Mini App. Returns a [PreparedInlineMessage](https://core.telegram.org/bots/api/#preparedinlinemessage) object. */
	savePreparedInlineMessage(params: Omit<t.SavePreparedInlineMessageParams, "user_id">) {
		return this.api.call<t.PreparedInlineMessage>("savePreparedInlineMessage", { user_id: this.from.id, ...params });
	}
	/** Stores a keyboard button that can be used by a user within a Mini App. Returns a [PreparedKeyboardButton](https://core.telegram.org/bots/api/#preparedkeyboardbutton) object. */
	savePreparedKeyboardButton(params: Omit<t.SavePreparedKeyboardButtonParams, "user_id">) {
		return this.api.call<t.PreparedKeyboardButton>("savePreparedKeyboardButton", { user_id: this.from.id, ...params });
	}
	/** Use this method to edit text, rich and [game](https://core.telegram.org/bots/api/#games) messages. On success, if the edited message is not an inline message, the edited [Message](https://core.telegram.org/bots/api/#message) is returned, otherwise *True* is returned. Note that business messages that were not sent by the bot and do not contain an inline keyboard can only be edited within **48 hours** from the time they were sent. */
	editText(params: Omit<t.EditMessageTextParams, "chat_id">) {
		return this.api.call<t.Message | boolean>("editMessageText", { chat_id: this.chat.id, ...params });
	}
	/** Use this method to edit captions of messages. On success, if the edited message is not an inline message, the edited [Message](https://core.telegram.org/bots/api/#message) is returned, otherwise *True* is returned. Note that business messages that were not sent by the bot and do not contain an inline keyboard can only be edited within **48 hours** from the time they were sent. */
	editCaption(params: Omit<t.EditMessageCaptionParams, "chat_id">) {
		return this.api.call<t.Message | boolean>("editMessageCaption", { chat_id: this.chat.id, ...params });
	}
	/** Use this method to edit animation, audio, document, live photo, photo, or video messages, or to replace a text or a rich message with a media. If a message is part of a message album, then it can be edited only to an audio for audio albums, only to a document for document albums and to a photo, a live photo, or a video otherwise. When an inline message is edited, a new file can't be uploaded; use a previously uploaded file via its file_id or specify a URL. On success, if the edited message is not an inline message, the edited [Message](https://core.telegram.org/bots/api/#message) is returned, otherwise *True* is returned. Note that business messages that were not sent by the bot and do not contain an inline keyboard can only be edited within **48 hours** from the time they were sent. */
	editMedia(params: Omit<t.EditMessageMediaParams, "chat_id">) {
		return this.api.call<t.Message | boolean>("editMessageMedia", { chat_id: this.chat.id, ...params });
	}
	/** Use this method to edit live location messages. A location can be edited until its *live\_period* expires or editing is explicitly disabled by a call to [stopMessageLiveLocation](https://core.telegram.org/bots/api/#stopmessagelivelocation). On success, if the edited message is not an inline message, the edited [Message](https://core.telegram.org/bots/api/#message) is returned, otherwise *True* is returned. */
	editLiveLocation(params: Omit<t.EditMessageLiveLocationParams, "chat_id">) {
		return this.api.call<t.Message | boolean>("editMessageLiveLocation", { chat_id: this.chat.id, ...params });
	}
	/** Use this method to stop updating a live location message before *live\_period* expires. On success, if the message is not an inline message, the edited [Message](https://core.telegram.org/bots/api/#message) is returned, otherwise *True* is returned. */
	stopMessageLiveLocation(params: Omit<t.StopMessageLiveLocationParams, "chat_id">) {
		return this.api.call<t.Message | boolean>("stopMessageLiveLocation", { chat_id: this.chat.id, ...params });
	}
	/** Use this method to edit only the reply markup of messages. On success, if the edited message is not an inline message, the edited [Message](https://core.telegram.org/bots/api/#message) is returned, otherwise *True* is returned. Note that business messages that were not sent by the bot and do not contain an inline keyboard can only be edited within **48 hours** from the time they were sent. */
	editReplyMarkup(replyMarkup: t.InlineKeyboardMarkup | { toJSON(): t.InlineKeyboardMarkup }, params?: Omit<t.EditMessageReplyMarkupParams, "chat_id" | "reply_markup">): Promise<t.Message | boolean>;
	editReplyMarkup(params?: Omit<t.EditMessageReplyMarkupParams, "chat_id">): Promise<t.Message | boolean>;
	editReplyMarkup(a?: t.InlineKeyboardMarkup | { toJSON(): t.InlineKeyboardMarkup } | Omit<t.EditMessageReplyMarkupParams, "chat_id">, b?: Omit<t.EditMessageReplyMarkupParams, "chat_id" | "reply_markup">): Promise<t.Message | boolean> {
		const params = a !== undefined && (typeof a === "object" && a !== null && ("inline_keyboard" in a || "toJSON" in a))
			? ({ reply_markup: a, ...b } as unknown as Omit<t.EditMessageReplyMarkupParams, "chat_id">)
			: ((a ?? {}) as Omit<t.EditMessageReplyMarkupParams, "chat_id">);
		return this.api.call<t.Message | boolean>("editMessageReplyMarkup", { chat_id: this.chat.id, ...params });
	}
	/** Use this method to delete multiple messages simultaneously. If some of the specified messages can't be found, they are skipped. Returns *True* on success. */
	deleteMessages(params: Omit<t.DeleteMessagesParams, "chat_id">) {
		return this.api.call<boolean>("deleteMessages", { chat_id: this.chat.id, ...params });
	}
	/** Use this method to remove up to 10000 recent reactions in a group or a supergroup chat added by a given user or chat. The bot must have the 'can_delete_messages' administrator right in the chat. Returns *True* on success. */
	deleteAllMessageReactions(params: Omit<t.DeleteAllMessageReactionsParams, "chat_id" | "user_id">) {
		return this.api.call<boolean>("deleteAllMessageReactions", { chat_id: this.chat.id, user_id: this.from.id, ...params });
	}
	/** Use this method to send static .WEBP, [animated](https://telegram.org/blog/animated-stickers) .TGS, or [video](https://telegram.org/blog/video-stickers-better-reactions) .WEBM stickers. On success, the sent [Message](https://core.telegram.org/bots/api/#message) is returned. */
	sendSticker(sticker: t.InputFile | string, params?: Omit<t.SendStickerParams, "chat_id" | "sticker">): Promise<t.Message>;
	sendSticker(params: Omit<t.SendStickerParams, "chat_id">): Promise<t.Message>;
	sendSticker(a: t.InputFile | string | Omit<t.SendStickerParams, "chat_id">, b?: Omit<t.SendStickerParams, "chat_id" | "sticker">): Promise<t.Message> {
		const params = a !== undefined && (typeof a === "string" || isMediaSource(a))
			? ({ sticker: a, ...b } as unknown as Omit<t.SendStickerParams, "chat_id">)
			: ((a ?? {}) as Omit<t.SendStickerParams, "chat_id">);
		return this.api.call<t.Message>("sendSticker", { chat_id: this.chat.id, ...params });
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
	/** Use this method to send rich messages. If the message contains a block with a media element, then the bot must have the right to send the media to the chat. On success, the sent [Message](https://core.telegram.org/bots/api/#message) is returned. */
	sendRichMessage(params: Omit<t.SendRichMessageParams, "chat_id">) {
		return this.api.call<t.Message>("sendRichMessage", { chat_id: this.chat.id, ...params });
	}
	/** Use this method to stream a partial rich message to a user while the message is being generated. Note that the streamed draft is ephemeral and acts as a temporary 30-second preview - once the output is finalized, you **must** call [sendRichMessage](https://core.telegram.org/bots/api/#sendrichmessage) with the complete message to persist it in the user's chat. Returns *True* on success. */
	sendRichMessageDraft(params: Omit<t.SendRichMessageDraftParams, "chat_id">) {
		return this.api.call<boolean>("sendRichMessageDraft", { chat_id: this.chat.id, ...params });
	}
	/** Use this method to send invoices. On success, the sent [Message](https://core.telegram.org/bots/api/#message) is returned. */
	sendInvoice(params: Omit<t.SendInvoiceParams, "chat_id">) {
		return this.api.call<t.Message>("sendInvoice", { chat_id: this.chat.id, ...params });
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
		return this.api.call<t.Message>("sendGame", { chat_id: this.chat.id, ...params });
	}
	/** Use this method to set the score of the specified user in a game message. On success, if the message is not an inline message, the [Message](https://core.telegram.org/bots/api/#message) is returned, otherwise *True* is returned. Returns an error, if the new score is not greater than the user's current score in the chat and *force* is *False*. */
	setGameScore(params: Omit<t.SetGameScoreParams, "user_id" | "chat_id">) {
		return this.api.call<t.Message | boolean>("setGameScore", { user_id: this.from.id, chat_id: this.chat.id, ...params });
	}
	/** Use this method to get data for high score tables. Will return the score of the specified user and several of their neighbors in a game. Returns an Array of [GameHighScore](https://core.telegram.org/bots/api/#gamehighscore) objects.  This method will currently return scores for the target user, plus two of their closest neighbors on each side. Will also return the top three users if the user and their neighbors are not among them. Please note that this behavior is subject to change. */
	getGameHighScores(params: Omit<t.GetGameHighScoresParams, "user_id" | "chat_id">) {
		return this.api.call<t.GameHighScore[]>("getGameHighScores", { user_id: this.from.id, chat_id: this.chat.id, ...params });
	}
}
