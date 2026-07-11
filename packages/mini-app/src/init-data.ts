import {
	constantTimeEqual,
	fromBase64Url,
	fromHex,
	getBotTokenSecretKey,
	hmacSha256Hex,
	verifyEd25519,
} from "./crypto.js";

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

export const INIT_DATA_CHAT_TYPES = [
	"sender",
	"private",
	"group",
	"supergroup",
	"channel",
] as const;
export type InitDataChatType = (typeof INIT_DATA_CHAT_TYPES)[number];

/** the fully parsed, typed `initData` fields — see [Validating data received via the Mini App](https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app). */
export interface InitData {
	query_id?: string;
	user?: InitDataUser;
	receiver?: InitDataUser;
	chat?: InitDataChat;
	chat_type?: InitDataChatType;
	chat_instance?: string;
	/** the payload passed to `miniAppLink`'s `startParam`, round-tripped back by telegram. */
	start_param?: string;
	can_send_after?: number;
	auth_date: Date;
	/**
	 * present on every `initData` telegram actually sends; typed optional because
	 * {@link validateInitDataThirdParty} never looks at it (only `signature`), and parsing must
	 * not fail on a payload that was deliberately trimmed to just the third-party-relevant fields.
	 */
	hash?: string;
	/** ed25519 signature (third-party-verifiable, no bot token needed) — see {@link validateInitDataThirdParty}. */
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
 * parse `initData` into a typed {@link InitData} — no signature check, so only trust the result
 * after (or via) {@link validateInitData}/{@link validateInitDataThirdParty}. throws on a
 * structurally invalid string (missing/non-integer `auth_date`, or a `user`/`receiver`/`chat`
 * field that isn't valid JSON). `hash` is *not* required — {@link validateInitDataThirdParty}
 * never checks it, only `signature`.
 */
export function parseInitData(initData: string): InitData {
	const params = new URLSearchParams(initData);

	const authDateRaw = params.get("auth_date");
	if (!authDateRaw) throw new Error('mini-app: initData is missing "auth_date"');
	if (!/^-?\d+$/.test(authDateRaw)) {
		throw new Error(
			`mini-app: invalid auth_date ${JSON.stringify(authDateRaw)} (expected integer seconds)`,
		);
	}

	const data: InitData = { auth_date: new Date(Number(authDateRaw) * 1000) };

	const hash = params.get("hash");
	if (hash !== null) data.hash = hash;

	const queryId = params.get("query_id");
	if (queryId !== null) data.query_id = queryId;

	const user = params.get("user");
	if (user !== null) data.user = parseJsonField<InitDataUser>("user", user);

	const receiver = params.get("receiver");
	if (receiver !== null) data.receiver = parseJsonField<InitDataUser>("receiver", receiver);

	const chat = params.get("chat");
	if (chat !== null) data.chat = parseJsonField<InitDataChat>("chat", chat);

	const chatType = params.get("chat_type");
	if (chatType !== null) {
		if (!(INIT_DATA_CHAT_TYPES as readonly string[]).includes(chatType)) {
			throw new Error(
				`mini-app: invalid chat_type ${JSON.stringify(chatType)} (expected one of ${INIT_DATA_CHAT_TYPES.join(", ")})`,
			);
		}
		data.chat_type = chatType as InitDataChatType;
	}

	const chatInstance = params.get("chat_instance");
	if (chatInstance !== null) data.chat_instance = chatInstance;

	const startParam = params.get("start_param");
	if (startParam !== null) data.start_param = startParam;

	const canSendAfter = params.get("can_send_after");
	if (canSendAfter !== null && /^-?\d+$/.test(canSendAfter))
		data.can_send_after = Number(canSendAfter);

	const signature = params.get("signature");
	if (signature !== null) data.signature = signature;

	return data;
}

/** fields excluded from every data-check-string telegram computes a signature over. */
const SIGNED_EXCLUDED_FIELDS = new Set(["hash", "signature"]);

/**
 * the sorted-by-key `field=value\n…` string telegram signs — shared by both validation modes.
 * sorts by key alone (not the full `"key=value"` pair, which mis-sorts once a value contains a
 * character that sorts differently than a real telegram field name would).
 */
function dataCheckString(params: URLSearchParams): string {
	const pairs: Array<[string, string]> = [];
	for (const [key, value] of params) {
		if (!SIGNED_EXCLUDED_FIELDS.has(key)) pairs.push([key, value]);
	}
	pairs.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
	return pairs.map(([key, value]) => `${key}=${value}`).join("\n");
}

export type InitDataValidationFailureReason =
	| "missing_hash"
	| "bad_hash"
	| "missing_signature"
	| "bad_signature"
	| "expired"
	| "malformed";

export type InitDataValidationResult =
	| { ok: true; data: InitData }
	| { ok: false; reason: InitDataValidationFailureReason };

export interface ValidateInitDataOptions {
	/**
	 * reject `initData` older than this many seconds (checked against `auth_date`).
	 * `initData` has no built-in expiry, so replaying an old-but-genuinely-signed payload is
	 * otherwise valid forever — defaults to `86400` (24h). pass `false` (or `Infinity`) to
	 * disable the check entirely; **`0` is a real threshold ("must be from this exact second"),
	 * not a way to disable it** — that would reject everything.
	 */
	maxAge?: number | false;
	/** clock used against `maxAge`. defaults to `new Date()`. */
	now?: Date;
}

function checkExpiry(authDate: Date, options: ValidateInitDataOptions): "expired" | undefined {
	const maxAge = options.maxAge ?? 86_400;
	if (maxAge === false || maxAge === Infinity) return undefined;
	const now = options.now ?? new Date();
	const ageSeconds = (now.getTime() - authDate.getTime()) / 1000;
	if (ageSeconds > maxAge) return "expired";
	return undefined;
}

/** parse after a signature has already been confirmed valid — a parse failure here means malformed, not forged, data. */
function parseValidated(initData: string): InitData | { malformed: true } {
	try {
		return parseInitData(initData);
	} catch {
		return { malformed: true };
	}
}

/**
 * validate `initData`'s `hash` against `botToken` per telegram's
 * [Validating data received via the Mini App](https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app),
 * and its freshness (see `maxAge`). standalone — independent of any bot or `ctx`; see {@link miniApp}
 * for the `ctx.miniApp.validate` form bound to a bot token.
 */
export async function validateInitData(
	initData: string,
	botToken: string,
	options: ValidateInitDataOptions = {},
): Promise<InitDataValidationResult> {
	const params = new URLSearchParams(initData);
	const hash = params.get("hash");
	if (!hash) return { ok: false, reason: "missing_hash" };

	const secretKey = await getBotTokenSecretKey(botToken);
	const computedHash = await hmacSha256Hex(secretKey, dataCheckString(params));
	if (!constantTimeEqual(computedHash, hash)) return { ok: false, reason: "bad_hash" };

	const parsed = parseValidated(initData);
	if ("malformed" in parsed) return { ok: false, reason: "malformed" };

	const expired = checkExpiry(parsed.auth_date, options);
	if (expired) return { ok: false, reason: expired };

	return { ok: true, data: parsed };
}

/** boolean convenience over {@link validateInitData} — for call sites that don't need the reason/data. */
export async function isValidInitData(
	initData: string,
	botToken: string,
	options?: ValidateInitDataOptions,
): Promise<boolean> {
	return (await validateInitData(initData, botToken, options)).ok;
}

/** telegram's Ed25519 public keys for third-party `initData` validation (hex, 32 bytes). */
export const TELEGRAM_ED25519_PUBLIC_KEYS = {
	production: "e7bf03a2fa4602af4580703d88dda5bb59f32ed8b02a56c187fe7d34caed242d",
	test: "40055058a4ee38156a06562e52eece92a771bcd8346a8c4615cb7376eddf72ec",
} as const;

export interface ValidateInitDataThirdPartyOptions extends ValidateInitDataOptions {
	/** validate against telegram's test-environment key instead of production. default `false`. */
	test?: boolean;
	/** override the Ed25519 public key (hex) — mainly for tests, or if telegram rotates keys ahead of a release. */
	publicKey?: string;
}

/**
 * validate `initData`'s `signature` against telegram's Ed25519 public key — no bot token
 * required, so any third party (not just the bot owner) can confirm a payload is genuine. see
 * [Validating data received via the Mini App](https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app)
 * for when telegram populates `signature` (Bot API 7.2+).
 */
export async function validateInitDataThirdParty(
	initData: string,
	botId: string | number,
	options: ValidateInitDataThirdPartyOptions = {},
): Promise<InitDataValidationResult> {
	const params = new URLSearchParams(initData);
	const signature = params.get("signature");
	if (!signature) return { ok: false, reason: "missing_signature" };

	const publicKeyHex =
		options.publicKey ??
		(options.test ? TELEGRAM_ED25519_PUBLIC_KEYS.test : TELEGRAM_ED25519_PUBLIC_KEYS.production);
	const message = `${botId}:WebAppData\n${dataCheckString(params)}`;

	let signatureBytes: Uint8Array;
	try {
		signatureBytes = fromBase64Url(signature);
	} catch {
		return { ok: false, reason: "bad_signature" };
	}

	const valid = await verifyEd25519(fromHex(publicKeyHex), message, signatureBytes);
	if (!valid) return { ok: false, reason: "bad_signature" };

	const parsed = parseValidated(initData);
	if ("malformed" in parsed) return { ok: false, reason: "malformed" };

	const expired = checkExpiry(parsed.auth_date, options);
	if (expired) return { ok: false, reason: expired };

	return { ok: true, data: parsed };
}

/** boolean convenience over {@link validateInitDataThirdParty}. */
export async function isValidInitDataThirdParty(
	initData: string,
	botId: string | number,
	options?: ValidateInitDataThirdPartyOptions,
): Promise<boolean> {
	return (await validateInitDataThirdParty(initData, botId, options)).ok;
}

/** the fields {@link signInitData} accepts — every `InitData` field except `hash` (computed) and `signature` (ed25519-only). */
export interface SignableInitDataFields {
	query_id?: string;
	user?: InitDataUser;
	receiver?: InitDataUser;
	chat?: InitDataChat;
	chat_type?: InitDataChatType;
	chat_instance?: string;
	start_param?: string;
	can_send_after?: number;
	/** defaults to now. a `Date`, or Unix seconds. */
	auth_date?: Date | number;
}

/**
 * sign a set of fields into a valid `initData` string the way telegram does (`hash =
 * HMAC_SHA256(secret_key, data_check_string)`, `secret_key = HMAC_SHA256("WebAppData",
 * botToken)`) — for tests and local development, so you're not hand-rolling telegram's signing
 * scheme in every consumer's test suite. round-trips with {@link validateInitData}.
 */
export async function signInitData(
	fields: SignableInitDataFields,
	botToken: string,
): Promise<string> {
	const authDate = fields.auth_date ?? new Date();
	const authDateSeconds =
		authDate instanceof Date ? Math.floor(authDate.getTime() / 1000) : Math.floor(authDate);

	const raw: Record<string, string> = { auth_date: String(authDateSeconds) };
	if (fields.query_id !== undefined) raw.query_id = fields.query_id;
	if (fields.user !== undefined) raw.user = JSON.stringify(fields.user);
	if (fields.receiver !== undefined) raw.receiver = JSON.stringify(fields.receiver);
	if (fields.chat !== undefined) raw.chat = JSON.stringify(fields.chat);
	if (fields.chat_type !== undefined) raw.chat_type = fields.chat_type;
	if (fields.chat_instance !== undefined) raw.chat_instance = fields.chat_instance;
	if (fields.start_param !== undefined) raw.start_param = fields.start_param;
	if (fields.can_send_after !== undefined) raw.can_send_after = String(fields.can_send_after);

	const params = new URLSearchParams(raw);
	const secretKey = await getBotTokenSecretKey(botToken);
	const hash = await hmacSha256Hex(secretKey, dataCheckString(params));
	params.set("hash", hash);
	return params.toString();
}

export { getBotTokenSecretKey };
