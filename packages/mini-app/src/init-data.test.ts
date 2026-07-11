import assert from "node:assert/strict";
import { createHmac, sign as edSign, generateKeyPairSync, type KeyObject } from "node:crypto";
import test from "node:test";
import {
	type InitDataChat,
	type InitDataUser,
	isValidInitData,
	isValidInitDataThirdParty,
	parseInitData,
	signInitData,
	TELEGRAM_ED25519_PUBLIC_KEYS,
	validateInitData,
	validateInitDataThirdParty,
} from "./init-data.js";

const BOT_TOKEN = "123456:AAFake-token-for-tests";
const BOT_ID = "123456";

/**
 * independently signs `fields` the way telegram's spec (not our implementation) says to — sorts
 * by *key*, joins `key=value` with `\n`. proves `validateInitData` matches the spec, not just
 * itself. `extra` params are appended to the querystring after signing (untouched by the hash),
 * so tests can simulate telegram sending fields our code must not choke on.
 */
function signHmac(
	fields: Record<string, string>,
	botToken = BOT_TOKEN,
	extra: Record<string, string> = {},
): string {
	const dataCheckString = Object.entries(fields)
		.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
		.map(([key, value]) => `${key}=${value}`)
		.join("\n");
	const secretKey = createHmac("sha256", "WebAppData").update(botToken).digest();
	const hash = createHmac("sha256", secretKey).update(dataCheckString).digest("hex");
	return new URLSearchParams({ ...fields, ...extra, hash }).toString();
}

function makeEd25519TestKeypair(): { publicKeyHex: string; privateKey: KeyObject } {
	const { publicKey, privateKey } = generateKeyPairSync("ed25519");
	const jwk = publicKey.export({ format: "jwk" }) as { x: string };
	const publicKeyHex = Buffer.from(jwk.x, "base64url").toString("hex");
	return { publicKeyHex, privateKey };
}

/** independently signs `fields` per telegram's third-party (ed25519) spec: `{botId}:WebAppData\n` + sorted-by-key fields. */
function signEd25519(
	fields: Record<string, string>,
	botId: string,
	privateKey: KeyObject,
	extra: Record<string, string> = {},
): string {
	const dataCheckString = Object.entries(fields)
		.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
		.map(([key, value]) => `${key}=${value}`)
		.join("\n");
	const message = `${botId}:WebAppData\n${dataCheckString}`;
	const signature = edSign(null, Buffer.from(message, "utf8"), privateKey).toString("base64url");
	return new URLSearchParams({ ...fields, ...extra, signature }).toString();
}

const sampleUser: InitDataUser = { id: 1, first_name: "Linia", username: "linia" };

test("validateInitData: accepts a correctly signed payload", async () => {
	const initData = signHmac({
		query_id: "AAH_query",
		user: JSON.stringify(sampleUser),
		auth_date: "1700000000",
	});

	const result = await validateInitData(initData, BOT_TOKEN, { maxAge: false });
	assert.equal(result.ok, true);
	assert.ok(result.ok && result.data.user?.id === 1);
	assert.ok(result.ok && result.data.auth_date.getTime() === 1_700_000_000_000);
});

test("validateInitData: real telegram payload shape (carries `signature`) validates — regression for excluding both `hash` and `signature` from the check string", async () => {
	// telegram (Bot API 7.2+) always includes a `signature` field alongside `hash`. the hash is
	// computed over every field *except* `hash` and `signature` — if `signature` leaks into the
	// data-check-string, this rejects with `bad_hash` even though nothing was tampered with.
	const initData = signHmac(
		{ auth_date: "1700000000", user: JSON.stringify(sampleUser) },
		BOT_TOKEN,
		{ signature: "not-a-real-ed25519-sig-but-present-like-telegram-sends" },
	);

	const result = await validateInitData(initData, BOT_TOKEN, { maxAge: false });
	assert.equal(result.ok, true);
	assert.ok(result.ok && result.data.user?.id === 1);
	assert.equal(
		result.ok ? result.data.signature : undefined,
		"not-a-real-ed25519-sig-but-present-like-telegram-sends",
	);
});

