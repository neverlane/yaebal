import assert from "node:assert/strict";
import test from "node:test";
import type { Api, ErrorHook } from "@yaebal/core";
import { TelegramError } from "@yaebal/core";
import { autoRetry, decideRetry } from "./index.js";

test("429 with retry_after waits exactly that long", () => {
	assert.deepEqual(
		decideRetry(new TelegramError("sendMessage", 429, "Too Many Requests: retry after 7"), 1),
		{ retry: true, delayMs: 7000 },
	);
});

test("5xx retries with exponential backoff", () => {
	assert.deepEqual(decideRetry(new TelegramError("sendMessage", 502, "Bad Gateway"), 1), {
		retry: true,
		delayMs: 2000,
	});
});

test("stops once attempts exceed maxRetries", () => {
	assert.equal(decideRetry(new TelegramError("sendMessage", 429, "retry after 1"), 4), undefined);
});

test("4xx client errors are not retried", () => {
	assert.equal(decideRetry(new TelegramError("sendMessage", 400, "Bad Request"), 1), undefined);
});

test("non-Telegram errors are not retried", () => {
	assert.equal(decideRetry(new Error("socket hang up"), 1), undefined);
});

test("maxDelayMs caps the wait", () => {
	assert.deepEqual(
		decideRetry(new TelegramError("x", 429, "retry after 999"), 1, { maxDelayMs: 5000 }),
		{ retry: true, delayMs: 5000 },
	);
});

test("retryOnInternal:false skips 5xx", () => {
	assert.equal(
		decideRetry(new TelegramError("x", 503, "Service Unavailable"), 1, { retryOnInternal: false }),
		undefined,
	);
});

test("autoRetry can be installed as a bot plugin", () => {
	let hook: ErrorHook | undefined;
	const api = {
		onError: (h: ErrorHook) => {
			hook = h;
			return api as Api;
		},
	} as Api;

	autoRetry({ maxRetries: 1 })({ api } as never);

	assert.equal(typeof hook, "function");
});
