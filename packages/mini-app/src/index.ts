import type { Context, Plugin } from "@yaebal/core";
import type { WebAppInfo } from "@yaebal/types";

/** the `user`/`receiver` shape embedded (as JSON) in Telegram Mini App `initData`. */
export interface InitDataUser {
	id: number;
	is_bot?: boolean;
	first_name: string;
	last_name?: string;
	username?: string;
	language_code?: string;
	is_premium?: boolean;
	added_to_attachment_menu?: boolean;
	/** *Optional*. `true` if the user allowed the bot to message them via the [`RequestWriteAccess`](https://core.telegram.org/bots/webapps#initializing-mini-apps) request. */
	allows_write_to_pm?: boolean;
	photo_url?: string;
}

/** the `chat` shape embedded (as JSON) in `initData` — only present when launched from a group/channel context. */
export interface InitDataChat {
	id: number;
	type: "group" | "supergroup" | "channel";
	title: string;
	username?: string;
	photo_url?: string;
}

export type InitDataChatType = "sender" | "private" | "group" | "supergroup" | "channel";

/** the fully parsed, typed `initData` fields — see [Validating data received via the Mini App](https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app). */
export interface InitData {
	query_id?: string;
	user?: InitDataUser;
	receiver?: InitDataUser;
	chat?: InitDataChat;
	chat_type?: InitDataChatType;
	chat_instance?: string;
	/** the payload passed to {@link miniAppLink}'s `startParam`, round-tripped back by telegram. */
	start_param?: string;
	can_send_after?: number;
	auth_date: Date;
	hash: string;
	/** ed25519 signature (third-party-verifiable, no bot token needed) — see telegram's docs; not checked by {@link validateInitData}. */
	signature?: string;
}

function parseJsonField<T>(field: string, raw: string): T {
	try {
		return JSON.parse(raw) as T;
	} catch (error) {
		throw new Error(
			`mini-app: initData field "${field}" is not valid JSON: ${(error as Error).message}`,
		);
	}
}

/**
 * parse `initData` into a typed {@link InitData} — no hash check, so only trust the result after
 * (or via) {@link validateInitData}. throws on a structurally invalid string (missing `hash`/
 * `auth_date`, or a `user`/`receiver`/`chat` field that isn't valid JSON).
 */
export function parseInitData(initData: string): InitData {
	const params = new URLSearchParams(initData);

	const hash = params.get("hash");
	if (!hash) throw new Error('mini-app: initData is missing "hash"');

	const authDateRaw = params.get("auth_date");
	if (!authDateRaw) throw new Error('mini-app: initData is missing "auth_date"');

	const authDateSeconds = Number(authDateRaw);
	if (!Number.isFinite(authDateSeconds)) {
		throw new Error(`mini-app: invalid auth_date ${JSON.stringify(authDateRaw)}`);
	}

	const data: InitData = { hash, auth_date: new Date(authDateSeconds * 1000) };

	const queryId = params.get("query_id");
	if (queryId !== null) data.query_id = queryId;

	const user = params.get("user");
	if (user !== null) data.user = parseJsonField<InitDataUser>("user", user);

	const receiver = params.get("receiver");
	if (receiver !== null) data.receiver = parseJsonField<InitDataUser>("receiver", receiver);

	const chat = params.get("chat");
	if (chat !== null) data.chat = parseJsonField<InitDataChat>("chat", chat);

	const chatType = params.get("chat_type");
	if (chatType !== null) data.chat_type = chatType as InitDataChatType;

	const chatInstance = params.get("chat_instance");
	if (chatInstance !== null) data.chat_instance = chatInstance;

	const startParam = params.get("start_param");
	if (startParam !== null) data.start_param = startParam;

	const canSendAfter = params.get("can_send_after");
	if (canSendAfter !== null) {
		const n = Number(canSendAfter);
		if (Number.isFinite(n)) data.can_send_after = n;
	}

	const signature = params.get("signature");
	if (signature !== null) data.signature = signature;

	return data;
}

/** constant-time string compare (pure js, no `node:crypto`/`Buffer` — runs on node, bun, deno and edge/web). */
function constantTimeEqual(a: string, b: string): boolean {
	if (a.length !== b.length) return false;
	let diff = 0;
	for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
	return diff === 0;
}

/** copy into a fresh `ArrayBuffer` — webcrypto rejects shared/offset-backed views. */
function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
	const copy = new Uint8Array(bytes.byteLength);
	copy.set(bytes);
	return copy.buffer;
}

async function hmacSha256Hex(keyBytes: Uint8Array, message: string): Promise<string> {
	const key = await crypto.subtle.importKey(
		"raw",
		toArrayBuffer(keyBytes),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);
	const signature = await crypto.subtle.sign(
		"HMAC",
		key,
		toArrayBuffer(new TextEncoder().encode(message)),
	);
	return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, "0")).join(
		"",
	);
}

