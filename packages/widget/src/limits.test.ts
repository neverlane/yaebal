import assert from "node:assert/strict";
import test from "node:test";
import {
	assertAnswer,
	assertCacheTime,
	assertData,
	assertDimension,
	assertQueryData,
	byteLength,
	WIDGET_LIMITS,
	WidgetError,
} from "./limits.js";

const code = (c: string) => (error: unknown) => error instanceof WidgetError && error.code === c;

test("byteLength counts UTF-8 bytes, not code units", () => {
	assert.equal(byteLength("abc"), 3);
	assert.equal(byteLength("я"), 2);
	assert.equal(byteLength("🎉"), 4);
});

test("WidgetError carries its code and a WidgetError name", () => {
	const error = new WidgetError("WIDGET_QUERY_INVALID", "nope");
	assert.equal(error.name, "WidgetError");
	assert.equal(error.code, "WIDGET_QUERY_INVALID");
	assert.equal(error.message, "nope");
	assert.ok(error instanceof Error);
});

test("assertData allows up to 1024 bytes and rejects more or NUL", () => {
	const max = "x".repeat(WIDGET_LIMITS.dataBytes);
	assert.equal(assertData(max), max);
	assert.equal(assertData(""), "");
	assert.throws(() => assertData(`${max}x`), code("INPUT_MEDIA_WIDGET_DATA_TOO_LARGE"));
	assert.throws(() => assertData("я".repeat(513), "chat_data"), /chat_data is 1026 bytes/);
	assert.throws(() => assertData("a\0b"), code("INPUT_MEDIA_WIDGET_DATA_INVALID"));
});

test("assertAnswer allows up to 1024 bytes", () => {
	assert.equal(assertAnswer("ok"), "ok");
	assert.throws(() => assertAnswer("x".repeat(1025)), code("WIDGET_RESULT_TOO_LARGE"));
});

test("assertQueryData needs 1-64 bytes", () => {
	assert.equal(assertQueryData("a"), "a");
	assert.equal(assertQueryData("x".repeat(64)), "x".repeat(64));
	assert.throws(() => assertQueryData(""), code("WIDGET_QUERY_INVALID"));
	assert.throws(() => assertQueryData("x".repeat(65)), /1-64 bytes, got 65/);
});

test("assertCacheTime refuses non-integers and values below 5", () => {
	assert.equal(assertCacheTime(5), 5);
	assert.equal(assertCacheTime(99999), 99999);
	assert.throws(() => assertCacheTime(4), code("WIDGET_CACHE_TIME_INVALID"));
	assert.throws(() => assertCacheTime(5.5), code("WIDGET_CACHE_TIME_INVALID"));
});

test("assertDimension wants a positive integer", () => {
	assert.equal(assertDimension(320, "width"), 320);
	assert.throws(() => assertDimension(0, "height"), /height must be a positive integer/);
	assert.throws(() => assertDimension(1.5, "width"), code("WIDGET_SIZE_INVALID"));
});
