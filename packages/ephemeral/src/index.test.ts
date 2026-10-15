import assert from "node:assert/strict";
import test from "node:test";
import { Composer, type Context } from "@yaebal/core";
import { apiError, createTestEnv } from "@yaebal/test";
import {
	type EphemeralMessage,
	type EphemeralOptions,
	ephemeral,
	isExpiredEphemeralError,
	supportsEphemeral,
	wrapEphemeralMessage,
} from "./index.js";

const GONE = apiError(400, "Bad Request: ephemeral message not found");

/** a bot whose /go replies ephemerally and hands the resulting handle (or error) out. */
function setup(options?: EphemeralOptions) {
	let handle: EphemeralMessage | undefined;
	let failure: unknown;

	const bot = new Composer<Context>().install(ephemeral(options)).command("go", async (ctx) => {
		try {
			handle = await ctx.replyEphemeral("hello");
		} catch (error) {
			failure = error;
		}
	});

	const env = createTestEnv(bot);
	// telegram answers an ephemeral send with message_id 0 and a real ephemeral_message_id;
	// the auto-stub knows nothing about that, so teach it. plain sends keep a plain shape.
	let nextEphemeralId = 900;
	env.onApi("sendMessage", (params: Record<string, unknown> | undefined) =>
		params?.ephemeral_message_parameters === undefined
			? { message_id: 42 }
			: { message_id: 0, ephemeral_message_id: nextEphemeralId++ },
	);

	return {
		env,
		handle: () => {
			assert.ok(handle, "expected replyEphemeral to have produced a handle");
			return handle;
		},
		failure: () => failure,
	};
}

test("replyEphemeral in a supergroup sends ephemeral_message_parameters and yields an ephemeral handle", async () => {
	const { env, handle } = setup();
	const group = env.createChat({ type: "supergroup" });
	const user = env.createUser({ id: 7 });

	await user.in(group).sendCommand("go");

	const call = env.lastApiCall("sendMessage");
	assert.equal(call?.params?.chat_id, group.id);
	assert.deepEqual(call?.params?.ephemeral_message_parameters, { receiver_user_id: 7 });
	assert.equal(call?.params?.receiver_user_id, undefined);
	assert.equal(call?.params?.text, "hello");

	const msg = handle();
	assert.equal(msg.isEphemeral, true);
	assert.equal(msg.chatId, group.id);
	assert.equal(msg.receiverUserId, 7);
	assert.equal(msg.ephemeralMessageId, 900);
	assert.equal(msg.messageId, undefined);
});

test("the handle addresses edits and deletes with the full ephemeral triple", async () => {
	const { env, handle } = setup();
	const group = env.createChat({ type: "group" });
	const user = env.createUser({ id: 7 });
	await user.in(group).sendCommand("go");

	const msg = handle();
	const triple = { chat_id: group.id, receiver_user_id: 7, ephemeral_message_id: 900 };

	assert.equal(await msg.edit("v2"), true);
	assert.deepEqual(env.lastApiCall("editEphemeralMessageText")?.params, { ...triple, text: "v2" });

	const keyboard = { inline_keyboard: [[{ text: "ok", callback_data: "ok" }]] };
	assert.equal(await msg.editReplyMarkup(keyboard), true);
	assert.deepEqual(env.lastApiCall("editEphemeralMessageReplyMarkup")?.params, {
		...triple,
		reply_markup: keyboard,
	});

	assert.equal(await msg.delete(), true);
	assert.deepEqual(env.lastApiCall("deleteEphemeralMessage")?.params, triple);
});

test("a format-result text is split into text + entities", async () => {
	const { env, handle } = setup();
	const group = env.createChat({ type: "supergroup" });
	await env.createUser({ id: 7 }).in(group).sendCommand("go");

	const bolded = { text: "loud", entities: [{ type: "bold" as const, offset: 0, length: 4 }] };
	await handle().edit(bolded);

	const call = env.lastApiCall("editEphemeralMessageText");
	assert.equal(call?.params?.text, "loud");
	assert.deepEqual(call?.params?.entities, bolded.entities);
});

test("private chat falls back to a normal message behind the same handle", async () => {
	const { env, handle } = setup();
	const user = env.createUser({ id: 7 });

	await user.sendCommand("go");

	const sent = env.lastApiCall("sendMessage");
	assert.equal(sent?.params?.ephemeral_message_parameters, undefined);

	const msg = handle();
	assert.equal(msg.isEphemeral, false);
	assert.equal(msg.ephemeralMessageId, undefined);
	assert.equal(msg.messageId, 42);

	await msg.edit("v2");
	const edit = env.lastApiCall("editMessageText");
	assert.equal(edit?.params?.message_id, 42);
	assert.equal(edit?.params?.text, "v2");
	assert.equal(edit?.params?.receiver_user_id, undefined);

	await msg.delete();
	assert.equal(env.lastApiCall("deleteMessage")?.params?.message_id, 42);
});