/** computed the way telegram specifies: `HMAC_SHA256(secret_key, data_check_string)`, `secret_key = HMAC_SHA256("WebAppData", bot_token)`. */
async function computeInitDataHash(botToken: string, dataCheckString: string): Promise<string> {
	const encoder = new TextEncoder();
	const secretKeyMaterial = await crypto.subtle.importKey(
		"raw",
		toArrayBuffer(encoder.encode("WebAppData")),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);
	const secretKeyBytes = new Uint8Array(
		await crypto.subtle.sign("HMAC", secretKeyMaterial, toArrayBuffer(encoder.encode(botToken))),
	);
	return hmacSha256Hex(secretKeyBytes, dataCheckString);
}

export type InitDataValidationResult =
	| { ok: true; data: InitData }
	| { ok: false; reason: "missing_hash" | "bad_hash" | "expired" };

export interface ValidateInitDataOptions {
	/** reject `initData` older than this many seconds (checked against `auth_date`). `undefined` = no expiry check. */
	maxAge?: number;
	/** clock used against `maxAge`. defaults to `new Date()`. */
	now?: Date;
}

/**
 * validate `initData`'s `hash` against `botToken` per telegram's
 * [Validating data received via the Mini App](https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app),
 * and optionally its freshness via `maxAge`. standalone — independent of any bot or `ctx`; see
 * {@link miniApp} for the `ctx.miniApp.validate` form bound to a bot token.
 */
export async function validateInitData(
	initData: string,
	botToken: string,
	options: ValidateInitDataOptions = {},
): Promise<InitDataValidationResult> {
	const params = new URLSearchParams(initData);
	const hash = params.get("hash");
	if (!hash) return { ok: false, reason: "missing_hash" };
	params.delete("hash");

	const pairs: string[] = [];
	for (const [key, value] of params) pairs.push(`${key}=${value}`);
	pairs.sort();

	const computedHash = await computeInitDataHash(botToken, pairs.join("\n"));
	if (!constantTimeEqual(computedHash, hash)) return { ok: false, reason: "bad_hash" };

	const data = parseInitData(initData);

	if (options.maxAge !== undefined) {
		const now = options.now ?? new Date();
		const ageSeconds = (now.getTime() - data.auth_date.getTime()) / 1000;
		if (ageSeconds > options.maxAge) return { ok: false, reason: "expired" };
	}

	return { ok: true, data };
}

export interface MiniAppOptions {
	/** the bot's token — `validateInitData`'s secret key is derived from it, never sent anywhere. */
	botToken: string;
}

/** `ctx.miniApp` surface — see {@link miniApp}. */
export interface MiniAppControl {
	/** validate `initData` against the installed bot token; see {@link validateInitData}. */
	validate(initData: string, options?: ValidateInitDataOptions): Promise<InitDataValidationResult>;
	/** parse `initData` without checking its hash — trust the result only once `validate()` has confirmed it. */
	parse(initData: string): InitData;
}

/**
 * install `ctx.miniApp` on the bot: `bot.install(miniApp({ botToken }))`.
 *
 * ```ts
 * bot.install(miniApp({ botToken: process.env.BOT_TOKEN! }));
 *
 * // in your mini app's backend (not a bot handler) — validate the initData the frontend sent:
 * const result = await miniApp({ botToken }).validate... // see the standalone `validateInitData` below
 * ```
 *
 * `ctx.miniApp.validate` is the same check, scoped to the bot token given here — handy when a
 * command hands off to the mini app's own http endpoint but you'd rather keep one bot-token
 * source of truth:
 *
 * ```ts
 * bot.command("check", async (ctx) => {
 *   const result = await ctx.miniApp.validate(ctx.message?.text?.split(" ")[1] ?? "");
 *   await ctx.reply(result.ok ? `hi ${result.data.user?.first_name}` : `rejected: ${result.reason}`);
 * });
 * ```
 */
export function miniApp(options: MiniAppOptions): Plugin<Context, { miniApp: MiniAppControl }> {
	const control: MiniAppControl = {
		validate: (initData, validateOptions) =>
			validateInitData(initData, options.botToken, validateOptions),
		parse: parseInitData,
	};

	return (composer) => composer.decorate({ miniApp: control });
}

/**
 * parse a `message.web_app_data.data` payload (sent by `Telegram.WebApp.sendData()`) as JSON.
 * telegram warns this field is client-controlled — validate the shape of `T` as you would any
 * other untrusted input.
 */
export function parseWebAppData<T = unknown>(data: string): T {
	try {
		return JSON.parse(data) as T;
	} catch (error) {
		throw new Error(`mini-app: web_app_data.data is not valid JSON: ${(error as Error).message}`);
	}
}

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

const START_PARAM_PATTERN = /^[A-Za-z0-9_-]{0,64}$/;

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
	if (options.startParam !== undefined && !START_PARAM_PATTERN.test(options.startParam)) {
		throw new Error(
			`mini-app: startParam must match ${START_PARAM_PATTERN} (0-64 chars), got ${JSON.stringify(options.startParam)}`,
		);
	}

	const path = options.appName
		? `/${options.botUsername}/${options.appName}`
		: `/${options.botUsername}`;
	const url = new URL(`https://t.me${path}`);
	if (options.startParam !== undefined) url.searchParams.set("startapp", options.startParam);
	if (options.mode) url.searchParams.set("mode", options.mode);
	return url.toString();
}
