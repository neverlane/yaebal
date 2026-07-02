/**
 * fixture builders — the escape hatch beneath the actor api. every actor
 * method ({@link UserActor.sendMessage} & co.) is sugar over one of these;
 * reach for them directly when you need an update shape the actors don't
 * cover, or want full control over every field.
 */
import type { Message, Update, UpdateName, User } from "@yaebal/core";

/** the payload type for a given update kind — reuses core's `Update` shape, no extra types package needed. */
type Payload<K extends UpdateName> = NonNullable<Update[K]>;

let updateIdCounter = 0;
let userIdCounter = 0;

/** build an {@link Update} from a partial, filling in a fresh `update_id`. */
export function createUpdate(partial: Partial<Update> = {}): Update {
	return { update_id: ++updateIdCounter, ...partial };
}

/** options for {@link buildUser}. */
export interface BuildUserOptions {
	id?: number;
	firstName?: string;
	lastName?: string;
	username?: string;
	languageCode?: string;
	isBot?: boolean;
}

/** build a {@link User}, auto-allocating an id if none is given. */
export function buildUser(options: BuildUserOptions = {}): User {
	const {
		id = ++userIdCounter,
		firstName = "u",
		lastName,
		username,
		languageCode,
		isBot = false,
	} = options;

	return {
		id,
		is_bot: isBot,
		first_name: firstName,
		...(lastName !== undefined ? { last_name: lastName } : {}),
		...(username !== undefined ? { username } : {}),
		...(languageCode !== undefined ? { language_code: languageCode } : {}),
	};
}

const stubUser = (id: number) => buildUser({ id });

/** options shared by the message-shaped factories (`message`, `edited_message`, `channel_post`, ...). */
export interface MessageUpdateOptions {
	text?: string;
	chatId?: number;
	fromId?: number;
	chatType?: "private" | "group" | "supergroup" | "channel";
}

function buildMessage(
	options: MessageUpdateOptions,
	defaultChatType: NonNullable<MessageUpdateOptions["chatType"]>,
): Message {
	const { text = "", chatId = 1, fromId = chatId, chatType = defaultChatType } = options;

	return {
		message_id: 1,
		date: 0,
		chat: { id: chatId, type: chatType },
		from: stubUser(fromId),
		text,
	};
}

/** build a `message` {@link Update}. */
export function messageUpdate(options: MessageUpdateOptions = {}): Update {
	return createUpdate({ message: buildMessage(options, "private") });
}

/** build an `edited_message` {@link Update}. */
export function editedMessageUpdate(options: MessageUpdateOptions = {}): Update {
	return createUpdate({ edited_message: buildMessage(options, "private") });
}

/** build a `channel_post` {@link Update}. */
export function channelPostUpdate(options: MessageUpdateOptions = {}): Update {
	return createUpdate({ channel_post: buildMessage(options, "channel") });
}

/** build an `edited_channel_post` {@link Update}. */
export function editedChannelPostUpdate(options: MessageUpdateOptions = {}): Update {
	return createUpdate({ edited_channel_post: buildMessage(options, "channel") });
}

/** options for {@link callbackUpdate}. */
export interface CallbackUpdateOptions {
	data?: string;
	chatId?: number;
	fromId?: number;
	message?: Message;
}

/** build a `callback_query` {@link Update}. */
export function callbackUpdate(options: CallbackUpdateOptions = {}): Update {
	const { data = "", chatId = 1, fromId = chatId, message } = options;

	return createUpdate({
		callback_query: {
			id: "1",
			chat_instance: "0",
			from: stubUser(fromId),
			message: message ?? {
				message_id: 1,
				date: 0,
				chat: { id: chatId, type: "private" },
			},
			data,
		},
	});
}

/** options for {@link inlineQueryUpdate}. */
export interface InlineQueryUpdateOptions {
	query?: string;
	fromId?: number;
	id?: string;
	offset?: string;
	chatType?: Payload<"inline_query">["chat_type"];
}

/** build an `inline_query` {@link Update}. */
export function inlineQueryUpdate(options: InlineQueryUpdateOptions = {}): Update {
	const { query = "", fromId = 1, id = "1", offset = "", chatType } = options;

	return createUpdate({
		inline_query: {
			id,
			from: stubUser(fromId),
			query,
			offset,
			...(chatType ? { chat_type: chatType } : {}),
		},
	});
}

/** options for {@link chosenInlineResultUpdate}. */
export interface ChosenInlineResultUpdateOptions {
	resultId?: string;
	fromId?: number;
	query?: string;
	inlineMessageId?: string;
}

/** build a `chosen_inline_result` {@link Update}. */
export function chosenInlineResultUpdate(options: ChosenInlineResultUpdateOptions = {}): Update {
	const { resultId = "1", fromId = 1, query = "", inlineMessageId } = options;

	return createUpdate({
		chosen_inline_result: {
			result_id: resultId,
			from: stubUser(fromId),
			query,
			...(inlineMessageId ? { inline_message_id: inlineMessageId } : {}),
		},
	});
}

/** options for {@link shippingQueryUpdate}. */
export interface ShippingQueryUpdateOptions {
	id?: string;
	fromId?: number;
	invoicePayload?: string;
	shippingAddress?: Partial<Payload<"shipping_query">["shipping_address"]>;
}

