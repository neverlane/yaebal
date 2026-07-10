import assert from "node:assert/strict";
import test from "node:test";
import { Composer, type Context } from "@yaebal/core";
import { and, isChannel, or } from "@yaebal/filters";
import { createTestEnv } from "@yaebal/test";
import { asGuard, hasMembership, hasPermission, isAdmin, isGroup, isPrivate } from "./index.js";

test("isPrivate guards private chats and narrows ctx.chat", async () => {
	const bot = new Composer<Context>().guard(isPrivate).on("message:text", (ctx) => {
		// `isPrivate` narrows `ctx.chat.type` to the literal "private" — no `?`/cast needed.
		const type: "private" = ctx.chat.type;
		assert.equal(type, "private");
	});

	const env = createTestEnv(bot, { strictDispatch: false });
	const user = env.createUser();
	const group = env.createChat({ type: "group" });

	await user.sendMessage("hi");
	await user.in(group).sendMessage("hi");
});

test("isGroup guards group/supergroup chats", async () => {
	let seen = 0;
	const bot = new Composer<Context>().guard(isGroup).on("message:text", () => {
		seen++;
	});

	const env = createTestEnv(bot, { strictDispatch: false });
	const user = env.createUser();
	const group = env.createChat({ type: "group" });
	const supergroup = env.createChat({ type: "supergroup" });

	await user.sendMessage("hi");
	await user.in(group).sendMessage("hi");
	await user.in(supergroup).sendMessage("hi");

	assert.equal(seen, 2);
});

test("asGuard adapts any @yaebal/filters sync predicate into a narrowing guard", async () => {
	let seen = 0;
	const bot = new Composer<Context>().guard(asGuard(isChannel)).on("channel_post", () => {
		seen++;
	});

	const env = createTestEnv(bot, { strictDispatch: false });
	const channel = env.createChat({ type: "channel" });

	await channel.post("announcement");
	assert.equal(seen, 1);
});

test("isAdmin allows creator/administrator, denies member and lookup failures", async () => {
	const seen: string[] = [];
	const bot = new Composer<Context>().guard(isAdmin).on("message:text", (ctx) => {
		seen.push(String(ctx.from?.id));
	});

	const env = createTestEnv(bot, { strictDispatch: false });
	const group = env.createChat({ type: "supergroup" });
	const creator = env.createUser({ id: 1 });
	const admin = env.createUser({ id: 2 });
	const member = env.createUser({ id: 3 });

	env.onApi("getChatMember", (params: Record<string, unknown> | undefined) => {
		const userId = (params as { user_id: number }).user_id;
		if (userId === 1) return { status: "creator", user: { id: 1, is_bot: false, first_name: "c" } };
		if (userId === 2) {
			return { status: "administrator", user: { id: 2, is_bot: false, first_name: "a" } };
		}
		return { status: "member", user: { id: 3, is_bot: false, first_name: "m" } };
	});

	await creator.in(group).sendMessage("hi");
	await admin.in(group).sendMessage("hi");
	await member.in(group).sendMessage("hi");

	assert.deepEqual(seen, ["1", "2"]);
});

test("isAdmin denies when the update carries no chat/user", async () => {
	const seen: string[] = [];
	const bot = new Composer<Context>().guard(isAdmin).on("channel_post", () => {
		seen.push("hit");
	});

	const env = createTestEnv(bot, { strictDispatch: false });
	const channel = env.createChat({ type: "channel" });

	await channel.post("announcement");

	assert.deepEqual(seen, []);
});

test("hasMembership matches one of the given live statuses", async () => {
	const seen: string[] = [];
	const bot = new Composer<Context>()
		.guard(hasMembership("member", "administrator"))
		.on("message:text", (ctx) => {
			seen.push(String(ctx.from?.id));
		});

	const env = createTestEnv(bot, { strictDispatch: false });
	const group = env.createChat({ type: "group" });
	const member = env.createUser({ id: 10 });
	const left = env.createUser({ id: 11 });

	env.onApi("getChatMember", (params: Record<string, unknown> | undefined) => {
		const userId = (params as { user_id: number }).user_id;
		return userId === 10
			? { status: "member", user: { id: 10, is_bot: false, first_name: "m" } }
			: { status: "left", user: { id: 11, is_bot: false, first_name: "l" } };
	});

	await member.in(group).sendMessage("hi");
	await left.in(group).sendMessage("hi");

	assert.deepEqual(seen, ["10"]);
});

test("hasPermission: owner always passes, administrator needs the flag, others fail", async () => {
	const seen: string[] = [];
	const bot = new Composer<Context>()
		.guard(hasPermission("can_restrict_members"))
		.on("message:text", (ctx) => {
			seen.push(String(ctx.from?.id));
		});

	const env = createTestEnv(bot, { strictDispatch: false });
	const group = env.createChat({ type: "supergroup" });
	const owner = env.createUser({ id: 20 });
	const restrictor = env.createUser({ id: 21 });
	const posterOnly = env.createUser({ id: 22 });
	const plain = env.createUser({ id: 23 });

	env.onApi("getChatMember", (params: Record<string, unknown> | undefined) => {
		const userId = (params as { user_id: number }).user_id;
		if (userId === 20)
			return { status: "creator", user: { id: 20, is_bot: false, first_name: "o" } };
		if (userId === 21) {
			return {
				status: "administrator",
				user: { id: 21, is_bot: false, first_name: "r" },
				can_restrict_members: true,
			};
		}
		if (userId === 22) {
			return {
				status: "administrator",
				user: { id: 22, is_bot: false, first_name: "p" },
				can_restrict_members: false,
			};
		}
		return { status: "member", user: { id: 23, is_bot: false, first_name: "x" } };
	});

	await owner.in(group).sendMessage("hi");
	await restrictor.in(group).sendMessage("hi");
	await posterOnly.in(group).sendMessage("hi");
	await plain.in(group).sendMessage("hi");

	assert.deepEqual(seen, ["20", "21"]);
});

test("guard predicates compose with @yaebal/filters and/or", async () => {
	const andSeen: string[] = [];
	const orSeen: string[] = [];

	const andBot = new Composer<Context>().filter(and(isGroup, isAdmin), (ctx) => {
		andSeen.push(String(ctx.from?.id));
	});
	const orBot = new Composer<Context>().filter(or(isPrivate, isAdmin), (ctx) => {
		orSeen.push(String(ctx.from?.id));
	});

	const getChatMember = () => ({
		status: "administrator",
		user: { id: 30, is_bot: false, first_name: "a" },
	});

	const andEnv = createTestEnv(andBot, { strictDispatch: false });
	andEnv.onApi("getChatMember", getChatMember);
	const group = andEnv.createChat({ type: "group" });
	await andEnv.createUser({ id: 30 }).in(group).sendMessage("hi");

	const orEnv = createTestEnv(orBot, { strictDispatch: false });
	orEnv.onApi("getChatMember", getChatMember);
	const anotherGroup = orEnv.createChat({ type: "group" });
	await orEnv.createUser({ id: 30 }).in(anotherGroup).sendMessage("hi");

	assert.deepEqual(andSeen, ["30"]);
	assert.deepEqual(orSeen, ["30"]);
});
