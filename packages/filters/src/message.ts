import {
	type Context,
	type Filter,
	type Message,
	type MessageEntity,
	messageOf,
} from "@yaebal/core";
import { idMatcher } from "./peer.js";

/**
 * message-shape filters: media, replies, forwards, entities, service events.
 * they check the update's own message (`messageOf`), and most are pure
 * narrowers — they stage nothing and only refine `ctx.message` so the matched
 * field is non-optional for the handler.
 */

/** narrows `ctx.message` so the given fields are present. a union of keys means "any of them". */
export type MessageWith<K extends keyof Message> = {
	message: Message & (K extends unknown ? { [P in K]-?: NonNullable<Message[P]> } : never);
};

function messageHas<K extends keyof Message>(
	...fields: readonly K[]
): Filter<Context, MessageWith<K>> {
	return (ctx) => {
		const msg = messageOf(ctx.update);
		return msg !== undefined && fields.some((field) => msg[field] != null);
	};
}

/** every media payload a message can carry — checked against the generated `Message` type. */
const MEDIA_KINDS = [
	"animation",
	"audio",
	"document",
	"live_photo",
	"paid_media",
	"photo",
	"sticker",
	"story",
	"video",
	"video_note",
	"voice",
] as const satisfies readonly (keyof Message)[];

export type MediaKind = (typeof MEDIA_KINDS)[number];

/** message carries one of the given media kinds; narrows `ctx.message`. */
export function mediaType<K extends MediaKind>(
	...kinds: readonly K[]
): Filter<Context, MessageWith<K>> {
	return messageHas(...kinds);
}

/** message carries any media. */
export const media: Filter<Context, { message: Message }> = messageHas(...MEDIA_KINDS);

export const photo: Filter<Context, MessageWith<"photo">> = mediaType("photo");
export const video: Filter<Context, MessageWith<"video">> = mediaType("video");
export const audio: Filter<Context, MessageWith<"audio">> = mediaType("audio");
export const voice: Filter<Context, MessageWith<"voice">> = mediaType("voice");
export const sticker: Filter<Context, MessageWith<"sticker">> = mediaType("sticker");
export const document: Filter<Context, MessageWith<"document">> = mediaType("document");
export const animation: Filter<Context, MessageWith<"animation">> = mediaType("animation");
export const videoNote: Filter<Context, MessageWith<"video_note">> = mediaType("video_note");
export const paidMedia: Filter<Context, MessageWith<"paid_media">> = mediaType("paid_media");
export const story: Filter<Context, MessageWith<"story">> = mediaType("story");

/** message contains a static location. */
export const location: Filter<Context, MessageWith<"location">> = messageHas("location");
/** message contains a contact. */
export const contact: Filter<Context, MessageWith<"contact">> = messageHas("contact");
/** message contains a venue. */
export const venue: Filter<Context, MessageWith<"venue">> = messageHas("venue");
/** message contains a poll (the `poll` *update* is a different thing — use `on("poll")`). */
export const poll: Filter<Context, MessageWith<"poll">> = messageHas("poll");
/** message contains a dice roll. */
export const dice: Filter<Context, MessageWith<"dice">> = messageHas("dice");
/** message contains a game. */
export const game: Filter<Context, MessageWith<"game">> = messageHas("game");
/** message contains an invoice. */
export const invoice: Filter<Context, MessageWith<"invoice">> = messageHas("invoice");
/** message is a successful-payment service message. */
export const successfulPayment: Filter<Context, MessageWith<"successful_payment">> = messageHas(
	"successful_payment",
);

/** message is a reply to another message. */
export const reply: Filter<Context, MessageWith<"reply_to_message">> = messageHas(
	"reply_to_message",
);

/** message is forwarded from somewhere. */
export const forward: Filter<Context, MessageWith<"forward_origin">> = messageHas("forward_origin");

/** where a forwarded message came from (the generated schema keeps `origin.type` a plain string). */
export type ForwardOriginType = "user" | "hidden_user" | "chat" | "channel";

/** message is forwarded from one of the given origin kinds (any, when none given). */
export function forwardOrigin(
	...types: readonly ForwardOriginType[]
): Filter<Context, MessageWith<"forward_origin">> {
	return (ctx) => {
		const origin = messageOf(ctx.update)?.forward_origin;
		if (origin === undefined) return false;

		return types.length === 0 || (types as readonly string[]).includes(origin.type);
	};
}

/** message was sent via an inline bot — any, or one of the given ids/`@usernames`. */
export function viaBot(...ids: (number | string)[]): Filter<Context, MessageWith<"via_bot">> {
	const matches = idMatcher(ids);

	return (ctx) => {
		const bot = messageOf(ctx.update)?.via_bot;
		if (bot === undefined) return false;

		return ids.length === 0 || matches(bot);
	};
}

/**
 * message contains an entity of the given type — in text *or* caption
 * (`#hashtag` on a photo counts). stages the matching entities as
 * `ctx.entities`; with no `type`, any entity matches and all are staged.
 */
export function hasEntity(
	type?: MessageEntity["type"],
): Filter<Context, { entities: MessageEntity[] }> {
	return (ctx, bag) => {
		const msg = messageOf(ctx.update);
		// a message carries text entities or caption entities, never both
		const all = msg?.entities ?? msg?.caption_entities;
		if (all === undefined || all.length === 0) return false;

		const found = type === undefined ? all : all.filter((entity) => entity.type === type);
		if (found.length === 0) return false;

		bag.entities = found;
		return true;
	};
}

/** every service payload a message can carry — checked against the generated `Message` type. */
const SERVICE_KINDS = [
	"new_chat_members",
	"left_chat_member",
	"new_chat_title",
	"new_chat_photo",
	"delete_chat_photo",
	"group_chat_created",
	"supergroup_chat_created",
	"channel_chat_created",
	"message_auto_delete_timer_changed",
	"migrate_to_chat_id",
	"migrate_from_chat_id",
	"pinned_message",
	"proximity_alert_triggered",
	"boost_added",
	"forum_topic_created",
	"forum_topic_edited",
	"forum_topic_closed",
	"forum_topic_reopened",
	"general_forum_topic_hidden",
	"general_forum_topic_unhidden",
	"video_chat_scheduled",
	"video_chat_started",
	"video_chat_ended",
	"video_chat_participants_invited",
	"users_shared",
	"chat_shared",
	"write_access_allowed",
	"web_app_data",
] as const satisfies readonly (keyof Message)[];

/** message is a service message (member joined/left, pin, topic event, video chat, …). */
export const service: Filter<Context, { message: Message }> = messageHas(...SERVICE_KINDS);

/** users joined the chat. */
export const newChatMembers: Filter<Context, MessageWith<"new_chat_members">> = messageHas(
	"new_chat_members",
);

/** a user left the chat. */
export const leftChatMember: Filter<Context, MessageWith<"left_chat_member">> = messageHas(
	"left_chat_member",
);

/** a message was pinned. */
export const pinnedMessage: Filter<Context, MessageWith<"pinned_message">> = messageHas(
	"pinned_message",
);
