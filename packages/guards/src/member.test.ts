import assert from "node:assert/strict";
import test from "node:test";
import { Composer, type Context, HttpError, type Update } from "@yaebal/core";
import { apiError, createTestEnv } from "@yaebal/test";
import { fromLinkedChannel, isAnonymousAdmin, resolveMember } from "./member.js";

/** an anonymous admin/owner posting as the group — `from` is GroupAnonymousBot, `sender_chat` is the group itself. */
function anonymousUpdate(chatId: number): Update {
	return {
		update_id: 1,
		message: {
			message_id: 1,
			date: 0,
			chat: { id: chatId, type: "supergroup" },
			from: { id: 1087968824, is_bot: true, first_name: "Group", username: "GroupAnonymousBot" },
			sender_chat: { id: chatId, type: "supergroup" },
			text: "hi",
		},
	} as unknown as Update;
}

/** an automatic forward from a channel linked to this group — `sender_chat` is the channel, not the group. */
function linkedChannelUpdate(chatId: number, channelId: number): Update {
	return {
		update_id: 2,
		message: {
			message_id: 2,
			date: 0,
			chat: { id: chatId, type: "supergroup" },
			from: { id: 777000, is_bot: true, first_name: "Channel" },
			sender_chat: { id: channelId, type: "channel" },
			is_automatic_forward: true,
			text: "announcement",
		},
	} as unknown as Update;
}

test("isAnonymousAdmin: true when sender_chat is the group itself", async () => {
	let seen: boolean | undefined;
	const bot = new Composer<Context>().on("message", (ctx) => {
		seen = isAnonymousAdmin(ctx);
	});

	await createTestEnv(bot, { strictDispatch: false }).dispatch(anonymousUpdate(-1));
	assert.equal(seen, true);
});

test("isAnonymousAdmin: false for a regular sender", async () => {
	let seen: boolean | undefined;
	const bot = new Composer<Context>().on("message", (ctx) => {
		seen = isAnonymousAdmin(ctx);
	});

	const env = createTestEnv(bot, { strictDispatch: false });
	const user = env.createUser();
	const group = env.createChat({ type: "supergroup" });
	await user.in(group).sendMessage("hi");

	assert.equal(seen, false);
});

test("isAnonymousAdmin: false for a linked-channel automatic forward (sender_chat differs from chat)", async () => {
	let seen: boolean | undefined;
	const bot = new Composer<Context>().on("message", (ctx) => {
		seen = isAnonymousAdmin(ctx);
	});

	await createTestEnv(bot, { strictDispatch: false }).dispatch(linkedChannelUpdate(-1, -100));
	assert.equal(seen, false);
});

test("fromLinkedChannel: true only when sender_chat differs from the chat", async () => {
	const seen: boolean[] = [];
	const bot = new Composer<Context>().on("message", (ctx) => {
		seen.push(fromLinkedChannel(ctx));
	});

	const env = createTestEnv(bot, { strictDispatch: false });
	await env.dispatch(linkedChannelUpdate(-1, -100));
	await env.dispatch(anonymousUpdate(-1));

	assert.deepEqual(seen, [true, false]);
});

test('resolveMember: anonymous admin resolves to "anonymous" without an api call', async () => {
	const results: unknown[] = [];
	const bot = new Composer<Context>().on("message", async (ctx) => {
		results.push(await resolveMember(ctx));
	});

	const env = createTestEnv(bot, { strictDispatch: false });
	await env.dispatch(anonymousUpdate(-1));

	assert.deepEqual(results, [{ kind: "anonymous" }]);
	assert.equal(env.apiCalls.length, 0);
});

test('resolveMember: no chat/user on the update resolves to "none"', async () => {
	let result: unknown;
	const bot = new Composer<Context>().on("channel_post", async (ctx) => {
		result = await resolveMember(ctx);
	});

	const env = createTestEnv(bot, { strictDispatch: false });
	await env.createChat({ type: "channel" }).post("announcement");

	assert.deepEqual(result, { kind: "none" });
});

test('resolveMember: a TelegramError from getChatMember denies ("none") instead of throwing', async () => {
	let result: unknown;
	const bot = new Composer<Context>().on("message:text", async (ctx) => {
		result = await resolveMember(ctx);
	});

	const env = createTestEnv(bot, { strictDispatch: false });
	env.onApi("getChatMember", apiError(400, "Bad Request: user not found"));

	const user = env.createUser();
	const group = env.createChat({ type: "supergroup" });
	await user.in(group).sendMessage("hi");

	assert.deepEqual(result, { kind: "none" });
});

test("resolveMember: a non-TelegramError failure (network/http) throws instead of silently denying", async () => {
	const bot = new Composer<Context>().on("message:text", async (ctx) => {
		await resolveMember(ctx);
	});

	const env = createTestEnv(bot, { strictDispatch: false });
	env.onApi("getChatMember", new HttpError("getChatMember", 502, "Bad Gateway"));

	const user = env.createUser();
	const group = env.createChat({ type: "supergroup" });

	await assert.rejects(() => user.in(group).sendMessage("hi"), HttpError);
});