test("validateInitData: sorts the data-check-string by key, not by the full `key=value` pair", async () => {
	// "foo" is a prefix of "foo0" — sorting full `"key=value"` strings would put `foo0=…` before
	// `foo=…` (`'0'` 0x30 < `'='` 0x3D), while sorting by key alone (what telegram's spec says)
	// keeps `foo` first. an independently-computed, spec-correct hash only matches our
	// implementation if it also sorts by key.
	const initData = signHmac({ auth_date: "1700000000", foo: "1", foo0: "2" });
	const result = await validateInitData(initData, BOT_TOKEN, { maxAge: false });
	assert.equal(result.ok, true);
});

test("validateInitData: rejects a tampered field (hash no longer matches)", async () => {
	const initData = signHmac({ user: JSON.stringify(sampleUser), auth_date: "1700000000" });
	const tampered = new URLSearchParams(initData);
	tampered.set("user", JSON.stringify({ id: 999, first_name: "Eve" }));

	const result = await validateInitData(tampered.toString(), BOT_TOKEN);
	assert.deepEqual(result, { ok: false, reason: "bad_hash" });
});

test("validateInitData: rejects when signed with a different bot token", async () => {
	const initData = signHmac({ auth_date: "1700000000" }, "999999:other-token");
	const result = await validateInitData(initData, BOT_TOKEN);
	assert.deepEqual(result, { ok: false, reason: "bad_hash" });
});

test("validateInitData: missing hash is rejected without touching the token", async () => {
	const result = await validateInitData("auth_date=1700000000", BOT_TOKEN);
	assert.deepEqual(result, { ok: false, reason: "missing_hash" });
});

test("validateInitData: a valid hash over structurally malformed data returns 'malformed', not a throw", async () => {
	// the hash matches whatever bytes were signed — it says nothing about whether those bytes
	// happen to be valid JSON. `validate*` must resolve, never throw, on this input.
	const initData = signHmac({ auth_date: "1700000000", user: "not-json" });
	const result = await validateInitData(initData, BOT_TOKEN);
	assert.deepEqual(result, { ok: false, reason: "malformed" });
});

test("validateInitData: defaults to a 24h maxAge (replay protection with no options)", async () => {
	const initData = signHmac({ auth_date: "1700000000" });

	const justUnder = await validateInitData(initData, BOT_TOKEN, {
		now: new Date(1_700_000_000_000 + 86_400_000 - 1000),
	});
	assert.equal(justUnder.ok, true);

	const justOver = await validateInitData(initData, BOT_TOKEN, {
		now: new Date(1_700_000_000_000 + 86_400_000 + 1000),
	});
	assert.deepEqual(justOver, { ok: false, reason: "expired" });
});

test("validateInitData: maxAge rejects stale auth_date, accepts fresh", async () => {
	const initData = signHmac({ auth_date: "1700000000" });
	const now = new Date(1_700_000_000_000 + 3600_000); // one hour later

	const stale = await validateInitData(initData, BOT_TOKEN, { maxAge: 1800, now });
	assert.deepEqual(stale, { ok: false, reason: "expired" });

	const fresh = await validateInitData(initData, BOT_TOKEN, { maxAge: 7200, now });
	assert.equal(fresh.ok, true);
});

test("validateInitData: maxAge: false disables the expiry check entirely", async () => {
	const initData = signHmac({ auth_date: "1700000000" });
	const farFuture = new Date(1_700_000_000_000 + 86_400_000 * 365);
	const result = await validateInitData(initData, BOT_TOKEN, { maxAge: false, now: farFuture });
	assert.equal(result.ok, true);
});

test("validateInitData: maxAge: 0 is a real (zero-tolerance) threshold, not a way to disable expiry", async () => {
	const initData = signHmac({ auth_date: "1700000000" });
	const oneSecondLater = new Date(1_700_000_001_000);
	const result = await validateInitData(initData, BOT_TOKEN, { maxAge: 0, now: oneSecondLater });
	assert.deepEqual(result, { ok: false, reason: "expired" });
});