test('fallback: "error" rejects in a private chat instead of sending', async () => {
	const { env, failure } = setup({ fallback: "error" });
	await env.createUser({ id: 7 }).sendCommand("go");

	assert.match(String(failure()), /group and supergroup/);
	assert.equal(env.lastApiCall("sendMessage"), undefined);
});

test("sendEphemeral targets the given user and never falls back", async () => {
	let failure: unknown;
	const bot = new Composer<Context>().install(ephemeral()).command("nudge", async (ctx) => {
		try {
			await ctx.sendEphemeral(99, "psst");
		} catch (error) {
			failure = error;
		}
	});
	const env = createTestEnv(bot);
	env.onApi("sendMessage", () => ({ message_id: 0, ephemeral_message_id: 1 }));

	const group = env.createChat({ type: "supergroup" });
	await env.createUser({ id: 7 }).in(group).sendCommand("nudge");
	assert.deepEqual(env.lastApiCall("sendMessage")?.params?.ephemeral_message_parameters, {
		receiver_user_id: 99,
	});

	env.clearApiCalls();
	await env.createUser({ id: 8 }).sendCommand("nudge");
	assert.match(String(failure), /group and supergroup/);
	assert.equal(env.lastApiCall("sendMessage"), undefined);
});

test('onExpired: "throw" (default) rethrows an expired edit', async () => {
	const { env, handle } = setup();
	const group = env.createChat({ type: "supergroup" });
	await env.createUser({ id: 7 }).in(group).sendCommand("go");

	env.onApi("editEphemeralMessageText", GONE);
	await assert.rejects(() => handle().edit("v2"), /not found/);
});

test('onExpired: "ignore" resolves false and leaves it at that', async () => {
	const { env, handle } = setup({ onExpired: "ignore" });
	const group = env.createChat({ type: "supergroup" });
	await env.createUser({ id: 7 }).in(group).sendCommand("go");

	env.onApi("editEphemeralMessageText", GONE);
	assert.equal(await handle().edit("v2"), false);
	assert.equal(env.callsTo("sendMessage").length, 1);
});

test("a non-expired error is rethrown whatever the policy", async () => {
	const { env, handle } = setup({ onExpired: "ignore" });
	const group = env.createChat({ type: "supergroup" });
	await env.createUser({ id: 7 }).in(group).sendCommand("go");

	env.onApi("editEphemeralMessageText", apiError(403, "Forbidden: bot was kicked"));
	await assert.rejects(() => handle().edit("v2"), /kicked/);
});

test('onExpired: "resend" sends the new content fresh and retargets the handle', async () => {
	const { env, handle } = setup({ onExpired: "resend" });
	const group = env.createChat({ type: "supergroup" });
	await env.createUser({ id: 7 }).in(group).sendCommand("go");

	env.onApi("editEphemeralMessageText", GONE);
	assert.equal(await handle().edit("v2"), true);

	const resent = env.lastApiCall("sendMessage");
	assert.deepEqual(resent?.params?.ephemeral_message_parameters, { receiver_user_id: 7 });
	assert.equal(resent?.params?.text, "v2");
	// the handle now points at the fresh message (second stubbed id, 901)…
	assert.equal(handle().ephemeralMessageId, 901);

	// …and later calls address it.
	await handle().delete();
	assert.equal(env.lastApiCall("deleteEphemeralMessage")?.params?.ephemeral_message_id, 901);
});

test("editReplyMarkup resend carries the last known text", async () => {
	const { env, handle } = setup({ onExpired: "resend" });
	const group = env.createChat({ type: "supergroup" });
	await env.createUser({ id: 7 }).in(group).sendCommand("go");

	env.onApi("editEphemeralMessageReplyMarkup", GONE);
	const keyboard = { inline_keyboard: [[{ text: "ok", callback_data: "ok" }]] };
	assert.equal(await handle().editReplyMarkup(keyboard), true);

	const resent = env.lastApiCall("sendMessage");
	assert.equal(resent?.params?.text, "hello");
	assert.deepEqual(resent?.params?.reply_markup, keyboard);
});

test("delete is idempotent: an already-gone message resolves false, never throws", async () => {
	const { env, handle } = setup(); // onExpired: "throw" — delete ignores it by design
	const group = env.createChat({ type: "supergroup" });
	await env.createUser({ id: 7 }).in(group).sendCommand("go");

	env.onApi("deleteEphemeralMessage", GONE);
	assert.equal(await handle().delete(), false);
});

