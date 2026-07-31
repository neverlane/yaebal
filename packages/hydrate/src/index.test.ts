import assert from "node:assert/strict";
import test from "node:test";
import { Bot, Composer, type Context, type Message } from "@yaebal/core";
import { createTestEnv } from "@yaebal/test";
import { type HydratedMessage, hydrate, hydrateApi, hydrateMessage } from "./index.js";

type Params = Record<string, unknown> | undefined;

/** a full Message stub (unlike the mock's default `{ message_id }`), so shape-detection hydrates it. */
function messageResult(chatId: number, messageId: number, extra: Partial<Message> = {}): Message {
	return {
		message_id: messageId,
		date: 0,
		chat: { id: chatId, type: "private" },
		...extra,
	} as Message;
}

/** an env whose `sendMessage` returns a real Message shape, with the after-hook installed. */
function hydratedEnv() {
	const env = createTestEnv(new Composer<Context>());
	hydrateApi(env.api);
	env.onApi("sendMessage", (p: Params) =>
		messageResult(Number(p?.chat_id), 100, { text: String(p?.text) }),
	);
	return env;
}

test("hydrateApi: a sent message comes back with methods bound to its own chat/id", async () => {
	const env = hydratedEnv();

	const msg = (await env.api.sendMessage({ chat_id: 55, text: "hi" })) as HydratedMessage;
	assert.equal(typeof msg.editText, "function");
	assert.equal(typeof msg.delete, "function");

	await msg.editText("bye");
	const call = env.lastApiCall("editMessageText");
	assert.deepEqual(call?.params, { chat_id: 55, message_id: 100, text: "bye" });
});

test("editCaption / editReplyMarkup issue the right calls", async () => {
	const env = hydratedEnv();
	const msg = (await env.api.sendMessage({ chat_id: 7, text: "hi" })) as HydratedMessage;

	await msg.editCaption("cap");
	assert.deepEqual(env.lastApiCall("editMessageCaption")?.params, {
		chat_id: 7,
		message_id: 100,
		caption: "cap",
	});

	await msg.editReplyMarkup({ inline_keyboard: [[{ text: "x", callback_data: "y" }]] });
	assert.deepEqual(env.lastApiCall("editMessageReplyMarkup")?.params, {
		chat_id: 7,
		message_id: 100,
		reply_markup: { inline_keyboard: [[{ text: "x", callback_data: "y" }]] },
	});
});

test("delete / pin / unpin target this message", async () => {
	const env = hydratedEnv();
	const msg = (await env.api.sendMessage({ chat_id: 9, text: "hi" })) as HydratedMessage;

	await msg.delete();
	assert.deepEqual(env.lastApiCall("deleteMessage")?.params, { chat_id: 9, message_id: 100 });

	await msg.pin({ disable_notification: true });
	assert.deepEqual(env.lastApiCall("pinChatMessage")?.params, {
		chat_id: 9,
		message_id: 100,
		disable_notification: true,
	});

	await msg.unpin();
	assert.deepEqual(env.lastApiCall("unpinChatMessage")?.params, { chat_id: 9, message_id: 100 });
});

test("forward carries from_chat_id; copy resolves to a MessageId (not hydrated)", async () => {
	const env = hydratedEnv();
	env.onApi("forwardMessage", (p: Params) => messageResult(Number(p?.chat_id), 200));

	const msg = (await env.api.sendMessage({ chat_id: 1, text: "hi" })) as HydratedMessage;

	const forwarded = await msg.forward(999);
	assert.deepEqual(env.lastApiCall("forwardMessage")?.params, {
		chat_id: 999,
		from_chat_id: 1,
		message_id: 100,
	});
	// the forwarded message is itself hydrated by the same after-hook.
	assert.equal(typeof forwarded.editText, "function");

	const copied = await msg.copy(999);
	assert.deepEqual(env.lastApiCall("copyMessage")?.params, {
		chat_id: 999,
		from_chat_id: 1,
		message_id: 100,
	});
	// copyMessage returns a MessageId (no chat) — deliberately not hydrated.
	assert.equal((copied as unknown as Record<string, unknown>).editText, undefined);
});