test("isValidInitData: boolean convenience over validateInitData", async () => {
	const initData = signHmac({ auth_date: "1700000000" });
	assert.equal(await isValidInitData(initData, BOT_TOKEN, { maxAge: false }), true);
	assert.equal(await isValidInitData("hash=bad&auth_date=1700000000", BOT_TOKEN), false);
});

test("signInitData / validateInitData: round-trips, including the default (now) auth_date", async () => {
	const signed = await signInitData(
		{ user: sampleUser, auth_date: new Date(1_700_000_000_000) },
		BOT_TOKEN,
	);
	const result = await validateInitData(signed, BOT_TOKEN, { maxAge: false });
	assert.equal(result.ok, true);
	assert.ok(result.ok && result.data.user);
	assert.deepEqual(result.ok ? result.data.user : undefined, sampleUser);

	const signedNow = await signInitData({ start_param: "ref_42" }, BOT_TOKEN);
	const nowResult = await validateInitData(signedNow, BOT_TOKEN);
	assert.equal(nowResult.ok, true); // default maxAge (24h) — "now" is well within it
});

test("parseInitData: parses user, receiver, chat and scalar fields", () => {
	const receiver: InitDataUser = { id: 2, first_name: "Bot" };
	const chat: InitDataChat = { id: 3, type: "supergroup", title: "yaebal" };

	const initData = signHmac({
		user: JSON.stringify(sampleUser),
		receiver: JSON.stringify(receiver),
		chat: JSON.stringify(chat),
		chat_type: "supergroup",
		chat_instance: "abc",
		start_param: "ref_42",
		auth_date: "1700000000",
	});

	const data = parseInitData(initData);
	assert.deepEqual(data.user, sampleUser);
	assert.deepEqual(data.receiver, receiver);
	assert.deepEqual(data.chat, chat);
	assert.equal(data.chat_type, "supergroup");
	assert.equal(data.start_param, "ref_42");
	assert.equal(data.auth_date.getTime(), 1_700_000_000_000);
});

test("parseInitData: throws on missing auth_date", () => {
	assert.throws(() => parseInitData("hash=deadbeef"), /auth_date/);
});

test("parseInitData: hash is optional — a signature-only (third-party) payload parses fine", () => {
	const data = parseInitData("auth_date=1700000000&signature=abc");
	assert.equal(data.hash, undefined);
	assert.equal(data.signature, "abc");
	assert.equal(data.auth_date.getTime(), 1_700_000_000_000);
});

test("parseInitData: throws on a non-integer auth_date", () => {
	const bad = new URLSearchParams({ auth_date: "not-a-number", hash: "x" });
	assert.throws(() => parseInitData(bad.toString()), /auth_date/);
});

test("parseInitData: throws when user is not valid JSON", () => {
	const bad = new URLSearchParams({ user: "not-json", auth_date: "1700000000", hash: "x" });
	assert.throws(() => parseInitData(bad.toString()), /not valid JSON/);
});

test("parseInitData: throws on an unrecognized chat_type", () => {
	const bad = new URLSearchParams({ chat_type: "bogus", auth_date: "1700000000", hash: "x" });
	assert.throws(() => parseInitData(bad.toString()), /chat_type/);
});

// ── third-party (ed25519) validation ──────────────────────────────────────────

test("validateInitDataThirdParty: accepts a correctly signed payload (injected test keypair)", async () => {
	const { publicKeyHex, privateKey } = makeEd25519TestKeypair();
	const initData = signEd25519(
		{ auth_date: "1700000000", user: JSON.stringify(sampleUser) },
		BOT_ID,
		privateKey,
	);

	const result = await validateInitDataThirdParty(initData, BOT_ID, {
		publicKey: publicKeyHex,
		maxAge: false,
	});
	assert.equal(result.ok, true);
	assert.ok(result.ok && result.data.user?.id === 1);
});

test("validateInitDataThirdParty: rejects a tampered field", async () => {
	const { publicKeyHex, privateKey } = makeEd25519TestKeypair();
	const initData = signEd25519(
		{ auth_date: "1700000000", user: JSON.stringify(sampleUser) },
		BOT_ID,
		privateKey,
	);
	const tampered = new URLSearchParams(initData);
	tampered.set("user", JSON.stringify({ id: 999, first_name: "Eve" }));

	const result = await validateInitDataThirdParty(tampered.toString(), BOT_ID, {
		publicKey: publicKeyHex,
	});
	assert.deepEqual(result, { ok: false, reason: "bad_signature" });
});