test("wrapEphemeralMessage wraps a raw sent message; refuses a non-ephemeral one", async () => {
	const { env } = setup();
	const chat = { id: -5, type: "supergroup" as const };
	const sent = {
		message_id: 0,
		ephemeral_message_id: 33,
		receiver_user: { id: 7, is_bot: false, first_name: "u" },
		chat,
		date: 0,
	};

	const msg = wrapEphemeralMessage(env.api, sent, { onExpired: "ignore" });
	await msg.edit("hi");
	assert.deepEqual(env.lastApiCall("editEphemeralMessageText")?.params, {
		chat_id: -5,
		receiver_user_id: 7,
		ephemeral_message_id: 33,
		text: "hi",
	});

	assert.throws(
		() => wrapEphemeralMessage(env.api, { message_id: 1, chat, date: 0 }),
		/ephemeral_message_id/,
	);
});

test("supportsEphemeral: group/supergroup only", () => {
	assert.equal(supportsEphemeral({ type: "group" }), true);
	assert.equal(supportsEphemeral({ type: "supergroup" }), true);
	assert.equal(supportsEphemeral({ type: "private" }), false);
	assert.equal(supportsEphemeral({ type: "channel" }), false);
	assert.equal(supportsEphemeral(undefined), false);
});

test("isExpiredEphemeralError: 400 + gone-ish description only", () => {
	assert.equal(
		isExpiredEphemeralError({ code: 400, description: "Bad Request: ephemeral message not found" }),
		true,
	);
	assert.equal(
		isExpiredEphemeralError({ code: 400, description: "Bad Request: message expired" }),
		true,
	);
	assert.equal(
		isExpiredEphemeralError({ code: 400, description: "Bad Request: chat not found" }),
		false,
	);
	assert.equal(isExpiredEphemeralError({ code: 403, description: "Forbidden: not found" }), false);
	assert.equal(
		isExpiredEphemeralError({ code: 400, description: "Bad Request: message is too long" }),
		false,
	);
	assert.equal(
		isExpiredEphemeralError({ code: 400, description: "Bad Request: invalid message content" }),
		false,
	);
	assert.equal(isExpiredEphemeralError(new Error("not found")), false);
	assert.equal(isExpiredEphemeralError(null), false);
});

test("rich replies, edits and markup recovery preserve the whole rich payload", async () => {
	let handle!: EphemeralMessage;
	const doc = {
		html: "<p>personal</p>",
		media: [{ id: "file", media: { type: "document", media: "file-id" } }],
	};
	const bot = new Composer<Context>()
		.install(ephemeral({ onExpired: "resend" }))
		.command("rich", async (ctx) => {
			handle = await ctx.replyEphemeral({ rich_message: { toInputRichMessage: () => doc } });
		});
	const env = createTestEnv(bot);
	let id = 10;
	env.onApi("sendRichMessage", () => ({ message_id: 0, ephemeral_message_id: id++ }));
	const group = env.createChat({ type: "supergroup" });
	await env.createUser({ id: 7 }).in(group).sendCommand("rich");
	assert.deepEqual(env.lastApiCall("sendRichMessage")?.params?.rich_message, doc);
	await handle.editRich({ blocks: [{ type: "divider" }] });
	assert.equal(env.lastApiCall("editEphemeralMessageText")?.params?.text, undefined);
	env.onApi("editEphemeralMessageReplyMarkup", GONE);
	await handle.editReplyMarkup(undefined);
	assert.deepEqual(env.lastApiCall("sendRichMessage")?.params?.rich_message, {
		blocks: [{ type: "divider" }],
	});
	assert.deepEqual(env.lastApiCall("sendRichMessage")?.params?.reply_markup, {
		inline_keyboard: [],
	});
	assert.equal(handle.ephemeralMessageId, 11);
});

test("media sends route each type to its native method, including private fallbacks", async () => {
	for (const [type, method, field] of [
		["photo", "sendPhoto", "photo"],
		["video", "sendVideo", "video"],
		["animation", "sendAnimation", "animation"],
		["audio", "sendAudio", "audio"],
		["document", "sendDocument", "document"],
		["voice_note", "sendVoice", "voice"],
		["live_photo", "sendLivePhoto", "live_photo"],
	] as const) {
		const bot = new Composer<Context>().install(ephemeral()).command("media", async (ctx) => {
			await ctx.replyEphemeral({
				media: { type, media: "file-id", photo: "photo-id", caption: "caption" },
			});
		});
		const env = createTestEnv(bot);
		env.onApi(method, () => ({ message_id: 99, ephemeral_message_id: 5 }));
		const user = env.createUser({ id: 7 });
		await user.in(env.createChat({ type: "supergroup" })).sendCommand("media");
		assert.equal(env.lastApiCall(method)?.params?.[field], "file-id");
		assert.deepEqual(env.lastApiCall(method)?.params?.ephemeral_message_parameters, {
			receiver_user_id: 7,
		});
		await user.sendCommand("media");
		assert.equal(env.lastApiCall(method)?.params?.ephemeral_message_parameters, undefined);
	}
});

