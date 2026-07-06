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
	createApi,
	type ErrorAction,
	type ErrorHook,
	encodeRequest,
	type FileReader,
	TelegramError,
} from "./api.js";
export { Bot, type BotOptions, type BotPlugin } from "./bot.js";
export {
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
export { Context, type ContextOptions } from "./context.js";
export {
	bold,
	code,
	type FormatResult,
	format,
	italic,
	link,
	mention,
	pre,
	Stringable,
	spoiler,
	strikethrough,
	underline,
} from "./format.js";
export { isMediaSource, type MediaSource, media } from "./media.js";
export type * from "./telegram-types.js";
export { updateNames } from "./telegram-types.js";
export { type UpdateSink, type WebhookOptions, webhookCallback } from "./webhook.js";
