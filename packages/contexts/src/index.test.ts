import assert from "node:assert/strict";
import test from "node:test";
import {
	CallbackQueryContext,
	ChannelPostContext,
	MessageContext,
	ShippingQueryContext,
	contextFor,
} from "./index.js";

interface Call {
	m: string;
	// biome-ignore lint/suspicious/noExplicitAny: test recorder
	p: any;
}
const recorder = () => {
	const calls: Call[] = [];
	const api = {
		call: (m: string, p: unknown) => {
			calls.push({ m, p });
			return Promise.resolve({});
		},
	} as never;
	return { api, calls };
};

test("MessageContext merges payload fields onto the context", () => {
	const { api } = recorder();
	const ctx = new MessageContext(api, {
		update_id: 1,
		message: {
			message_id: 5,
			date: 0,
			chat: { id: 42, type: "private" },
			from: { id: 7, is_bot: false, first_name: "u" },
			text: "hi",
		},
	} as never);
	assert.equal(ctx.text, "hi");
	assert.equal(ctx.message_id, 5);
	assert.equal(ctx.chat.id, 42);
});

test("auto-generated reply/delete fill chat_id + message_id", () => {
	const { api, calls } = recorder();
	const ctx = new MessageContext(api, {
		update_id: 1,
		message: { message_id: 5, date: 0, chat: { id: 42, type: "private" } },
	} as never);

	ctx.reply({ text: "yo" });
	assert.deepEqual(calls[0], {
		m: "sendMessage",
		p: { chat_id: 42, reply_parameters: { message_id: 5 }, text: "yo" },
	});

	calls.length = 0;
	ctx.delete();
	assert.deepEqual(calls[0], { m: "deleteMessage", p: { chat_id: 42, message_id: 5 } });

	calls.length = 0;
	ctx.send({ text: "hello" }); // send (no reply_parameters)
	assert.deepEqual(calls[0], { m: "sendMessage", p: { chat_id: 42, text: "hello" } });
});

test("sugar: positional send/reply build the params object", () => {
	const { api, calls } = recorder();
	const ctx = new MessageContext(api, {
		update_id: 1,
		message: { message_id: 5, date: 0, chat: { id: 42, type: "private" } },
	} as never);

	ctx.send("hi", { parse_mode: "HTML" });
	assert.deepEqual(calls[0], {
		m: "sendMessage",
		p: { chat_id: 42, text: "hi", parse_mode: "HTML" },
	});

	calls.length = 0;
	ctx.reply("yo");
	assert.deepEqual(calls[0], {
		m: "sendMessage",
		p: { chat_id: 42, reply_parameters: { message_id: 5 }, text: "yo" },
	});

	calls.length = 0;
	ctx.react("🔥");
	assert.deepEqual(calls[0], {
		m: "setMessageReaction",
		p: { chat_id: 42, message_id: 5, reaction: [{ type: "emoji", emoji: "🔥" }] },
	});

	calls.length = 0;
	ctx.editText("edited");
	assert.deepEqual(calls[0], {
		m: "editMessageText",
		p: { chat_id: 42, message_id: 5, text: "edited" },
	});
});

test("sugar: react accepts custom emoji, shorthand objects and arrays", () => {
	const { api, calls } = recorder();
	const ctx = new MessageContext(api, {
		update_id: 1,
		message: { message_id: 5, date: 0, chat: { id: 42, type: "private" } },
	} as never);
	const reactionOf = () => (calls[0]?.p as { reaction: unknown[] }).reaction;

	ctx.react("🔥", "12345"); // emoji + custom emoji id
	assert.deepEqual(reactionOf(), [{ type: "custom_emoji", custom_emoji_id: "12345" }]);

	calls.length = 0;
	ctx.react({ custom_emoji_id: "999" }); // shorthand custom object
	assert.deepEqual(reactionOf(), [{ type: "custom_emoji", custom_emoji_id: "999" }]);

	calls.length = 0;
	ctx.react({ emoji: "🎉" }); // shorthand emoji object
	assert.deepEqual(reactionOf(), [{ type: "emoji", emoji: "🎉" }]);

	calls.length = 0;
	ctx.react([{ emoji: "👍" }, { custom_emoji_id: "1" }], { is_big: true }); // array + extra
	assert.deepEqual(calls[0], {
		m: "setMessageReaction",
		p: {
			chat_id: 42,
			message_id: 5,
			reaction: [
				{ type: "emoji", emoji: "👍" },
				{ type: "custom_emoji", custom_emoji_id: "1" },
			],
			is_big: true,
		},
	});
});

