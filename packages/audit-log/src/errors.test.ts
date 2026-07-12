import assert from "node:assert/strict";
import test from "node:test";
import { HttpError, TelegramError } from "@yaebal/core";
import { formatError, serializeError } from "./errors.js";

test("serializeError normalizes a TelegramError with code + description", () => {
	const error = new TelegramError("sendMessage", 429, "Too Many Requests", { retry_after: 1 });
	const serialized = serializeError(error);

	assert.equal(serialized.name, "TelegramError");
	assert.equal(serialized.code, 429);
	assert.equal(serialized.description, "Too Many Requests");
	assert.equal(serialized.status, undefined);
	assert.ok(serialized.stack);
});

test("serializeError normalizes an HttpError with status + statusText", () => {
	const error = new HttpError("sendMessage", 502, "Bad Gateway");
	const serialized = serializeError(error);

	assert.equal(serialized.name, "HttpError");
	assert.equal(serialized.status, 502);
	assert.equal(serialized.statusText, "Bad Gateway");
	assert.equal(serialized.code, undefined);
});

test("serializeError normalizes a plain Error", () => {
	const serialized = serializeError(new Error("handler exploded"));
	assert.equal(serialized.name, "Error");
	assert.equal(serialized.message, "handler exploded");
	assert.equal(serialized.code, undefined);
});

test("serializeError never throws on a non-Error value", () => {
	assert.equal(serializeError("boom").message, "boom");
	assert.equal(serializeError(42).message, "42");
	assert.doesNotThrow(() => serializeError({ circular: {} as unknown }));

	const circular: Record<string, unknown> = {};
	circular.self = circular;
	assert.doesNotThrow(() => serializeError(circular));
});

test("serializeError survives JSON.stringify — unlike a bare Error", () => {
	const error = new TelegramError("sendMessage", 400, "Bad Request");
	const json = JSON.stringify(serializeError(error));
	const parsed = JSON.parse(json);

	assert.equal(parsed.code, 400);
	assert.equal(parsed.description, "Bad Request");
	// the bug this closes: `JSON.stringify(new Error("x"))` is `"{}"` — nothing survives.
	assert.notEqual(json, "{}");
});

test("formatError prefers the telegram code, then http status, then the bare message", () => {
	assert.equal(
		formatError(serializeError(new TelegramError("m", 429, "Too Many Requests"))),
		"429: Too Many Requests",
	);
	assert.equal(
		formatError(serializeError(new HttpError("m", 502, "Bad Gateway"))),
		"502 Bad Gateway",
	);
	assert.equal(formatError(serializeError(new Error("nope"))), "nope");
});
