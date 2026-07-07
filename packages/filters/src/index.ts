/**
 * @yaebal/filters — composable, type-narrowing update filters (the mtcute idea,
 * made two-phase) for the core `composer.filter(...)` method.
 *
 * a filter is a predicate — sync or async — that may *stage* data in a bag
 * (e.g. `regex` stages `ctx.match`); the bag is committed onto the context only
 * after the whole filter tree matches, so a failing `and` branch or a matching
 * filter inside `not` can never leak or corrupt anything. `Add` types flow
 * through `and` (intersection) and `or` (union) for any number of filters.
 *
 *   bot.filter(and(isPrivate, command("buy")), (ctx) => ctx.args);
 *   bot.filter(regex(/^\d+$/), (ctx) => ctx.match[0]);
 *   bot.filter(or(photo, video), (ctx) => ctx.message);
 *   bot.filter(deeplink(/^ref_(\d+)$/), (ctx) => ctx.match[1]);
 *
 * any bare `(ctx) => boolean` predicate is already a filter; author typed
 * data-staging ones with `defineFilter`.
 */

export {
	type CommandAdd,
	type CommandOptions,
	command,
	deeplink,
	start,
	startGroup,
} from "./command.js";
export { and, not, or } from "./logic.js";
export {
	animation,
	audio,
	contact,
	dice,
	document,
	type ForwardOriginType,
	forward,
	forwardOrigin,
	game,
	hasEntity,
	invoice,
	leftChatMember,
	location,
	type MediaKind,
	type MessageWith,
	media,
	mediaType,
	newChatMembers,
	paidMedia,
	photo,
	pinnedMessage,
	poll,
	reply,
	service,
	sticker,
	story,
	successfulPayment,
	venue,
	viaBot,
	video,
	videoNote,
	voice,
} from "./message.js";
export {
	chatId,
	chatType,
	fromBot,
	fromUser,
	isChannel,
	isForum,
	isGroup,
	isPremium,
	isPrivate,
} from "./peer.js";
export {
	contains,
	endsWith,
	equals,
	regex,
	startsWith,
	type TextMatchOptions,
	text,
} from "./text.js";
export type { AddOf, AndAdd, BaseOf, CombinedBase, OrAdd } from "./types.js";
export { defineFilter } from "./types.js";
export {
	type ChatMemberChange,
	type ChatMemberStatus,
	callbackData,
	chatMemberStatus,
	edited,
	inlineQuery,
} from "./update.js";

import { command, deeplink, start, startGroup } from "./command.js";
import { and, not, or } from "./logic.js";
import {
	animation,
	audio,
	contact,
	dice,
	document,
	forward,
	forwardOrigin,
	game,
	hasEntity,
	invoice,
	leftChatMember,
	location,
	media,
	mediaType,
	newChatMembers,
	paidMedia,
	photo,
	pinnedMessage,
	poll,
	reply,
	service,
	sticker,
	story,
	successfulPayment,
	venue,
	viaBot,
	video,
	videoNote,
	voice,
} from "./message.js";
import {
	chatId,
	chatType,
	fromBot,
	fromUser,
	isChannel,
	isForum,
	isGroup,
	isPremium,
	isPrivate,
} from "./peer.js";
import { contains, endsWith, equals, regex, startsWith, text } from "./text.js";
import { defineFilter } from "./types.js";
import { callbackData, chatMemberStatus, edited, inlineQuery } from "./update.js";

/** everything under one namespace, mtcute-style: `filters.command(...)`, `filters.and(...)`. */
export const filters = {
	// combinators & authoring
	and,
	or,
	not,
	defineFilter,
	// text
	text,
	equals,
	contains,
	startsWith,
	endsWith,
	regex,
	// commands & deep links
	command,
	start,
	startGroup,
	deeplink,
	// who / where
	chatType,
	isPrivate,
	isGroup,
	isChannel,
	isForum,
	chatId,
	fromUser,
	fromBot,
	isPremium,
	// message shape
	media,
	mediaType,
	photo,
	video,
	audio,
	voice,
	sticker,
	document,
	animation,
	videoNote,
	paidMedia,
	story,
	location,
	contact,
	venue,
	poll,
	dice,
	game,
	invoice,
	successfulPayment,
	reply,
	forward,
	forwardOrigin,
	viaBot,
	hasEntity,
	service,
	newChatMembers,
	leftChatMember,
	pinnedMessage,
	// other updates
	callbackData,
	inlineQuery,
	edited,
	chatMemberStatus,
} as const;
