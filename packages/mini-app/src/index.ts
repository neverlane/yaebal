/**
 * @yaebal/mini-app — the Telegram Mini Apps server protocol, no UI framework attached: HMAC
 * (`ctx.miniApp.validate`) and Ed25519 third-party (`ctx.miniApp.validateThirdParty`) `initData`
 * validation, a typed `initData` parser and test signer, `web_app_data` helpers, an
 * `Authorization: tma` header helper for your mini app's own backend, `answerWebAppQuery`, and a
 * `WebAppInfo`/direct-link url generator.
 *
 *   bot.install(miniApp({ botToken: process.env.BOT_TOKEN! }));
 *
 *   bot.command("check", async (ctx) => {
 *     const result = await ctx.miniApp.validate(ctx.message?.text?.split(" ")[1] ?? "");
 *     await ctx.reply(result.ok ? `hi ${result.data.user?.first_name}` : `rejected: ${result.reason}`);
 *   });
 *
 * outside a bot handler (your mini app's own http endpoint), reach for the standalone
 * `validateInitData`/`validateInitDataThirdParty`/`validateAuthHeader` — independent of any bot or `ctx`.
 */

export {
	getBotTokenSecretKey,
	INIT_DATA_CHAT_TYPES,
	type InitData,
	type InitDataChat,
	type InitDataChatType,
	type InitDataUser,
	type InitDataValidationFailureReason,
	type InitDataValidationResult,
	isValidInitData,
	isValidInitDataThirdParty,
	parseInitData,
	type SignableInitDataFields,
	signInitData,
	TELEGRAM_ED25519_PUBLIC_KEYS,
	type ValidateInitDataOptions,
	type ValidateInitDataThirdPartyOptions,
	validateInitData,
	validateInitDataThirdParty,
} from "./init-data.js";
export {
	type AttachMenuLinkOptions,
	attachMenuLink,
	type MiniAppLinkOptions,
	miniAppLink,
	type WebAppUrlOptions,
	webAppInfo,
	webAppUrl,
} from "./links.js";
export { type MiniAppControl, type MiniAppOptions, miniApp } from "./plugin.js";
export { initDataFromAuthHeader, validateAuthHeader } from "./server.js";
export { parseWebAppData } from "./web-app-data.js";
