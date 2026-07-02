import assert from "node:assert/strict";
import test from "node:test";
import { Composer, Context, TelegramError } from "@yaebal/core";
import {
	callbackContext,
	callbackUpdate,
	channelPostUpdate,
	chatJoinRequestUpdate,
	chatMemberUpdate,
	chosenInlineResultUpdate,
	collectUpdates,
	createContext,
	createUpdate,
	editedMessageUpdate,
	findButton,
	inlineQueryUpdate,
	messageContext,
	messageUpdate,
	mockApi,
	myChatMemberUpdate,
	pollAnswerUpdate,
	pollUpdate,
	preCheckoutQueryUpdate,
	runMiddleware,
	shippingQueryUpdate,
	webhookRequest,
	withFetch,
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
					? new TelegramError("sendMessage", 429, "retry after 0")
					: { message_id: 1, echo: params?.text },
		},
	});

	api.onError((_m, _e, attempt) => (attempt <= 2 ? { retry: true } : undefined));

	const result = await api.sendMessage({ chat_id: 1, text: "hi" });
	assert.deepEqual(result, { message_id: 1, echo: "hi" });
});

test("mockApi.setResult overrides after creation; reset() clears calls and counters", async () => {
	const { api, calls, setResult, reset } = mockApi();

	await api.sendMessage({ chat_id: 1 });
	setResult("sendMessage", { message_id: 42 });
	assert.deepEqual(await api.sendMessage({ chat_id: 1 }), { message_id: 42 });
	assert.equal(calls.length, 2);

	reset();
	assert.equal(calls.length, 0);
	assert.deepEqual(await api.sendMessage({ chat_id: 1 }), { message_id: 42 });
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

test("channelPostUpdate / editedMessageUpdate build the right update key", () => {
	assert.equal(channelPostUpdate({ text: "hi" }).channel_post?.text, "hi");
	assert.equal(channelPostUpdate().channel_post?.chat.type, "channel");
	assert.equal(editedMessageUpdate({ text: "hi" }).edited_message?.text, "hi");
});

test("inlineQueryUpdate / chosenInlineResultUpdate build their payloads", () => {
	const iq = inlineQueryUpdate({ query: "cats", fromId: 5 });
	assert.equal(iq.inline_query?.query, "cats");
	assert.equal(iq.inline_query?.from.id, 5);

	const cir = chosenInlineResultUpdate({ resultId: "r1", query: "cats" });
	assert.equal(cir.chosen_inline_result?.result_id, "r1");
});

test("shippingQueryUpdate / preCheckoutQueryUpdate build valid payloads", () => {
	const sq = shippingQueryUpdate({ shippingAddress: { city: "Berlin" } });
	assert.equal(sq.shipping_query?.shipping_address.city, "Berlin");

	const pcq = preCheckoutQueryUpdate({ currency: "EUR", totalAmount: 500 });
	assert.equal(pcq.pre_checkout_query?.currency, "EUR");
	assert.equal(pcq.pre_checkout_query?.total_amount, 500);
});

test("pollUpdate / pollAnswerUpdate build valid payloads", () => {
	const poll = pollUpdate({ question: "?", options: ["a", "b", "c"] });
	assert.equal(poll.poll?.options.length, 3);
	assert.equal(poll.poll?.options[1]?.text, "b");

	const answer = pollAnswerUpdate({ optionIds: [1] });
	assert.deepEqual(answer.poll_answer?.option_ids, [1]);
});

test("myChatMemberUpdate / chatMemberUpdate / chatJoinRequestUpdate build valid payloads", () => {
	const my = myChatMemberUpdate({ oldStatus: "left", newStatus: "member" });
	assert.equal(my.my_chat_member?.old_chat_member.status, "left");
	assert.equal(my.my_chat_member?.new_chat_member.status, "member");

	const other = chatMemberUpdate({ userId: 7 });
	assert.equal(other.chat_member?.new_chat_member.user.id, 7);

	const join = chatJoinRequestUpdate({ chatId: 3, fromId: 4, bio: "hi" });
	assert.equal(join.chat_join_request?.chat.id, 3);
	assert.equal(join.chat_join_request?.bio, "hi");
});

test("messageContext / callbackContext build a Context in one call", () => {
	const ctx = messageContext({ text: "hi", chatId: 9 });
	assert.equal(ctx.text, "hi");
	assert.equal(ctx.chat?.id, 9);

	const cbCtx = callbackContext({ data: "x" });
	assert.equal(cbCtx.callbackQuery?.data, "x");
});

test("findButton locates a button by text and reports its position", () => {
	const markup = {
		inline_keyboard: [
			[{ text: "a", callback_data: "a" }],
			[
				{ text: "b", callback_data: "b" },
				{ text: "Next", callback_data: "page:2" },
			],
		],
	};

	const found = findButton(markup, "Next");
	assert.equal(found?.callback_data, "page:2");
	assert.equal(found?.row, 1);
	assert.equal(found?.col, 1);

	assert.equal(findButton(markup, /^n/i)?.text, "Next");
	assert.equal(findButton(markup, "missing"), undefined);
	assert.equal(findButton(undefined, "missing"), undefined);
});

test("collectUpdates records every update handed to the sink", async () => {
	const { sink, updates } = collectUpdates();

	await sink.handleUpdate(messageUpdate({ text: "one" }));
	await sink.handleUpdate(messageUpdate({ text: "two" }));

	assert.equal(updates.length, 2);
	assert.equal(updates[0]?.message?.text, "one");
});

test("webhookRequest builds a POST carrying the update as JSON, with an optional secret header", async () => {
	const update = messageUpdate({ text: "hi" });
	const req = webhookRequest(update, { secretToken: "s3cret" });

	assert.equal(req.method, "POST");
	assert.equal(req.headers.get("x-telegram-bot-api-secret-token"), "s3cret");
	assert.deepEqual(await req.json(), update);
});

test("withFetch stubs globalThis.fetch for the duration of fn, then restores it", async () => {
	const realFetch = globalThis.fetch;

	const result = await withFetch(
		async () => new Response("stubbed"),
		async () => {
			const res = await fetch("https://example.invalid/");
			return res.text();
		},
	);

	assert.equal(result, "stubbed");
	assert.equal(globalThis.fetch, realFetch);
});

test("withFetch restores the original fetch even if fn throws", async () => {
	const realFetch = globalThis.fetch;

	await assert.rejects(
		withFetch(
			async () => new Response("x"),
			() => {
				throw new Error("boom");
			},
		),
	);

	assert.equal(globalThis.fetch, realFetch);
});
