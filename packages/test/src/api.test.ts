import assert from "node:assert/strict";
import test from "node:test";
import { TelegramError } from "@yaebal/core";
import { apiError, isApiErrorSentinel, mockApi, TestApiError } from "./api.js";

test("mockApi records calls and resolves sensible defaults", async () => {
	const { api, calls } = mockApi();

	const sent = await api.sendMessage({ chat_id: 1, text: "hi" });
	assert.deepEqual(sent, { message_id: 1 });

	const answered = await api.answerCallbackQuery({ callback_query_id: "1" });
	assert.equal(answered, true);

	const viaCall = await api.call("setMyCommands", { commands: [] });
	assert.deepEqual(viaCall, {});

	assert.equal(calls.length, 3);
	assert.equal(calls[0]?.method, "sendMessage");
	assert.deepEqual(calls[0]?.params, { chat_id: 1, text: "hi" });
	assert.deepEqual(calls[0]?.result, { message_id: 1 });
	assert.equal(typeof calls[0]?.at, "number");
});

test("mockApi hook registrars are chainable", () => {
	const { api } = mockApi();
	assert.equal(
		api.before(() => undefined),
		api,
	);
	assert.equal(
		api.after((_m, _p, r) => r),
		api,
	);
});

test("mockApi auto-increments message_id across send* calls", async () => {
	const { api } = mockApi();

	const first = await api.sendMessage({ chat_id: 1, text: "a" });
	const second = await api.sendMessage({ chat_id: 1, text: "b" });

	assert.deepEqual(first, { message_id: 1 });
	assert.deepEqual(second, { message_id: 2 });
});

test("mockApi results: static override replaces the built-in default", async () => {
	const { api } = mockApi({ results: { sendMessage: { message_id: 99 } } });

	assert.deepEqual(await api.sendMessage({ chat_id: 1 }), { message_id: 99 });
});

test("mockApi results: an Error value makes the call throw", async () => {
	const { api } = mockApi({
		results: { sendMessage: new TelegramError("sendMessage", 400, "Bad Request") },
	});

	await assert.rejects(api.sendMessage({ chat_id: 1 }), TelegramError);
});

test("mockApi results: a function sees params and a running attempt count", async () => {
	const { api } = mockApi({
		results: {
			sendMessage: (params: Record<string, unknown> | undefined, attempt: number) =>
				attempt <= 2
					? new TelegramError("sendMessage", 429, "Too Many Requests", { retry_after: 0 })
					: { message_id: 1, echo: params?.text },
		},
	});

	api.onError((_m, _e, attempt) => (attempt <= 2 ? { retry: true } : undefined));

	const result = await api.sendMessage({ chat_id: 1, text: "hi" });
	assert.deepEqual(result, { message_id: 1, echo: "hi" });
});

test("onApi sets a permanent override; reset() clears calls and counters but keeps it", async () => {
	const { api, calls, onApi, reset } = mockApi();

	await api.sendMessage({ chat_id: 1 });
	onApi("sendMessage", { message_id: 42 });
	assert.deepEqual(await api.sendMessage({ chat_id: 1 }), { message_id: 42 });
	assert.equal(calls.length, 2);

	reset();
	assert.equal(calls.length, 0);
	assert.deepEqual(await api.sendMessage({ chat_id: 1 }), { message_id: 42 });
});

test("onApi with { times } is one-shot, then falls back to the previous permanent reply", async () => {
	const { api, onApi } = mockApi({ results: { sendMessage: { message_id: 1 } } });

	onApi("sendMessage", apiError(429, "Too Many Requests"), { times: 1 });

	await assert.rejects(api.sendMessage({ chat_id: 1 }), TestApiError);
	assert.deepEqual(await api.sendMessage({ chat_id: 1 }), { message_id: 1 });
});

test("onApi { times: 2 } is consumed over exactly two calls", async () => {
	const { api, onApi } = mockApi();

	onApi("getChat", { id: 1, type: "private", stale: true }, { times: 2 });
	onApi("getChat", { id: 1, type: "private", stale: false });

	assert.equal((await api.call<{ stale: boolean }>("getChat")).stale, true);
	assert.equal((await api.call<{ stale: boolean }>("getChat")).stale, true);
	assert.equal((await api.call<{ stale: boolean }>("getChat")).stale, false);
});

test("offApi drops a method's override, or every override with no argument", async () => {
	const { api, onApi, offApi } = mockApi();

	onApi("sendMessage", { message_id: 99 });
	offApi("sendMessage");
	assert.deepEqual(await api.sendMessage({ chat_id: 1 }), { message_id: 1 });

	onApi("getMe", { id: 7, is_bot: true, first_name: "x" });
	offApi();
	assert.deepEqual(await api.getMe(), { id: 1, is_bot: true, first_name: "bot", username: "bot" });
});

test("apiError() produces a sentinel that throws a TestApiError carrying parameters", async () => {
	const sentinel = apiError(429, "Too Many Requests", { retry_after: 30 });
	assert.ok(isApiErrorSentinel(sentinel));

	const { api } = mockApi({ results: { sendMessage: sentinel } });

	await assert.rejects(api.sendMessage({ chat_id: 1 }), (error: unknown) => {
		assert.ok(error instanceof TestApiError);
		assert.ok(error instanceof TelegramError);
		assert.equal(error.code, 429);
		assert.deepEqual(error.parameters, { retry_after: 30 });
		return true;
	});
});

test("strictApi throws for methods with no builtin default and no override", async () => {
	const { api } = mockApi({ strictApi: true });

	await assert.rejects(api.call("getChatMember"), /no stub for "getChatMember"/);
	assert.deepEqual(await api.sendMessage({ chat_id: 1 }), { message_id: 1 });
});

test("mockApi.lastCall and callsTo filter recorded calls", async () => {
	const { api, lastCall, callsTo } = mockApi();

	await api.sendMessage({ chat_id: 1, text: "a" });
	await api.answerCallbackQuery({ callback_query_id: "1" });
	await api.sendMessage({ chat_id: 1, text: "b" });

	assert.equal(lastCall()?.method, "sendMessage");
	assert.equal(lastCall("answerCallbackQuery")?.method, "answerCallbackQuery");
	assert.equal(lastCall("sendMessage")?.params?.text, "b");
	assert.equal(callsTo("sendMessage").length, 2);
});

test("mockApi hooks actually run: before rewrites params, after rewrites result", async () => {
	const { api } = mockApi();

	api.before((_method, params) => ({ ...params, injected: true }));
	api.after((_method, _params, result) => ({ ...(result as object), tagged: true }));

	const result = await api.sendMessage({ chat_id: 1 });

	assert.deepEqual(result, { message_id: 1, tagged: true });
});

test("reply_markup builder instances are normalized to plain JSON on recorded calls", async () => {
	const { api, calls } = mockApi();

	await api.sendMessage({
		chat_id: 1,
		text: "hi",
		reply_markup: { toJSON: () => ({ inline_keyboard: [[{ text: "ok", callback_data: "ok" }]] }) },
	});

	assert.deepEqual(calls[0]?.params?.reply_markup, {
		inline_keyboard: [[{ text: "ok", callback_data: "ok" }]],
	});
});
