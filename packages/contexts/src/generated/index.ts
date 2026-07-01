// AUTO-GENERATED — do not edit by hand. regenerate: pnpm --filter @yaebal/contexts generate
import type { Api } from "@yaebal/core";
import type * as t from "@yaebal/types";
import { MessageContext } from "../sugar/message.js";
import { EditedMessageContext } from "../sugar/edited-message.js";
import { ChannelPostContext } from "../sugar/channel-post.js";
import { EditedChannelPostContext } from "../sugar/edited-channel-post.js";
import { BusinessConnectionContext } from "./business-connection.js";
import { BusinessMessageContext } from "../sugar/business-message.js";
import { EditedBusinessMessageContext } from "../sugar/edited-business-message.js";
import { DeletedBusinessMessagesContext } from "./deleted-business-messages.js";
import { GuestMessageContext } from "./guest-message.js";
import { MessageReactionContext } from "./message-reaction.js";
import { MessageReactionCountContext } from "./message-reaction-count.js";
import { InlineQueryContext } from "../sugar/inline-query.js";
import { ChosenInlineResultContext } from "./chosen-inline-result.js";
import { CallbackQueryContext } from "../sugar/callback-query.js";
import { ShippingQueryContext } from "../sugar/shipping-query.js";
import { PreCheckoutQueryContext } from "../sugar/pre-checkout-query.js";
import { PurchasedPaidMediaContext } from "./purchased-paid-media.js";
import { PollContext } from "./poll.js";
import { PollAnswerContext } from "./poll-answer.js";
import { MyChatMemberContext } from "./my-chat-member.js";
import { ChatMemberContext } from "./chat-member.js";
import { ChatJoinRequestContext } from "../sugar/chat-join-request.js";
import { ChatBoostContext } from "./chat-boost.js";
import { RemovedChatBoostContext } from "./removed-chat-boost.js";
import { ManagedBotContext } from "./managed-bot.js";

export { MessageContext } from "../sugar/message.js";
export { MessageContextBase } from "./message.js";
export { EditedMessageContext } from "../sugar/edited-message.js";
export { EditedMessageContextBase } from "./edited-message.js";
export { ChannelPostContext } from "../sugar/channel-post.js";
export { ChannelPostContextBase } from "./channel-post.js";
export { EditedChannelPostContext } from "../sugar/edited-channel-post.js";
export { EditedChannelPostContextBase } from "./edited-channel-post.js";
export { BusinessConnectionContext } from "./business-connection.js";
export { BusinessMessageContext } from "../sugar/business-message.js";
export { BusinessMessageContextBase } from "./business-message.js";
export { EditedBusinessMessageContext } from "../sugar/edited-business-message.js";
export { EditedBusinessMessageContextBase } from "./edited-business-message.js";
export { DeletedBusinessMessagesContext } from "./deleted-business-messages.js";
export { GuestMessageContext } from "./guest-message.js";
export { MessageReactionContext } from "./message-reaction.js";
export { MessageReactionCountContext } from "./message-reaction-count.js";
export { InlineQueryContext } from "../sugar/inline-query.js";
export { InlineQueryContextBase } from "./inline-query.js";
export { ChosenInlineResultContext } from "./chosen-inline-result.js";
export { CallbackQueryContext } from "../sugar/callback-query.js";
export { CallbackQueryContextBase } from "./callback-query.js";
export { ShippingQueryContext } from "../sugar/shipping-query.js";
export { ShippingQueryContextBase } from "./shipping-query.js";
export { PreCheckoutQueryContext } from "../sugar/pre-checkout-query.js";
export { PreCheckoutQueryContextBase } from "./pre-checkout-query.js";
export { PurchasedPaidMediaContext } from "./purchased-paid-media.js";
export { PollContext } from "./poll.js";
export { PollAnswerContext } from "./poll-answer.js";
export { MyChatMemberContext } from "./my-chat-member.js";
export { ChatMemberContext } from "./chat-member.js";
export { ChatJoinRequestContext } from "../sugar/chat-join-request.js";
export { ChatJoinRequestContextBase } from "./chat-join-request.js";
export { ChatBoostContext } from "./chat-boost.js";
export { RemovedChatBoostContext } from "./removed-chat-boost.js";
export { ManagedBotContext } from "./managed-bot.js";

/** maps an update type to its context class. */
export interface ContextByType {
	message: MessageContext;
	edited_message: EditedMessageContext;
	channel_post: ChannelPostContext;
	edited_channel_post: EditedChannelPostContext;
	business_connection: BusinessConnectionContext;
	business_message: BusinessMessageContext;
	edited_business_message: EditedBusinessMessageContext;
	deleted_business_messages: DeletedBusinessMessagesContext;
	guest_message: GuestMessageContext;
	message_reaction: MessageReactionContext;
	message_reaction_count: MessageReactionCountContext;
	inline_query: InlineQueryContext;
	chosen_inline_result: ChosenInlineResultContext;
	callback_query: CallbackQueryContext;
	shipping_query: ShippingQueryContext;
	pre_checkout_query: PreCheckoutQueryContext;
	purchased_paid_media: PurchasedPaidMediaContext;
	poll: PollContext;
	poll_answer: PollAnswerContext;
	my_chat_member: MyChatMemberContext;
	chat_member: ChatMemberContext;
	chat_join_request: ChatJoinRequestContext;
	chat_boost: ChatBoostContext;
	removed_chat_boost: RemovedChatBoostContext;
	managed_bot: ManagedBotContext;
}

const CONTEXTS = {
	message: MessageContext,
	edited_message: EditedMessageContext,
	channel_post: ChannelPostContext,
	edited_channel_post: EditedChannelPostContext,
	business_connection: BusinessConnectionContext,
	business_message: BusinessMessageContext,
	edited_business_message: EditedBusinessMessageContext,
	deleted_business_messages: DeletedBusinessMessagesContext,
	guest_message: GuestMessageContext,
	message_reaction: MessageReactionContext,
	message_reaction_count: MessageReactionCountContext,
	inline_query: InlineQueryContext,
	chosen_inline_result: ChosenInlineResultContext,
	callback_query: CallbackQueryContext,
	shipping_query: ShippingQueryContext,
	pre_checkout_query: PreCheckoutQueryContext,
	purchased_paid_media: PurchasedPaidMediaContext,
	poll: PollContext,
	poll_answer: PollAnswerContext,
	my_chat_member: MyChatMemberContext,
	chat_member: ChatMemberContext,
	chat_join_request: ChatJoinRequestContext,
	chat_boost: ChatBoostContext,
	removed_chat_boost: RemovedChatBoostContext,
	managed_bot: ManagedBotContext,
} satisfies { [K in keyof ContextByType]: new (api: Api, update: t.Update) => ContextByType[K] };

/** build the right context for an update. */
export function contextFor<K extends keyof ContextByType>(
	type: K,
	api: Api,
	update: t.Update,
): ContextByType[K] {
	const Ctor = (CONTEXTS[type] ?? CONTEXTS.message) as new (
		api: Api,
		update: t.Update,
	) => ContextByType[K];
	return new Ctor(api, update);
}
