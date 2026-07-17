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
		params?.receiver_user_id === undefined
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

test("replyEphemeral in a supergroup sends receiver_user_id and yields an ephemeral handle", async () => {
	const { env, handle } = setup();
	const group = env.createChat({ type: "supergroup" });
	const user = env.createUser({ id: 7 });

	await user.in(group).sendCommand("go");

	const call = env.lastApiCall("sendMessage");
	assert.equal(call?.params?.chat_id, group.id);
	assert.equal(call?.params?.receiver_user_id, 7);
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
	assert.equal(sent?.params?.receiver_user_id, undefined);

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
	assert.equal(env.lastApiCall("sendMessage")?.params?.receiver_user_id, 99);

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
	assert.equal(resent?.params?.receiver_user_id, 7);
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
		true,
	);
	assert.equal(isExpiredEphemeralError({ code: 403, description: "Forbidden: not found" }), false);
	assert.equal(
		isExpiredEphemeralError({ code: 400, description: "Bad Request: message is too long" }),
		false,
	);
	assert.equal(isExpiredEphemeralError(new Error("not found")), false);
	assert.equal(isExpiredEphemeralError(null), false);
});
