/**
 * WebCrypto-only primitives — no `node:crypto`/`Buffer`, so this runs unmodified on node, bun,
 * deno and edge/web runtimes. Two algorithms back the two `initData` validation modes Telegram
 * documents: HMAC-SHA256 (bot-token secret, checked against `hash`) and Ed25519 (Telegram's
 * public key, checked against `signature` — verifiable by a third party with no bot token).
 */

const textEncoder = new TextEncoder();

/** copy into a fresh `ArrayBuffer` — webcrypto rejects shared/offset-backed views. */
export function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
	const copy = new Uint8Array(bytes.byteLength);
	copy.set(bytes);
	return copy.buffer;
}

/** constant-time string compare (pure js — avoids leaking hash-match progress via timing). */
export function constantTimeEqual(a: string, b: string): boolean {
	if (a.length !== b.length) return false;
	let diff = 0;
	for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
	return diff === 0;
}

export function toHex(bytes: Uint8Array): string {
	return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

const HEX_RE = /^[0-9a-f]+$/i;

export function fromHex(hex: string): Uint8Array {
	if (hex.length % 2 !== 0 || !HEX_RE.test(hex)) {
		throw new Error(`mini-app: ${JSON.stringify(hex)} is not valid hex`);
	}
	const bytes = new Uint8Array(hex.length / 2);
	for (let i = 0; i < bytes.length; i++)
		bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
	return bytes;
}

/** decode base64url (RFC 4648 §5), padding optional — the shape telegram sends `signature` in. */
export function fromBase64Url(value: string): Uint8Array {
	const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
	const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
	const binary = atob(padded);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
	return bytes;
}

async function importHmacKey(keyBytes: Uint8Array): Promise<CryptoKey> {
	return crypto.subtle.importKey(
		"raw",
		toArrayBuffer(keyBytes),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);
}

export async function hmacSha256Hex(keyBytes: Uint8Array, message: string): Promise<string> {
	const key = await importHmacKey(keyBytes);
	const signature = await crypto.subtle.sign(
		"HMAC",
		key,
		toArrayBuffer(textEncoder.encode(message)),
	);
	return toHex(new Uint8Array(signature));
}

/**
 * verify an Ed25519 signature (telegram's third-party `signature` field) against a raw public
 * key. `publicKey`/`signature` are both raw bytes — callers decode from hex/base64url first.
 */
export async function verifyEd25519(
	publicKey: Uint8Array,
	message: string,
	signature: Uint8Array,
): Promise<boolean> {
	const key = await crypto.subtle.importKey(
		"raw",
		toArrayBuffer(publicKey),
		{ name: "Ed25519" },
		false,
		["verify"],
	);
	return crypto.subtle.verify(
		"Ed25519",
		key,
		toArrayBuffer(signature),
		toArrayBuffer(textEncoder.encode(message)),
	);
}

/**
 * `HMAC_SHA256("WebAppData", botToken)` — the secret key telegram's `hash` is computed against.
 * Cached per token: deriving it is two WebCrypto round-trips, and a validator on a busy mini-app
 * backend calls this on every request with the same token.
 */
const secretKeyCache = new Map<string, Promise<Uint8Array>>();

export function getBotTokenSecretKey(botToken: string): Promise<Uint8Array> {
	let cached = secretKeyCache.get(botToken);
	if (!cached) {
		cached = importHmacKey(textEncoder.encode("WebAppData"))
			.then((key) => crypto.subtle.sign("HMAC", key, toArrayBuffer(textEncoder.encode(botToken))))
			.then((signature) => new Uint8Array(signature));
		secretKeyCache.set(botToken, cached);
	}
	return cached;
}

/**
 * the `bot_id` telegram expects to prefix the third-party data-check-string — the part of a bot
 * token before `:`. used by the {@link miniApp} plugin to derive `botId` for
 * `ctx.miniApp.validateThirdParty` from the same `botToken` it validates `hash` against; the
 * standalone {@link validateInitDataThirdParty} takes `botId` directly and never calls this.
 */
export function botIdFromToken(botToken: string): string {
	const id = botToken.split(":")[0];
	if (!id || !/^\d+$/.test(id)) {
		throw new Error(
			`mini-app: botToken ${JSON.stringify(botToken)} doesn't look like "<bot_id>:<hash>" — could not derive bot_id`,
		);
	}
	return id;
}