test("media edits accept new uploads; caption and markup resend retain media and formatting", async () => {
	const { env, handle } = setup({ onExpired: "resend" });
	await env
		.createUser({ id: 7 })
		.in(env.createChat({ type: "supergroup" }))
		.sendCommand("go");
	const { media } = await import("@yaebal/core");
	const uploaded = {
		type: "photo",
		media: media.buffer(new Uint8Array([1]), "photo.jpg"),
		caption: "original",
	};
	env.onApi("sendPhoto", () => ({ message_id: 0, ephemeral_message_id: 901 }));
	await handle().editMedia(uploaded);
	assert.deepEqual(env.lastApiCall("editEphemeralMessageMedia")?.params?.media, uploaded);
	const caption = { text: "updated", entities: [{ type: "bold" as const, offset: 0, length: 7 }] };
	await handle().editCaption(caption, { show_caption_above_media: true });
	env.onApi("editEphemeralMessageReplyMarkup", GONE);
	await handle().editReplyMarkup(undefined);
	const resent = env.lastApiCall("sendPhoto")?.params;
	assert.equal(resent?.photo, uploaded.media);
	assert.equal(resent?.caption, "updated");
	assert.deepEqual(resent?.caption_entities, caption.entities);
	assert.equal(resent?.show_caption_above_media, true);
	assert.equal(handle().ephemeralMessageId, 901);
});

test("callback replacements target the caller and never replay the replacement after expiry", async () => {
	let handle!: EphemeralMessage;
	const bot = new Composer<Context>()
		.install(ephemeral({ onExpired: "resend" }))
		.on("callback_query", async (ctx) => {
			handle = await ctx.replaceWithEphemeral("personal");
		});
	const env = createTestEnv(bot);
	env.onApi("sendMessage", () => ({ message_id: 0, ephemeral_message_id: 10 }));
	const { callbackUpdate } = await import("@yaebal/test");
	const message = { message_id: 42, date: 0, chat: { id: -1, type: "supergroup" as const } };
	await env.dispatch(callbackUpdate({ fromId: 7, message }));
	assert.deepEqual(env.lastApiCall("sendMessage")?.params?.ephemeral_message_parameters, {
		receiver_user_id: 7,
		callback_query_id: "1",
		replace_callback_query_message: true,
	});
	env.onApi("editEphemeralMessageText", GONE);
	await handle.edit("updated");
	assert.deepEqual(env.lastApiCall("sendMessage")?.params?.ephemeral_message_parameters, {
		receiver_user_id: 7,
	});
	await assert.rejects(
		() =>
			env.dispatch(
				callbackUpdate({ fromId: 7, message: { ...message, ephemeral_message_id: 10 } }),
			),
		/regular chat message/,
	);
});

test("private fallback supports rich, media and caption edits through regular methods", async () => {
	const { env, handle } = setup();
	await env.createUser({ id: 7 }).sendCommand("go");
	await handle().editRich({ html: "<p>rich</p>" });
	assert.deepEqual(env.lastApiCall("editMessageText")?.params?.rich_message, {
		html: "<p>rich</p>",
	});
	await handle().editMedia({ type: "photo", media: "photo-id" });
	await handle().editCaption("new caption", { show_caption_above_media: true });
	assert.equal(env.lastApiCall("editMessageMedia")?.params?.message_id, 42);
	assert.equal(env.lastApiCall("editMessageCaption")?.params?.show_caption_above_media, true);
});

test("replies to ephemeral commands use their short-lived reply id", async () => {
	const { env } = setup();
	await env.dispatch({
		update_id: 1,
		message: {
			message_id: 0,
			ephemeral_message_id: 50,
			date: 0,
			chat: { id: -1, type: "supergroup" },
			from: { id: 7, is_bot: false, first_name: "user" },
			text: "/go",
			entities: [{ type: "bot_command", offset: 0, length: 3 }],
		},
	});
	assert.deepEqual(env.lastApiCall("sendMessage")?.params?.reply_parameters, {
		ephemeral_message_id: 50,
	});
});

test("replacements reject private chats and non-callback updates without sending", async () => {
	const { callbackUpdate } = await import("@yaebal/test");
	const bot = new Composer<Context>()
		.install(ephemeral())
		.use((ctx) => ctx.replaceWithEphemeral("personal"));
	const env = createTestEnv(bot);
	await assert.rejects(() => env.dispatch(callbackUpdate()), /group and supergroup/);
	await assert.rejects(() => env.createUser().sendMessage("hello"), /regular chat message/);
	assert.equal(env.callsTo("sendMessage").length, 0);
});
