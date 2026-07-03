import assert from "node:assert/strict";
import test from "node:test";
import type { Api, BeforeHook, ErrorHook } from "@yaebal/core";
import { TelegramError } from "@yaebal/core";
import {
	createThrottleHandle,
	memoryThrottleStorage,
	reserve,
	ThrottleAbortError,
	throttle,
	withThrottle,
} from "./index.js";

test("reserve runs the first call immediately", () => {
	assert.deepEqual(reserve(1000, 0, 34), { at: 1000, next: 1034 });
});

test("reserve spaces rapid calls by the interval", () => {
	assert.deepEqual(reserve(1000, 1034, 34), { at: 1034, next: 1068 });
	assert.deepEqual(reserve(1034, 1068, 34), { at: 1068, next: 1102 });
});

test("reserve respects real elapsed time (no artificial wait)", () => {
	assert.deepEqual(reserve(2000, 1068, 34), { at: 2000, next: 2034 });
});

test("throttle registers a before hook that resolves", async () => {
	let hook: BeforeHook | undefined;

	const api = {
		before: (h: BeforeHook) => {
			hook = h;
			return api as Api;
		},
		onError: () => api as Api,
	} as unknown as Api;

	throttle(api, { minIntervalMs: 0 });
	assert.equal(typeof hook, "function");

	await hook?.("sendMessage", undefined); // interval 0 → no delay
});

test("throttle can be installed as a bot plugin", () => {
	let hook: BeforeHook | undefined;
	const api = {
		before: (h: BeforeHook) => {
			hook = h;
			return api as Api;
		},
		onError: () => api as Api,
	} as unknown as Api;

	throttle({ minIntervalMs: 0 })({ api } as never);

	assert.equal(typeof hook, "function");
});

test("priority queue drains higher-priority jobs first", async () => {
	const acquired: string[] = [];
	const handle = createThrottleHandle({
		global: { limit: 1, windowMs: 8 },
		privateChat: false,
		group: false,
		onEvent: (event) => {
			if (event.type === "acquired") acquired.push(event.request.method);
		},
	});

	const low = handle.acquire("low", undefined, { priority: 0 });
	const high = handle.acquire("high", undefined, { priority: 10 });

	await Promise.all([low, high]);
	assert.deepEqual(acquired, ["high", "low"]);
});

test("private-chat buckets delay only the same chat", async () => {
	const handle = createThrottleHandle({
		global: false,
		privateChat: { limit: 1, windowMs: 12 },
		group: false,
	});

	await handle.acquire("sendMessage", { chat_id: 1 });
	const start = Date.now();
	await handle.acquire("sendMessage", { chat_id: 1 });

	assert.ok(Date.now() - start >= 6);
});

test("group buckets use negative chat ids", async () => {
	let buckets: readonly string[] = [];
	const handle = createThrottleHandle({
		global: false,
		privateChat: false,
		group: { limit: 20, windowMs: 60_000 },
		onEvent: (event) => {
			if (event.type === "queued") buckets = event.request.buckets;
		},
	});

	await handle.acquire("sendMessage", { chat_id: -100 });
	assert.deepEqual(buckets, ["group:-100"]);
});

test("priority-only perMethod entries keep the shared chat bucket", async () => {
	let buckets: readonly string[] = [];
	const handle = createThrottleHandle({
		global: false,
		privateChat: { limit: 1, windowMs: 1_000 },
		group: false,
		perMethod: { sendMessage: { priority: 10 } },
		onEvent: (event) => {
			if (event.type === "queued") buckets = event.request.buckets;
		},
	});

	await handle.acquire("sendMessage", { chat_id: 1 });
	assert.deepEqual(buckets, ["private:1"]);
});

test("per-method private limits use isolated method buckets", async () => {
	let buckets: readonly string[] = [];
	const handle = createThrottleHandle({
		global: false,
		privateChat: { limit: 10, windowMs: 1_000 },
		group: false,
		perMethod: { sendVideo: { privateChat: { limit: 1, windowMs: 5_000 } } },
		onEvent: (event) => {
			if (event.type === "queued") buckets = event.request.buckets;
		},
	});

	await handle.acquire("sendVideo", { chat_id: 1 });
	assert.deepEqual(buckets, ["method:sendVideo:private:1"]);
});

test("shared storage coordinates separate handles", async () => {
	const storage = memoryThrottleStorage();
	const first = createThrottleHandle({
		storage,
		global: { limit: 1, windowMs: 12 },
		privateChat: false,
		group: false,
	});
	const second = createThrottleHandle({
		storage,
		global: { limit: 1, windowMs: 12 },
		privateChat: false,
		group: false,
	});

	await first.acquire("sendMessage");
	const start = Date.now();
	await second.acquire("sendMessage");

	assert.ok(Date.now() - start >= 6);
});

test("queued requests can be aborted", async () => {
	const handle = createThrottleHandle({
		global: { limit: 1, windowMs: 30 },
		privateChat: false,
		group: false,
	});
	const controller = new AbortController();

	await handle.acquire("first");
	const queued = handle.acquire("second", undefined, { signal: controller.signal });
	controller.abort(new ThrottleAbortError("second", 2));

	await assert.rejects(queued, ThrottleAbortError);
	assert.equal(handle.metrics.cancelled, 1);
});

test("retry_after feedback freezes the matching buckets", async () => {
	const handle = createThrottleHandle({
		global: false,
		privateChat: { limit: 10, windowMs: 100 },
		group: false,
	});

	await handle.noteRetryAfter("sendMessage", { chat_id: 1 }, 12);
	const start = Date.now();
	await handle.acquire("sendMessage", { chat_id: 1 });

	assert.ok(Date.now() - start >= 6);
	assert.equal(handle.metrics.retryAfterLearned, 1);
});

test("withThrottle attaches per-request priority without serializing a string key", () => {
	const params = withThrottle({ chat_id: 1, text: "hi" }, { priority: 5 });

	assert.deepEqual(Object.keys(params), ["chat_id", "text"]);
});

test("installed throttle observes Telegram retry_after errors", async () => {
	let before: BeforeHook | undefined;
	let onError: ErrorHook | undefined;
	const api = {
		before: (hook: BeforeHook) => {
			before = hook;
			return api as Api;
		},
		onError: (hook: ErrorHook) => {
			onError = hook;
			return api as Api;
		},
	} as Api;

	throttle(api, { global: false, privateChat: { limit: 10, windowMs: 100 }, group: false });
	await onError?.(
		"sendMessage",
		new TelegramError("sendMessage", 429, "Too Many Requests", { retry_after: 0.012 }),
		1,
		{ chat_id: 1 },
	);

	const start = Date.now();
	await before?.("sendMessage", { chat_id: 1 });

	assert.ok(Date.now() - start >= 6);
});
