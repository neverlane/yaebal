import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import { initDataFromAuthHeader, validateAuthHeader } from "./server.js";

const BOT_TOKEN = "123456:AAFake-token-for-tests";

function signHmac(fields: Record<string, string>, botToken = BOT_TOKEN): string {
	const dataCheckString = Object.entries(fields)
		.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
		.map(([key, value]) => `${key}=${value}`)
		.join("\n");
	const secretKey = createHmac("sha256", "WebAppData").update(botToken).digest();
	const hash = createHmac("sha256", secretKey).update(dataCheckString).digest("hex");
	return new URLSearchParams({ ...fields, hash }).toString();
}

test("initDataFromAuthHeader: extracts the payload from a `tma <initData>` header", () => {
	assert.equal(initDataFromAuthHeader("tma auth_date=1&hash=x"), "auth_date=1&hash=x");
	assert.equal(initDataFromAuthHeader("TMA auth_date=1&hash=x"), "auth_date=1&hash=x"); // scheme is case-insensitive
});

test("initDataFromAuthHeader: undefined for missing/malformed/wrong-scheme headers", () => {
	assert.equal(initDataFromAuthHeader(null), undefined);
	assert.equal(initDataFromAuthHeader(undefined), undefined);
	assert.equal(initDataFromAuthHeader(""), undefined);
	assert.equal(initDataFromAuthHeader("Bearer sometoken"), undefined);
	assert.equal(initDataFromAuthHeader("tma"), undefined); // no space, no payload
	assert.equal(initDataFromAuthHeader("tma   "), undefined); // payload is all whitespace
});

test("validateAuthHeader: validates the initData carried in the header", async () => {
	const initData = signHmac({ auth_date: "1700000000" });
	const result = await validateAuthHeader(`tma ${initData}`, BOT_TOKEN, { maxAge: false });
	assert.equal(result.ok, true);
});

test("validateAuthHeader: a missing/malformed header fails the same way an empty initData would", async () => {
	assert.deepEqual(await validateAuthHeader(null, BOT_TOKEN), {
		ok: false,
		reason: "missing_hash",
	});
	assert.deepEqual(await validateAuthHeader("Bearer x", BOT_TOKEN), {
		ok: false,
		reason: "missing_hash",
	});
});