test("sugar: convenience getters + react() clears reactions", () => {
	const { api, calls } = recorder();
	const ctx = new MessageContext(api, {
		update_id: 1,
		message: {
			message_id: 5,
			date: 0,
			chat: { id: 42, type: "private" },
			from: { id: 7, is_bot: false, first_name: "u" },
		},
	} as never);
	assert.equal(ctx.chatId, 42);
	assert.equal(ctx.senderId, 7);

	ctx.react(); // no args → clear
	assert.deepEqual(calls[0], {
		m: "setMessageReaction",
		p: { chat_id: 42, message_id: 5, reaction: [] },
	});
});

test("sugar: callback answer accepts a bare string and no args", () => {
	const { api, calls } = recorder();
	const ctx = new CallbackQueryContext(api, {
		update_id: 1,
		callback_query: { id: "q1", from: { id: 7, is_bot: false, first_name: "u" }, data: "x" },
	} as never);

	ctx.answer("done");
	assert.deepEqual(calls[0], {
		m: "answerCallbackQuery",
		p: { callback_query_id: "q1", text: "done" },
	});

	calls.length = 0;
	ctx.answer();
	assert.deepEqual(calls[0], { m: "answerCallbackQuery", p: { callback_query_id: "q1" } });
});

test("CallbackQueryContext.answer fills callback_query_id", () => {
	const { api, calls } = recorder();
	const ctx = new CallbackQueryContext(api, {
		update_id: 1,
		callback_query: {
			id: "q1",
			from: { id: 7, is_bot: false, first_name: "u" },
			message: { message_id: 5, date: 0, chat: { id: 42, type: "private" } },
			data: "x",
		},
	} as never);

	assert.equal(ctx.data, "x");
	ctx.answer({ text: "ok" });
	assert.deepEqual(calls[0], {
		m: "answerCallbackQuery",
		p: { callback_query_id: "q1", text: "ok" },
	});
});

test("shared message mixin applies to other message-based contexts", () => {
	const { api, calls } = recorder();
	const ctx = new ChannelPostContext(api, {
		update_id: 1,
		channel_post: { message_id: 9, date: 0, chat: { id: -100, type: "channel" } },
	} as never);
	assert.equal(ctx.chatId, -100);

	ctx.react("👍");
	assert.deepEqual(calls[0], {
		m: "setMessageReaction",
		p: { chat_id: -100, message_id: 9, reaction: [{ type: "emoji", emoji: "👍" }] },
	});

	calls.length = 0;
	ctx.send("hi");
	assert.deepEqual(calls[0], { m: "sendMessage", p: { chat_id: -100, text: "hi" } });
});

test("shipping query answer takes a positional ok", () => {
	const { api, calls } = recorder();
	const ctx = new ShippingQueryContext(api, {
		update_id: 1,
		shipping_query: { id: "sq1", from: { id: 7, is_bot: false, first_name: "u" } },
	} as never);
	assert.equal(ctx.senderId, 7);

	ctx.answer(true);
	assert.deepEqual(calls[0], {
		m: "answerShippingQuery",
		p: { shipping_query_id: "sq1", ok: true },
	});
});

test("contextFor builds the right class per update type", () => {
	const { api } = recorder();
	const m = contextFor("message", api, {
		update_id: 1,
		message: { message_id: 1, date: 0, chat: { id: 1, type: "private" } },
	} as never);
	assert.ok(m instanceof MessageContext);
	const c = contextFor("callback_query", api, {
		update_id: 1,
		callback_query: { id: "q", from: { id: 1, is_bot: false, first_name: "u" } },
	} as never);
	assert.ok(c instanceof CallbackQueryContext);
});
