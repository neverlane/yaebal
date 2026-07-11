import type { Context, Plugin } from "@yaebal/core";
import type { InlineQueryResult, SentWebAppMessage } from "@yaebal/types";
import { botIdFromToken } from "./crypto.js";
import {
	type InitData,
	type InitDataValidationResult,
	isValidInitData,
	isValidInitDataThirdParty,
	parseInitData,
	type SignableInitDataFields,
	signInitData,
	type ValidateInitDataOptions,
	type ValidateInitDataThirdPartyOptions,
	validateInitData,
	validateInitDataThirdParty,
} from "./init-data.js";

export interface MiniAppOptions {
	/** the bot's token — `ctx.miniApp.validate`'s HMAC secret (and `validateThirdParty`'s `bot_id`) are derived from it, never sent anywhere. */
	botToken: string;
	/** default `maxAge` (seconds) for `validate`/`validateThirdParty` when a call doesn't pass its own — see {@link ValidateInitDataOptions.maxAge}. defaults to `86400` (24h). */
	maxAge?: number | false;
	/** default `validateThirdParty` to telegram's test-environment key. */
	test?: boolean;
}

/** `ctx.miniApp` surface — see {@link miniApp}. */
export interface MiniAppControl {
	/** validate `initData`'s `hash` against the installed bot token; see {@link validateInitData}. */
	validate(initData: string, options?: ValidateInitDataOptions): Promise<InitDataValidationResult>;
	/** boolean convenience over {@link MiniAppControl.validate}. */
	isValid(initData: string, options?: ValidateInitDataOptions): Promise<boolean>;
	/** validate `initData`'s `signature` (ed25519, no bot token needed) against telegram's public key; see {@link validateInitDataThirdParty}. */
	validateThirdParty(
		initData: string,
		options?: ValidateInitDataThirdPartyOptions,
	): Promise<InitDataValidationResult>;
	/** boolean convenience over {@link MiniAppControl.validateThirdParty}. */
	isValidThirdParty(
		initData: string,
		options?: ValidateInitDataThirdPartyOptions,
	): Promise<boolean>;
	/** parse `initData` without checking anything — trust the result only once `validate()`/`validateThirdParty()` has confirmed it. */
	parse(initData: string): InitData;
	/** sign fields into a valid `initData` string with the installed bot token — for tests/local dev; see {@link signInitData}. */
	sign(fields: SignableInitDataFields): Promise<string>;
	/**
	 * set the result of an interaction with the mini app and send a corresponding message on
	 * behalf of the user to the chat the query originated from —
	 * [answerWebAppQuery](https://core.telegram.org/bots/api/#answerwebappquery). `webAppQueryId`
	 * is the `query_id` telegram hands you in {@link InitData} once the mini app calls
	 * `Telegram.WebApp.switchInlineQuery()`.
	 */
	answerQuery(webAppQueryId: string, result: InlineQueryResult): Promise<SentWebAppMessage>;
}

/**
 * install `ctx.miniApp` on the bot: `bot.install(miniApp({ botToken }))`.
 *
 * ```ts
 * bot.install(miniApp({ botToken: process.env.BOT_TOKEN! }));
 *
 * bot.command("check", async (ctx) => {
 *   const result = await ctx.miniApp.validate(ctx.message?.text?.split(" ")[1] ?? "");
 *   await ctx.reply(result.ok ? `hi ${result.data.user?.first_name}` : `rejected: ${result.reason}`);
 * });
 * ```
 *
 * handy when a command hands off to the mini app's own http endpoint but you'd rather keep one
 * bot-token source of truth — the standalone {@link validateInitData}/{@link validateInitDataThirdParty}
 * work the same way outside a bot handler (e.g. in that endpoint itself).
 */
export function miniApp(options: MiniAppOptions): Plugin<Context, { miniApp: MiniAppControl }> {
	const botId = botIdFromToken(options.botToken);

	// `answerQuery` needs this request's `ctx.api`, so the whole surface is built per-request via
	// `derive` rather than `decorate` — the other methods are cheap closures either way, and
	// splitting `ctx.miniApp` across a static and a per-request half would be more confusing than
	// the one extra object allocation this costs per update.
	return (composer) =>
		composer.derive((ctx): { miniApp: MiniAppControl } => ({
			miniApp: {
				validate: (initData, validateOptions) =>
					validateInitData(initData, options.botToken, {
						maxAge: options.maxAge,
						...validateOptions,
					}),
				isValid: (initData, validateOptions) =>
					isValidInitData(initData, options.botToken, {
						maxAge: options.maxAge,
						...validateOptions,
					}),
				validateThirdParty: (initData, validateOptions) =>
					validateInitDataThirdParty(initData, botId, {
						maxAge: options.maxAge,
						test: options.test,
						...validateOptions,
					}),
				isValidThirdParty: (initData, validateOptions) =>
					isValidInitDataThirdParty(initData, botId, {
						maxAge: options.maxAge,
						test: options.test,
						...validateOptions,
					}),
				parse: parseInitData,
				sign: (fields) => signInitData(fields, options.botToken),
				answerQuery: (webAppQueryId, result) =>
					ctx.api.answerWebAppQuery({ web_app_query_id: webAppQueryId, result }),
			},
		}));
}
