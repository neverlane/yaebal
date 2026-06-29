/**
 * @yaebal/core — core of Yet Another tElegram Bot Api Library.
 *
 * public surface: the `Bot`, the standalone `Composer`, the `Context`,
 * the entity-based `format` helpers, the low-level `Api`, and the telegram types.
 */

export { Bot, type BotOptions } from "./bot.js";
export {
	Composer,
	compose,
	matchQuery,
	type Filter,
	type FilterQuery,
	type Filtered,
	type Middleware,
	type NextFn,
	type Plugin,
} from "./composer.js";
export { Context, type ContextOptions } from "./context.js";
export { media, isMediaSource, type MediaSource } from "./media.js";
export { webhookCallback, type UpdateSink, type WebhookOptions } from "./webhook.js";
export {
	createApi,
	encodeRequest,
	TelegramError,
	type Api,
	type ApiOptions,
	type FileReader,
	type BeforeHook,
	type AfterHook,
	type ErrorHook,
	type ErrorAction,
} from "./api.js";
export {
	format,
	Stringable,
	bold,
	italic,
	underline,
	strikethrough,
	spoiler,
	code,
	pre,
	link,
	mention,
	type FormatResult,
} from "./format.js";
export type * from "./telegram-types.js";
