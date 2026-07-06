import assert from "node:assert/strict";
import test from "node:test";
import { media } from "@yaebal/core";
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

test("positional media: sendPhoto accepts a MediaSource, url string and the params object", () => {
	const { api, calls } = recorder();
	const ctx = new MessageContext(api, {
		update_id: 1,
		message: { message_id: 5, date: 0, chat: { id: 42, type: "private" } },
	} as never);

	const src = media.path("./cat.jpg");
	ctx.sendPhoto(src, { caption: "мяу" });
	assert.deepEqual(calls[0], { m: "sendPhoto", p: { chat_id: 42, photo: src, caption: "мяу" } });

	calls.length = 0;
	ctx.sendPhoto("https://cataas.com/cat");
	assert.deepEqual(calls[0], {
		m: "sendPhoto",
		p: { chat_id: 42, photo: "https://cataas.com/cat" },
	});

	calls.length = 0;
	ctx.sendDocument({ document: "file_id", caption: "raw form" });
	assert.deepEqual(calls[0], {
		m: "sendDocument",
		p: { chat_id: 42, document: "file_id", caption: "raw form" },
	});
});

test("positional forward/copy take the target chat id", () => {
	const { api, calls } = recorder();
	const ctx = new MessageContext(api, {
		update_id: 1,
		message: { message_id: 5, date: 0, chat: { id: 42, type: "private" } },
	} as never);

	ctx.forward(-100123);
	assert.deepEqual(calls[0], {
		m: "forwardMessage",
		p: { from_chat_id: 42, message_id: 5, chat_id: -100123 },
	});

	calls.length = 0;
	ctx.copy("@archive", { disable_notification: true });
	assert.deepEqual(calls[0], {
		m: "copyMessage",
		p: { from_chat_id: 42, message_id: 5, chat_id: "@archive", disable_notification: true },
	});
});

test("positional sendPoll maps string options, sendLocation takes lat/lon, sendDice takes emoji", () => {
	const { api, calls } = recorder();
	const ctx = new MessageContext(api, {
		update_id: 1,
		message: { message_id: 5, date: 0, chat: { id: 42, type: "private" } },
	} as never);

	ctx.sendPoll("tabs or spaces?", ["tabs", { text: "spaces" }], { is_anonymous: false });
	assert.deepEqual(calls[0], {
		m: "sendPoll",
		p: {
			chat_id: 42,
			question: "tabs or spaces?",
			options: [{ text: "tabs" }, { text: "spaces" }],
			is_anonymous: false,
		},
	});

	calls.length = 0;
	ctx.sendLocation(55.7558, 37.6173, { horizontal_accuracy: 50 });
	assert.deepEqual(calls[0], {
		m: "sendLocation",
		p: { chat_id: 42, latitude: 55.7558, longitude: 37.6173, horizontal_accuracy: 50 },
	});

	calls.length = 0;
	ctx.sendDice("🎰");
	assert.deepEqual(calls[0], { m: "sendDice", p: { chat_id: 42, emoji: "🎰" } });

	calls.length = 0;
	ctx.sendDice();
	assert.deepEqual(calls[0], { m: "sendDice", p: { chat_id: 42 } });
});

test("editReplyMarkup accepts a markup, a toJSON-able builder, or nothing (clears)", () => {
	const { api, calls } = recorder();
	const ctx = new CallbackQueryContext(api, {
		update_id: 1,
		callback_query: {
			id: "q",
			from: { id: 1, is_bot: false, first_name: "u" },
			message: { message_id: 5, date: 0, chat: { id: 42, type: "private" } },
		},
	} as never);

	const markup = { inline_keyboard: [[{ text: "a", callback_data: "a" }]] };
	ctx.editReplyMarkup(markup);
	assert.deepEqual(calls[0], {
		m: "editMessageReplyMarkup",
		p: { chat_id: 42, message_id: 5, reply_markup: markup },
	});

	calls.length = 0;
	const builder = { toJSON: () => markup }; // duck-typed @yaebal/keyboard builder
	ctx.editReplyMarkup(builder);
	assert.deepEqual(calls[0], {
		m: "editMessageReplyMarkup",
		p: { chat_id: 42, message_id: 5, reply_markup: builder },
	});

	calls.length = 0;
	ctx.editReplyMarkup();
	assert.deepEqual(calls[0], { m: "editMessageReplyMarkup", p: { chat_id: 42, message_id: 5 } });
});

test("sugar: typing sends a chat action with routing", () => {
	const { api, calls } = recorder();
	const ctx = new MessageContext(api, {
		update_id: 1,
		message: { message_id: 5, date: 0, chat: { id: 42, type: "private" }, message_thread_id: 9 },
	} as never);

	ctx.typing();
	assert.deepEqual(calls[0], {
		m: "sendChatAction",
		p: { chat_id: 42, action: "typing", message_thread_id: 9 },
	});

	calls.length = 0;
	ctx.typing("upload_photo");
	assert.equal((calls[0]?.p as { action: string }).action, "upload_photo");
});

