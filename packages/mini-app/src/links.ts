import type { WebAppInfo } from "@yaebal/types";

export interface WebAppUrlOptions {
	/** extra query params merged in — e.g. deep-linking to a screen inside the mini app. */
	params?: Record<string, string>;
}

/** build (and validate) the https url for a {@link WebAppInfo}/`web_app` keyboard button. */
export function webAppUrl(baseUrl: string, options: WebAppUrlOptions = {}): string {
	const url = new URL(baseUrl);
	if (url.protocol !== "https:") {
		throw new Error(`mini-app: web app url must be https, got ${JSON.stringify(baseUrl)}`);
	}
	for (const [key, value] of Object.entries(options.params ?? {})) url.searchParams.set(key, value);
	return url.toString();
}

/** build a {@link WebAppInfo} for a `web_app` keyboard button — `{ url: webAppUrl(baseUrl, options) }`. */
export function webAppInfo(baseUrl: string, options?: WebAppUrlOptions): WebAppInfo {
	return { url: webAppUrl(baseUrl, options) };
}

/** telegram's `startapp`/`startattach` payload charset: 0-64 chars, `[A-Za-z0-9_-]`. */
const START_PARAM_PATTERN = /^[A-Za-z0-9_-]{0,64}$/;

function checkStartParam(startParam: string | undefined): void {
	if (startParam !== undefined && !START_PARAM_PATTERN.test(startParam)) {
		throw new Error(
			`mini-app: startParam must match ${START_PARAM_PATTERN} (0-64 chars), got ${JSON.stringify(startParam)}`,
		);
	}
}

/** telegram public usernames: 5-32 chars, `[A-Za-z0-9_]`, must start with a letter. */
const USERNAME_PATTERN = /^[A-Za-z][A-Za-z0-9_]{4,31}$/;

function checkBotUsername(botUsername: string): void {
	if (!USERNAME_PATTERN.test(botUsername)) {
		throw new Error(
			`mini-app: botUsername must match ${USERNAME_PATTERN} (5-32 chars, start with a letter, no leading "@"), got ${JSON.stringify(botUsername)}`,
		);
	}
}

/** a mini app's BotFather-configured short name. */
const APP_NAME_PATTERN = /^[A-Za-z0-9_]{1,64}$/;

function checkAppName(appName: string | undefined): void {
	if (appName !== undefined && !APP_NAME_PATTERN.test(appName)) {
		throw new Error(
			`mini-app: appName must match ${APP_NAME_PATTERN}, got ${JSON.stringify(appName)}`,
		);
	}
}

export interface MiniAppLinkOptions {
	/** the bot's `@username`, without the `@`. */
	botUsername: string;
	/** the mini app's short name, configured via `@BotFather`. omit to link the bot's main mini app. */
	appName?: string;
	/** round-tripped back as `initData.start_param`. 0-64 chars, `[A-Za-z0-9_-]`. */
	startParam?: string;
	/** open inside the chat instead of fullscreen. */
	mode?: "compact";
}

/**
 * build a [direct link to a Mini App](https://core.telegram.org/bots/webapps#direct-link-mini-apps):
 * `https://t.me/<bot>/<appName>?startapp=<startParam>`, or `https://t.me/<bot>?startapp=<startParam>`
 * for the bot's main mini app when `appName` is omitted.
 */
export function miniAppLink(options: MiniAppLinkOptions): string {
	checkBotUsername(options.botUsername);
	checkAppName(options.appName);
	checkStartParam(options.startParam);

	const path = options.appName
		? `/${options.botUsername}/${options.appName}`
		: `/${options.botUsername}`;
	const url = new URL(`https://t.me${path}`);
	if (options.startParam !== undefined) url.searchParams.set("startapp", options.startParam);
	if (options.mode) url.searchParams.set("mode", options.mode);
	return url.toString();
}

export interface AttachMenuLinkOptions {
	/** the bot's `@username`, without the `@`. must already be added to the attachment menu (see BotFather). */
	botUsername: string;
	/** round-tripped back as `initData.start_param`. 0-64 chars, `[A-Za-z0-9_-]`. */
	startParam?: string;
}

/**
 * build a direct link that opens a bot's Mini App from the
 * [attachment menu](https://core.telegram.org/bots/webapps#adding-bots-to-the-attachment-menu):
 * `https://t.me/<bot>?startattach=<startParam>` (or bare `?startattach` with no payload). Unlike
 * {@link miniAppLink}, this launches from *any* chat, not just a conversation with the bot.
 */
export function attachMenuLink(options: AttachMenuLinkOptions): string {
	checkBotUsername(options.botUsername);
	checkStartParam(options.startParam);

	// telegram's own examples use the bare `?startattach` flag (no `=`) when there's no payload;
	// build that by hand instead of `URLSearchParams`, which would always emit `startattach=`.
	const query = options.startParam
		? `?startattach=${encodeURIComponent(options.startParam)}`
		: "?startattach";
	return `https://t.me/${options.botUsername}${query}`;
}