/** build a `shipping_query` {@link Update}. */
export function shippingQueryUpdate(options: ShippingQueryUpdateOptions = {}): Update {
	const { id = "1", fromId = 1, invoicePayload = "", shippingAddress = {} } = options;

	return createUpdate({
		shipping_query: {
			id,
			from: stubUser(fromId),
			invoice_payload: invoicePayload,
			shipping_address: {
				country_code: "US",
				state: "",
				city: "New York",
				street_line1: "",
				street_line2: "",
				post_code: "10001",
				...shippingAddress,
			},
		},
	});
}

/** options for {@link preCheckoutQueryUpdate}. */
export interface PreCheckoutQueryUpdateOptions {
	id?: string;
	fromId?: number;
	currency?: string;
	totalAmount?: number;
	invoicePayload?: string;
}

/** build a `pre_checkout_query` {@link Update}. */
export function preCheckoutQueryUpdate(options: PreCheckoutQueryUpdateOptions = {}): Update {
	const {
		id = "1",
		fromId = 1,
		currency = "USD",
		totalAmount = 100,
		invoicePayload = "",
	} = options;

	return createUpdate({
		pre_checkout_query: {
			id,
			from: stubUser(fromId),
			currency,
			total_amount: totalAmount,
			invoice_payload: invoicePayload,
		},
	});
}

/** options for {@link pollUpdate}. */
export interface PollUpdateOptions {
	id?: string;
	question?: string;
	options?: string[];
	isClosed?: boolean;
}

/** build a `poll` {@link Update}. */
export function pollUpdate(options: PollUpdateOptions = {}): Update {
	const { id = "1", question = "", options: choices = ["yes", "no"], isClosed = false } = options;

	return createUpdate({
		poll: {
			id,
			question,
			options: choices.map((text, i) => ({ persistent_id: String(i), text, voter_count: 0 })),
			total_voter_count: 0,
			is_closed: isClosed,
			is_anonymous: true,
			type: "regular",
			allows_multiple_answers: false,
			allows_revoting: false,
			members_only: false,
		},
	});
}

/** options for {@link pollAnswerUpdate}. */
export interface PollAnswerUpdateOptions {
	pollId?: string;
	fromId?: number;
	optionIds?: number[];
}

/** build a `poll_answer` {@link Update}. */
export function pollAnswerUpdate(options: PollAnswerUpdateOptions = {}): Update {
	const { pollId = "1", fromId = 1, optionIds = [0] } = options;

	return createUpdate({
		poll_answer: {
			poll_id: pollId,
			user: stubUser(fromId),
			option_ids: optionIds,
			option_persistent_ids: optionIds.map(String),
		},
	});
}

/** options for {@link myChatMemberUpdate} / {@link chatMemberUpdate}. */
export interface ChatMemberUpdateOptions {
	chatId?: number;
	fromId?: number;
	userId?: number;
	oldStatus?: string;
	newStatus?: string;
}

function buildChatMemberUpdate(options: ChatMemberUpdateOptions): Payload<"my_chat_member"> {
	const {
		chatId = 1,
		fromId = chatId,
		userId = fromId,
		oldStatus = "member",
		newStatus = "member",
	} = options;
	const user = stubUser(userId);

	return {
		chat: { id: chatId, type: "group" },
		from: stubUser(fromId),
		date: 0,
		old_chat_member: { status: oldStatus, user },
		new_chat_member: { status: newStatus, user },
	};
}

/** build a `my_chat_member` {@link Update} (the bot's own membership changed). */
export function myChatMemberUpdate(options: ChatMemberUpdateOptions = {}): Update {
	return createUpdate({ my_chat_member: buildChatMemberUpdate(options) });
}

/** build a `chat_member` {@link Update} (another member's membership changed). */
export function chatMemberUpdate(options: ChatMemberUpdateOptions = {}): Update {
	return createUpdate({ chat_member: buildChatMemberUpdate(options) });
}

/** options for {@link chatJoinRequestUpdate}. */
export interface ChatJoinRequestUpdateOptions {
	chatId?: number;
	fromId?: number;
	userChatId?: number;
	bio?: string;
}

/** build a `chat_join_request` {@link Update}. */
export function chatJoinRequestUpdate(options: ChatJoinRequestUpdateOptions = {}): Update {
	const { chatId = 1, fromId = 1, userChatId = fromId, bio } = options;

	return createUpdate({
		chat_join_request: {
			chat: { id: chatId, type: "group" },
			from: stubUser(fromId),
			user_chat_id: userChatId,
			date: 0,
			...(bio ? { bio } : {}),
		},
	});
}

/** infer which payload key an update carries; defaults to `"message"`. */
export function detectUpdateType(update: Update): UpdateName {
	if (update.message) return "message";
	if (update.edited_message) return "edited_message";
	if (update.channel_post) return "channel_post";
	if (update.callback_query) return "callback_query";

	const bag = update as unknown as Record<string, unknown>;
	for (const key of Object.keys(bag)) {
		if (key !== "update_id" && bag[key] !== undefined) return key as UpdateName;
	}

	return "message";
}

export type { Message, Update, UpdateName, User };
