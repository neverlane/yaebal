import assert from "node:assert/strict";
import test from "node:test";
import { applyRedaction, DEFAULT_SECRET_KEYS } from "./redact.js";

test("DEFAULT_SECRET_KEYS includes the bot-api secrets that matter most", () => {
	for (const key of ["secret_token", "token", "phone_number", "password"]) {
		assert.ok(DEFAULT_SECRET_KEYS.includes(key), `expected ${key} in the default denylist`);
	}
});

test("masks known secret keys wherever they occur, at any depth", () => {
	const value = {
		params: { secret_token: "abc123", chat_id: 1 },
		nested: { deeply: { access_token: "xyz" } },
	};
	const redacted = applyRedaction(value) as typeof value;

	assert.equal(redacted.params.secret_token, "[redacted]");
	assert.equal(redacted.params.chat_id, 1);
	assert.equal((redacted.nested.deeply as { access_token: string }).access_token, "[redacted]");
});

test("secret key matching is case-insensitive", () => {
	const redacted = applyRedaction({ Secret_Token: "abc" }) as { Secret_Token: string };
	assert.equal(redacted.Secret_Token, "[redacted]");
});

test("custom secretKeys replaces the default denylist entirely", () => {
	const redacted = applyRedaction(
		{ secret_token: "abc", custom_field: "def" },
		{ secretKeys: ["custom_field"] },
	) as { secret_token: string; custom_field: string };

	// secret_token is no longer in the (replaced) denylist
	assert.equal(redacted.secret_token, "abc");
	assert.equal(redacted.custom_field, "[redacted]");
});

test("paths mask specific fields by location, regardless of key name", () => {
	const value = { update: { message: { text: "hello world" } }, params: { text: "unrelated" } };
	const redacted = applyRedaction(value, { paths: ["update.message.text"] }) as typeof value;

	assert.equal(redacted.update.message.text, "[redacted]");
	assert.equal(redacted.params.text, "unrelated");
});

test("a `*` path segment matches any single key at that depth", () => {
	const value = { a: { x: { text: "1" } }, b: { y: { text: "2" } } };
	const redacted = applyRedaction(value, { paths: ["*.*.text"] }) as typeof value;

	assert.equal(redacted.a.x.text, "[redacted]");
	assert.equal(redacted.b.y.text, "[redacted]");
});

test("truncates long strings and reports how many characters were omitted", () => {
	const long = "x".repeat(3000);
	const redacted = applyRedaction({ text: long }, { maxStringLength: 100 }) as { text: string };

	assert.ok(redacted.text.startsWith("x".repeat(100)));
	assert.match(redacted.text, /…\(\+2900 chars\)$/);
});

test("maxStringLength: 0 disables truncation", () => {
	const long = "x".repeat(3000);
	const redacted = applyRedaction({ text: long }, { maxStringLength: 0 }) as { text: string };
	assert.equal(redacted.text.length, 3000);
});

test("strips binary buffers to a byte-length placeholder by default", () => {
	const buffer = new Uint8Array(2048);
	const redacted = applyRedaction({ photo: buffer }) as unknown as { photo: string };
	assert.equal(redacted.photo, "[binary 2048 bytes]");
});

test("stripBinary: false leaves binary payloads untouched", () => {
	const buffer = new Uint8Array([1, 2, 3]);
	const redacted = applyRedaction({ photo: buffer }, { stripBinary: false }) as {
		photo: Uint8Array;
	};
	assert.equal(redacted.photo, buffer);
});

test("never mutates the original value", () => {
	const value = { params: { secret_token: "abc" } };
	applyRedaction(value);
	assert.equal(value.params.secret_token, "abc");
});

test("class instances, functions, and other non-plain objects degrade to a safe placeholder instead of throwing", () => {
	class Weird {
		constructor(public field = "x") {}
	}

	const value = { instance: new Weird(), fn: () => "nope", map: new Map([["a", 1]]) };
	const redacted = applyRedaction(value) as unknown as {
		instance: string;
		fn: string;
		map: string;
	};

	assert.match(redacted.instance, /^\[object Weird\]$/);
	assert.match(redacted.fn, /^\[object /);
	assert.match(redacted.map, /^\[object Map\]$/);
});

test("Date instances pass through unchanged", () => {
	const date = new Date();
	const redacted = applyRedaction({ at: date }) as { at: Date };
	assert.equal(redacted.at, date);
});

test("array elements are still walked for secrets and binaries", () => {
	const redacted = applyRedaction({ items: [{ token: "a" }, { token: "b" }] }) as {
		items: { token: string }[];
	};
	assert.equal(redacted.items[0]?.token, "[redacted]");
	assert.equal(redacted.items[1]?.token, "[redacted]");
});
