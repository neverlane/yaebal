import assert from "node:assert/strict";
import test from "node:test";
import { Composer, type Context } from "@yaebal/core";
import { chatMemberUpdate, createTestEnv, myChatMemberUpdate } from "@yaebal/test";
import { membership } from "./membership.js";
import { botIsAdmin, isAdmin } from "./predicates.js";

test("membership(): caches getChatMember, so repeated checks in the same chat/user don't re-call the api", async () => {
	const seen: boolean[] = [];
	const bot = new Composer<Context>().install(membership()).on("message:text", async (ctx) => {
		seen.push(await isAdmin(ctx));
	});

	const env = createTestEnv(bot, { strictDispatch: false });
	env.onApi("getChatMember", {
		status: "administrator",
		user: { id: 1, is_bot: false, first_name: "a" },
	});

	const user = env.createUser({ id: 1 });
	const group = env.createChat({ type: "supergroup" });

	await user.in(group).sendMessage("one");
	await user.in(group).sendMessage("two");

	assert.deepEqual(seen, [true, true]);
	assert.equal(env.apiCalls.filter((c) => c.method === "getChatMember").length, 1);
});

test("membership(): a chat_member update invalidates that (chat, user)'s cached entry", async () => {
	const seen: boolean[] = [];
	const bot = new Composer<Context>().install(membership()).on("message:text", async (ctx) => {
		seen.push(await isAdmin(ctx));
	});

	const env = createTestEnv(bot, { strictDispatch: false });
	let status = "member";
	env.onApi("getChatMember", () => ({ status, user: { id: 1, is_bot: false, first_name: "a" } }));

	const user = env.createUser({ id: 1 });
	const group = env.createChat({ type: "supergroup" });

	await user.in(group).sendMessage("before promotion");

	status = "administrator";
	await env.dispatch(
		chatMemberUpdate({
			chatId: group.id,
			userId: 1,
			oldStatus: "member",
			newStatus: "administrator",
		}),
	);

	await user.in(group).sendMessage("after promotion");

	assert.deepEqual(seen, [false, true]);
	assert.equal(env.apiCalls.filter((c) => c.method === "getChatMember").length, 2);
});

test("membership(): does not invalidate a different chat or a different user", async () => {
	const bot = new Composer<Context>().install(membership()).on("message:text", async (ctx) => {
		await isAdmin(ctx);
	});

	const env = createTestEnv(bot, { strictDispatch: false });
	env.onApi("getChatMember", {
		status: "administrator",
		user: { id: 1, is_bot: false, first_name: "a" },
	});

	const user = env.createUser({ id: 1 });
	const group = env.createChat({ type: "supergroup" });
	await user.in(group).sendMessage("warm the cache");

	// a chat_member update for a different user in the same chat doesn't touch user 1's entry.
	await env.dispatch(chatMemberUpdate({ chatId: group.id, userId: 2 }));
	await user.in(group).sendMessage("still cached");

	assert.equal(env.apiCalls.filter((c) => c.method === "getChatMember").length, 1);
});

test("membership(): a my_chat_member update invalidates the bot's own cached entry", async () => {
	const results: boolean[] = [];
	const bot = new Composer<Context>()
		.install(membership())
		.derive(() => ({ me: { id: 999, is_bot: true, first_name: "bot" } }))
		.on("message:text", async (ctx) => {
			results.push(await botIsAdmin(ctx));
		});

	const env = createTestEnv(bot, { strictDispatch: false });
	let status = "member";
	env.onApi("getChatMember", (params: Record<string, unknown> | undefined) => {
		const userId = (params as { user_id: number }).user_id;
		return userId === 999
			? { status, user: { id: 999, is_bot: true, first_name: "bot" } }
			: { status: "member", user: { id: 1, is_bot: false, first_name: "u" } };
	});

	const user = env.createUser({ id: 1 });
	const group = env.createChat({ type: "supergroup" });

	await user.in(group).sendMessage("before promotion");

	status = "administrator";
	await env.dispatch(
		myChatMemberUpdate({ chatId: group.id, userId: 999, newStatus: "administrator" }),
	);

	await user.in(group).sendMessage("after promotion");

	assert.deepEqual(results, [false, true]);
});

test("membership(): predicates still work without the plugin installed (direct api call, no cache)", async () => {
	const seen: boolean[] = [];
	const bot = new Composer<Context>().on("message:text", async (ctx) => {
		seen.push(await isAdmin(ctx));
	});

	const env = createTestEnv(bot, { strictDispatch: false });
	env.onApi("getChatMember", {
		status: "administrator",
		user: { id: 1, is_bot: false, first_name: "a" },
	});

	const user = env.createUser({ id: 1 });
	const group = env.createChat({ type: "supergroup" });

	await user.in(group).sendMessage("one");
	await user.in(group).sendMessage("two");

	assert.deepEqual(seen, [true, true]);
	assert.equal(env.apiCalls.filter((c) => c.method === "getChatMember").length, 2);
});

test("membership(): exposes its cache client for pre-warming/sharing", () => {
	const plugin = membership();
	assert.equal(typeof plugin.cache.wrap, "function");
});
