import assert from "node:assert/strict";
import test from "node:test";
import type { Api, ErrorHook } from "@yaebal/core";
import { Composer, type Context, TelegramError } from "@yaebal/core";
import { apiError, createTestEnv } from "@yaebal/test";
import { autoRetry, decideRetry } from "./index.js";
import { againTestPack } from "./test-pack.js";

test("429 with retry_after waits exactly that long", () => {
	assert.deepEqual(
		decideRetry(new TelegramError("sendMessage", 429, "Too Many Requests", { retry_after: 7 }), 1),
		{ retry: true, delayMs: 7000, reason: "retry_after", retryAfterMs: 7000 },
	);
});

test("429 does not parse retry_after from the error text", () => {
	assert.deepEqual(
		decideRetry(new TelegramError("sendMessage", 429, "Too Many Requests: retry after 7"), 1),
		{ retry: true, delayMs: 2000, reason: "rate_limit_backoff", retryAfterMs: undefined },
	);
});

test("5xx retries with exponential backoff", () => {
	assert.deepEqual(decideRetry(new TelegramError("sendMessage", 502, "Bad Gateway"), 1), {
		retry: true,
		delayMs: 2000,
		reason: "internal",
	});
});

test("stops once attempts exceed maxRetries", () => {
	assert.equal(
		decideRetry(new TelegramError("sendMessage", 429, "Too Many Requests", { retry_after: 1 }), 4),
		undefined,
	);
});

test("4xx client errors are not retried", () => {
	assert.equal(decideRetry(new TelegramError("sendMessage", 400, "Bad Request"), 1), undefined);
});

test("non-Telegram errors are not retried", () => {
	assert.equal(decideRetry(new Error("socket hang up"), 1), undefined);
});

test("maxDelayMs caps the wait", () => {
	assert.deepEqual(
		decideRetry(new TelegramError("x", 429, "Too Many Requests", { retry_after: 999 }), 1, {
			maxDelayMs: 5000,
		}),
		{ retry: true, delayMs: 5000, reason: "retry_after", retryAfterMs: 999000 },
	);
});

test("onRetry observes retry decisions with method and params", async () => {
	const events: unknown[] = [];
	const api = {
		onError: (hook: ErrorHook) => {
			void hook(
				"sendMessage",
				new TelegramError("sendMessage", 429, "Too Many Requests", { retry_after: 1 }),
				1,
				{ chat_id: 1 },
			);
			return api as Api;
		},
	} as Api;

	autoRetry(api, { onRetry: (event) => events.push(event) });

	await new Promise((resolve) => setTimeout(resolve, 0));
	assert.equal((events[0] as { method?: string } | undefined)?.method, "sendMessage");
	assert.deepEqual((events[0] as { params?: unknown } | undefined)?.params, { chat_id: 1 });
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

test("againTestPack: a bot under test transparently retries a 429 and succeeds", async () => {
	const bot = new Composer<Context>().on("message:text", (ctx) => ctx.reply("pong"));
	const env = createTestEnv(bot, { packs: [againTestPack({ maxRetries: 2 })] });

	env.onApi("sendMessage", apiError(429, "Too Many Requests", { retry_after: 0 }), { times: 1 });

	await env.createUser().sendMessage("ping");

	assert.equal(env.callsTo("sendMessage").length, 2); // first attempt failed, second succeeded
	assert.equal(env.lastApiCall("sendMessage")?.params?.text, "pong");
});

test("againTestPack: exhausting maxRetries still throws", async () => {
	const bot = new Composer<Context>().on("message:text", async (ctx) => {
		await assert.rejects(ctx.reply("pong"), TelegramError);
	});
	const env = createTestEnv(bot, { packs: [againTestPack({ maxRetries: 1 })] });

	env.onApi("sendMessage", apiError(429, "Too Many Requests", { retry_after: 0 }));

	await env.createUser().sendMessage("ping");
	assert.equal(env.callsTo("sendMessage").length, 2); // 1 initial attempt + 1 retry, then gives up
});