test("validateInitDataThirdParty: rejects a signature made with the wrong bot_id", async () => {
	const { publicKeyHex, privateKey } = makeEd25519TestKeypair();
	const initData = signEd25519({ auth_date: "1700000000" }, "999999", privateKey);

	const result = await validateInitDataThirdParty(initData, BOT_ID, { publicKey: publicKeyHex });
	assert.deepEqual(result, { ok: false, reason: "bad_signature" });
});

test("validateInitDataThirdParty: rejects against the wrong public key", async () => {
	const { privateKey } = makeEd25519TestKeypair();
	const { publicKeyHex: otherPublicKeyHex } = makeEd25519TestKeypair();
	const initData = signEd25519({ auth_date: "1700000000" }, BOT_ID, privateKey);

	const result = await validateInitDataThirdParty(initData, BOT_ID, {
		publicKey: otherPublicKeyHex,
	});
	assert.deepEqual(result, { ok: false, reason: "bad_signature" });
});

test("validateInitDataThirdParty: missing signature is rejected without verifying anything", async () => {
	const result = await validateInitDataThirdParty("auth_date=1700000000", BOT_ID);
	assert.deepEqual(result, { ok: false, reason: "missing_signature" });
});

test("validateInitDataThirdParty: a valid signature over malformed data returns 'malformed'", async () => {
	const { publicKeyHex, privateKey } = makeEd25519TestKeypair();
	const initData = signEd25519({ auth_date: "1700000000", user: "not-json" }, BOT_ID, privateKey);

	const result = await validateInitDataThirdParty(initData, BOT_ID, { publicKey: publicKeyHex });
	assert.deepEqual(result, { ok: false, reason: "malformed" });
});

test("validateInitDataThirdParty: honors maxAge the same way validateInitData does", async () => {
	const { publicKeyHex, privateKey } = makeEd25519TestKeypair();
	const initData = signEd25519({ auth_date: "1700000000" }, BOT_ID, privateKey);
	const now = new Date(1_700_000_000_000 + 3600_000);

	const stale = await validateInitDataThirdParty(initData, BOT_ID, {
		publicKey: publicKeyHex,
		maxAge: 1800,
		now,
	});
	assert.deepEqual(stale, { ok: false, reason: "expired" });

	const fresh = await validateInitDataThirdParty(initData, BOT_ID, {
		publicKey: publicKeyHex,
		maxAge: 7200,
		now,
	});
	assert.equal(fresh.ok, true);
});

test("isValidInitDataThirdParty: boolean convenience", async () => {
	const { publicKeyHex, privateKey } = makeEd25519TestKeypair();
	const initData = signEd25519({ auth_date: "1700000000" }, BOT_ID, privateKey, {});
	assert.equal(
		await isValidInitDataThirdParty(initData, BOT_ID, { publicKey: publicKeyHex, maxAge: false }),
		true,
	);
	assert.equal(await isValidInitDataThirdParty("auth_date=1700000000", BOT_ID), false);
});

test("TELEGRAM_ED25519_PUBLIC_KEYS: production and test keys are well-formed 32-byte hex and importable", async () => {
	for (const key of [TELEGRAM_ED25519_PUBLIC_KEYS.production, TELEGRAM_ED25519_PUBLIC_KEYS.test]) {
		assert.match(key, /^[0-9a-f]{64}$/);
	}

	// a wrong byte length would make `crypto.subtle.importKey` reject — exercise the real
	// constants end to end (not just format) so a transcription slip in either key fails loud.
	const initData = new URLSearchParams({
		auth_date: "1700000000",
		signature: Buffer.alloc(64, 1).toString("base64url"),
		hash: "irrelevant",
	}).toString();

	for (const useTestKey of [false, true]) {
		const result = await validateInitDataThirdParty(initData, BOT_ID, { test: useTestKey });
		assert.deepEqual(result, { ok: false, reason: "bad_signature" });
	}
});
