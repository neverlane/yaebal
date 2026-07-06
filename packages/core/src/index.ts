/**
 * @yaebal/core — core of Yet Another tElegram Bot Api Library.
 *
 * public surface: the `Bot`, the standalone `Composer`, the `Context`,
 * the entity-based `format` helpers, the low-level `Api`, and the telegram types.
 */

export {
	type AfterHook,
	type Api,
	type ApiOptions,
	type BeforeHook,
	type CallOptions,
	createApi,
	type ErrorAction,
	type ErrorHook,
	encodeRequest,
	type FileReader,
	HttpError,
	TelegramError,
} from "./api.js";
export { Bot, type BotOptions, type BotPlugin } from "./bot.js";
export {
	type CallbackDataMatcher,
	Composer,
	compose,
	type Filter,
	type Filtered,
	type FilterQuery,
	type Middleware,
	matchQuery,
	type NextFn,
	type Plugin,
} from "./composer.js";
export { Context, type ContextOptions, messageOf } from "./context.js";
export {
	blockquote,
	bold,
	code,
	customEmoji,
	dateTime,
	expandableBlockquote,
	type FormatResult,
	type Formatter,
	format,
	type Insertable,
	isFormatResult,
	italic,
	join,
	link,
	mention,
	pre,
	Stringable,
	spoiler,
	strikethrough,
	underline,
} from "./format.js";
export { applyFormatFields } from "./format-hook.js";
export { isMediaSource, type MediaSource, media } from "./media.js";
export type * from "./telegram-types.js";
export { updateNames } from "./telegram-types.js";
export { type UpdateSink, type WebhookOptions, webhookCallback } from "./webhook.js";
