import assert from "node:assert/strict";
import test from "node:test";
import { Composer, Context } from "@yaebal/core";
import {
	callbackUpdate,
	createContext,
	createUpdate,
	messageUpdate,
	mockApi,
	runMiddleware,
} from "./index.js";

test("mockApi records calls and resolves sensible defaults", async () => {
	const { api, calls } = mockApi();

	const sent = await api.sendMessage({ chat_id: 1, text: "hi" });
	assert.deepEqual(sent, { message_id: 1 });

	const answered = await api.answerCallbackQuery({ callback_query_id: "1" });
	assert.equal(answered, true);

	const viaCall = await api.call("setMyCommands", { commands: [] });
	assert.deepEqual(viaCall, {});

	assert.deepEqual(calls, [
		{ method: "sendMessage", params: { chat_id: 1, text: "hi" } },
		{ method: "answerCallbackQuery", params: { callback_query_id: "1" } },
		{ method: "setMyCommands", params: { commands: [] } },
	]);
});

test("mockApi hook registrars are chainable no-ops", () => {
	const { api } = mockApi();
	assert.equal(
		api.before(() => undefined),
		api,
	);
	assert.equal(
		api.after((_m, r) => r),
		api,
	);
});

test("messageUpdate produces a valid message update", () => {
	const update = messageUpdate({ text: "hello", chatId: 42, chatType: "group" });

	assert.ok(update.update_id > 0);

	assert.equal(update.message?.text, "hello");
	assert.equal(update.message?.chat.id, 42);
	assert.equal(update.message?.chat.type, "group");
	assert.equal(update.message?.from?.id, 42);
});

test("callbackUpdate produces a valid callback_query update", () => {
	const update = callbackUpdate({ data: "click", chatId: 7, fromId: 9 });

	assert.equal(update.callback_query?.data, "click");
	assert.equal(update.callback_query?.from.id, 9);
	assert.equal(update.callback_query?.message?.chat.id, 7);
});

test("createUpdate fills a fresh update_id", () => {
	const a = createUpdate();
	const b = createUpdate();

	assert.notEqual(a.update_id, b.update_id);
});

test("createContext yields a Context whose getters work", () => {
	const ctx = createContext(messageUpdate({ text: "yo", chatId: 5 }));

	assert.ok(ctx instanceof Context);

	assert.equal(ctx.updateType, "message");
	assert.equal(ctx.text, "yo");
	assert.equal(ctx.chat?.id, 5);
});

test("createContext detects callback_query updates", () => {
	const ctx = createContext(callbackUpdate({ data: "x" }));

	assert.equal(ctx.updateType, "callback_query");
	assert.equal(ctx.callbackQuery?.data, "x");
});

test("a handler calling ctx.reply records a sendMessage call", async () => {
	const { api, calls } = mockApi();

	const composer = new Composer().on("message:text", (ctx) => ctx.reply("pong"));
	await runMiddleware(composer, createContext(messageUpdate({ text: "ping", chatId: 3 }), api));

	assert.equal(calls.length, 1);

	const call = calls[0];
	assert.equal(call?.method, "sendMessage");
	assert.equal(call?.params?.chat_id, 3);
	assert.equal(call?.params?.text, "pong");

	assert.deepEqual(call?.params?.reply_parameters, { message_id: 1 });
});