test("react wraps a bare emoji, passes a ReactionType through, and accepts arrays", async () => {
	const env = hydratedEnv();
	const msg = (await env.api.sendMessage({ chat_id: 3, text: "hi" })) as HydratedMessage;

	await msg.react("👍");
	assert.deepEqual(env.lastApiCall("setMessageReaction")?.params, {
		chat_id: 3,
		message_id: 100,
		reaction: [{ type: "emoji", emoji: "👍" }],
	});

	await msg.react([{ type: "custom_emoji", custom_emoji_id: "42" }, "🔥"]);
	assert.deepEqual(env.lastApiCall("setMessageReaction")?.params?.reaction, [
		{ type: "custom_emoji", custom_emoji_id: "42" },
		{ type: "emoji", emoji: "🔥" },
	]);
});

test("business_connection_id is threaded into edits and pins, not into delete", async () => {
	const env = createTestEnv(new Composer<Context>());
	hydrateApi(env.api);

	const msg = hydrateMessage(env.api, messageResult(5, 100, { business_connection_id: "bcon" }));

	await msg.editText("x");
	assert.equal(env.lastApiCall("editMessageText")?.params?.business_connection_id, "bcon");

	await msg.pin();
	assert.equal(env.lastApiCall("pinChatMessage")?.params?.business_connection_id, "bcon");

	await msg.delete();
	assert.equal(env.lastApiCall("deleteMessage")?.params?.business_connection_id, undefined);
});

test("sendMediaGroup: every message in the returned array is hydrated", async () => {
	const env = createTestEnv(new Composer<Context>());
	hydrateApi(env.api);
	env.onApi("sendMediaGroup", (p: Params) => [
		messageResult(Number(p?.chat_id), 10),
		messageResult(Number(p?.chat_id), 11),
	]);

	const group = (await env.api.sendMediaGroup({ chat_id: 8, media: [] })) as HydratedMessage[];
	assert.equal(group.length, 2);
	for (const m of group) assert.equal(typeof m.delete, "function");

	await group[1]?.delete();
	assert.deepEqual(env.lastApiCall("deleteMessage")?.params, { chat_id: 8, message_id: 11 });
});

test("hydrateMessage is idempotent and keeps methods out of JSON output", () => {
	const env = createTestEnv(new Composer<Context>());
	const raw = messageResult(1, 2, { text: "hi" });

	const once = hydrateMessage(env.api, raw);
	const twice = hydrateMessage(env.api, once);
	assert.equal(once, twice);
	assert.equal(once, raw); // hydrated in place, same reference

	assert.deepEqual(JSON.parse(JSON.stringify(once)), {
		message_id: 2,
		date: 0,
		chat: { id: 1, type: "private" },
		text: "hi",
	});
});

test("hydrateApi is idempotent — installing twice does not double-run the hook", async () => {
	const env = createTestEnv(new Composer<Context>());
	hydrateApi(env.api);
	hydrateApi(env.api);
	env.onApi("sendMessage", (p: Params) => messageResult(Number(p?.chat_id), 100));

	const msg = (await env.api.sendMessage({ chat_id: 1, text: "hi" })) as HydratedMessage;
	assert.equal(typeof msg.editText, "function");
});

test("ctx.hydrate: the callback query's message gains methods, routed through ctx.api", async () => {
	const bot = new Bot("TEST").install(hydrate()).on("callback_query", async (ctx) => {
		const message = ctx.callbackQuery?.message;
		if (!message) return;
		await ctx.hydrate(message).editText("edited");
	});

	const env = createTestEnv(bot);
	await env.createUser().click("data");

	const call = env.lastApiCall("editMessageText");
	assert.equal(call?.params?.text, "edited");
	assert.equal(typeof call?.params?.message_id, "number");
});