test("sugar: quote replies with reply_parameters.quote", () => {
	const { api, calls } = recorder();
	const ctx = new MessageContext(api, {
		update_id: 1,
		message: { message_id: 5, date: 0, chat: { id: 42, type: "private" } },
	} as never);

	ctx.quote("договорились", "зафиксировал 🤝");
	assert.deepEqual(calls[0], {
		m: "sendMessage",
		p: {
			chat_id: 42,
			text: "зафиксировал 🤝",
			reply_parameters: { message_id: 5, quote: "договорились" },
		},
	});
});

test("sugar: moderation defaults the target to the sender", () => {
	const { api, calls } = recorder();
	const ctx = new MessageContext(api, {
		update_id: 1,
		message: {
			message_id: 5,
			date: 0,
			chat: { id: -100500, type: "supergroup" },
			from: { id: 7, is_bot: false, first_name: "spammer" },
		},
	} as never);

	ctx.ban();
	assert.deepEqual(calls[0], { m: "banChatMember", p: { chat_id: -100500, user_id: 7 } });

	calls.length = 0;
	ctx.ban(99, { revoke_messages: true });
	assert.deepEqual(calls[0], {
		m: "banChatMember",
		p: { chat_id: -100500, user_id: 99, revoke_messages: true },
	});

	calls.length = 0;
	ctx.unban();
	assert.deepEqual(calls[0], { m: "unbanChatMember", p: { chat_id: -100500, user_id: 7 } });

	calls.length = 0;
	ctx.restrict({ can_send_messages: false }, { user_id: 99 });
	assert.deepEqual(calls[0], {
		m: "restrictChatMember",
		p: { chat_id: -100500, user_id: 99, permissions: { can_send_messages: false } },
	});

	calls.length = 0;
	ctx.mute(60);
	const p = calls[0]?.p as unknown as {
		until_date: number;
		user_id: number;
		permissions: unknown;
	};
	assert.equal(p.user_id, 7);
	assert.deepEqual(p.permissions, { can_send_messages: false });
	assert.ok(p.until_date > Date.now() / 1000);

	// no `from` and no explicit id -> throw, not a silent bad api call
	const { api: api2 } = recorder();
	const noFrom = new MessageContext(api2, {
		update_id: 1,
		message: { message_id: 5, date: 0, chat: { id: -1, type: "supergroup" } },
	} as never);
	assert.throws(() => noFrom.ban(), /no target/);
});

test("sendGift fills only user_id; an explicit chat_id suppresses the sender fill", () => {
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

	// default: gift the sender — user_id only, never both ids (Telegram wants exactly one)
	ctx.sendGift({ gift_id: "g1" });
	assert.deepEqual(calls[0], { m: "sendGift", p: { user_id: 7, gift_id: "g1" } });

	// explicit chat target: the auto user_id fill backs off
	calls.length = 0;
	ctx.sendGift({ gift_id: "g1", chat_id: -100 });
	assert.deepEqual(calls[0], { m: "sendGift", p: { gift_id: "g1", chat_id: -100 } });
});

test("generated user_id fills fail loud without a sender, and accept an explicit override", () => {
	const { api, calls } = recorder();
	const noFrom = new MessageContext(api, {
		update_id: 1,
		message: { message_id: 5, date: 0, chat: { id: -1, type: "supergroup" } },
	} as never);

	// channel-style message without `from`: clear error instead of a silent 400
	assert.throws(() => noFrom.banChatMember({}), /banChatMember\(\): cannot fill `user_id`/);

	// the id stays passable — Omit<> no longer swallows it
	noFrom.banChatMember({ user_id: 99 });
	assert.deepEqual(calls[0], { m: "banChatMember", p: { chat_id: -1, user_id: 99 } });
});

test("callback send: requiredId guards chat_id when the message is gone, explicit chat_id works", () => {
	const { api, calls } = recorder();
	const noMessage = new CallbackQueryContext(api, {
		update_id: 1,
		callback_query: {
			id: "q1",
			from: { id: 7, is_bot: false, first_name: "u" },
			chat_instance: "ci",
			data: "d",
		},
	} as never);

	// a very old callback carries no message — fail loud, not `chat_id: undefined`
	assert.throws(() => noMessage.send({ text: "hi" }), /send\(\): cannot fill `chat_id`/);

	noMessage.send({ text: "hi", chat_id: 42 });
	assert.deepEqual(calls[0], { m: "sendMessage", p: { text: "hi", chat_id: 42 } });
});
