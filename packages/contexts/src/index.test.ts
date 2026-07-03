import assert from "node:assert/strict";
import test from "node:test";
import {
	BusinessConnectionContext,
	BusinessMessageContext,
	CallbackQueryContext,
	ChannelPostContext,
	contextFor,
	GuestMessageContext,
	MessageContext,
	ShippingQueryContext,
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

test("guest message answer fills guest_query_id and accepts a bare result", () => {
	const { api, calls } = recorder();
	const ctx = new GuestMessageContext(api, {
		update_id: 1,
		guest_message: {
			message_id: 5,
			date: 0,
			chat: { id: 42, type: "private" },
			guest_query_id: "gq1",
		},
	} as never);
	assert.equal(ctx.guest_query_id, "gq1");

	ctx.answer({
		type: "article",
		id: "1",
		title: "hi",
		input_message_content: { message_text: "hi" },
	});
	assert.deepEqual(calls[0], {
		m: "answerGuestQuery",
		p: {
			guest_query_id: "gq1",
			result: {
				type: "article",
				id: "1",
				title: "hi",
				input_message_content: { message_text: "hi" },
			},
		},
	});
});

test("business message: send/reply/edit thread business_connection_id", () => {
	const { api, calls } = recorder();
	const ctx = new BusinessMessageContext(api, {
		update_id: 1,
		business_message: {
			message_id: 5,
			date: 0,
			chat: { id: 42, type: "private" },
			business_connection_id: "bc1",
		},
	} as never);
	assert.equal(ctx.businessConnectionId, "bc1");

	ctx.reply("yo"); // sugar path
	assert.deepEqual(calls[0], {
		m: "sendMessage",
		p: {
			chat_id: 42,
			reply_parameters: { message_id: 5 },
			business_connection_id: "bc1",
			text: "yo",
		},
	});

	calls.length = 0;
	ctx.editText("edited"); // sugar path
	assert.deepEqual(calls[0], {
		m: "editMessageText",
		p: { chat_id: 42, message_id: 5, business_connection_id: "bc1", text: "edited" },
	});

	calls.length = 0;
	ctx.delete(); // deleteMessage can't touch business chats → routed via deleteBusinessMessages
	assert.deepEqual(calls[0], {
		m: "deleteBusinessMessages",
		p: { business_connection_id: "bc1", message_ids: [5] },
	});

	calls.length = 0;
	ctx.readBusinessMessage(); // generated path, all three ids filled
	assert.deepEqual(calls[0], {
		m: "readBusinessMessage",
		p: { business_connection_id: "bc1", chat_id: 42, message_id: 5 },
	});
});

test("business connection context gets account-level shortcuts", () => {
	const { api, calls } = recorder();
	const ctx = new BusinessConnectionContext(api, {
		update_id: 1,
		business_connection: {
			id: "bc1",
			user: { id: 7, is_bot: false, first_name: "u" },
			user_chat_id: 7,
			date: 0,
			is_enabled: true,
		},
	} as never);

	ctx.setBusinessAccountName({ first_name: "Shop" });
	assert.deepEqual(calls[0], {
		m: "setBusinessAccountName",
		p: { business_connection_id: "bc1", first_name: "Shop" },
	});

	calls.length = 0;
	ctx.getBusinessConnection();
	assert.deepEqual(calls[0], {
		m: "getBusinessConnection",
		p: { business_connection_id: "bc1" },
	});
});

test("callback query on a business message threads business_connection_id", () => {
	const { api, calls } = recorder();
	const ctx = new CallbackQueryContext(api, {
		update_id: 1,
		callback_query: {
			id: "q1",
			from: { id: 7, is_bot: false, first_name: "u" },
			message: {
				message_id: 5,
				date: 0,
				chat: { id: 42, type: "private" },
				business_connection_id: "bc1",
			},
			data: "x",
		},
	} as never);

	ctx.editText("edited");
	assert.deepEqual(calls[0], {
		m: "editMessageText",
		p: { business_connection_id: "bc1", chat_id: 42, message_id: 5, text: "edited" },
	});
});

test("message in a forum topic: send/reply stay in it, editText/react don't carry it", () => {
	const { api, calls } = recorder();
	const ctx = new MessageContext(api, {
		update_id: 1,
		message: {
			message_id: 5,
			date: 0,
			chat: { id: 42, type: "supergroup" },
			is_topic_message: true,
			message_thread_id: 9,
		},
	} as never);
	assert.equal(ctx.messageThreadId, 9);

	ctx.reply("yo"); // sugar path
	assert.deepEqual(calls[0], {
		m: "sendMessage",
		p: { chat_id: 42, reply_parameters: { message_id: 5 }, message_thread_id: 9, text: "yo" },
	});

	calls.length = 0;
	ctx.send("hi"); // sugar path
	assert.deepEqual(calls[0], {
		m: "sendMessage",
		p: { chat_id: 42, message_thread_id: 9, text: "hi" },
	});

	// editMessageText/setMessageReaction don't accept message_thread_id — must stay clean.
	calls.length = 0;
	ctx.editText("edited");
	assert.deepEqual(calls[0], {
		m: "editMessageText",
		p: { chat_id: 42, message_id: 5, text: "edited" },
	});

	calls.length = 0;
	ctx.react("🔥");
	assert.deepEqual(calls[0], {
		m: "setMessageReaction",
		p: { chat_id: 42, message_id: 5, reaction: [{ type: "emoji", emoji: "🔥" }] },
	});

	// closeForumTopic targets the topic this message is in — generated (non-sugar) path.
	calls.length = 0;
	ctx.closeForumTopic();
	assert.deepEqual(calls[0], {
		m: "closeForumTopic",
		p: { chat_id: 42, message_thread_id: 9 },
	});
});

test("message in a channel direct-messages topic: send/reply fill direct_messages_topic_id", () => {
	const { api, calls } = recorder();
	const ctx = new MessageContext(api, {
		update_id: 1,
		message: {
			message_id: 5,
			date: 0,
			chat: { id: 42, type: "private" },
			direct_messages_topic: { topic_id: 3, user: { id: 7, is_bot: false, first_name: "u" } },
		},
	} as never);

	ctx.send("hi");
	assert.deepEqual(calls[0], {
		m: "sendMessage",
		p: { chat_id: 42, direct_messages_topic_id: 3, text: "hi" },
	});
});

test("callback query on a forum-topic message threads message_thread_id into send", () => {
	const { api, calls } = recorder();
	const ctx = new CallbackQueryContext(api, {
		update_id: 1,
		callback_query: {
			id: "q1",
			from: { id: 7, is_bot: false, first_name: "u" },
			message: {
				message_id: 5,
				date: 0,
				chat: { id: 42, type: "supergroup" },
				message_thread_id: 9,
			},
			data: "x",
		},
	} as never);

	ctx.send({ text: "hi" });
	assert.deepEqual(calls[0], {
		m: "sendMessage",
		p: { chat_id: 42, message_thread_id: 9, text: "hi" },
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
