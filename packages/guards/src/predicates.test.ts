import assert from "node:assert/strict";
import test from "node:test";
import { Composer, type Context, type Filter, type Update } from "@yaebal/core";
import { and, isChannel, or } from "@yaebal/filters";
import { createTestEnv } from "@yaebal/test";
import {
	asGuard,
	botHasPermission,
	botIsAdmin,
	hasAllPermissions,
	hasAnyPermission,
	hasMembership,
	hasPermission,
	isAdmin,
	isGroup,
	isOwner,
	isPrivate,
} from "./predicates.js";

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

test("isPrivate keeps narrowing (and derived props) when the context is already enriched", async () => {
	// regression test for the bug where asGuard fixed C = Context at definition time: once the
	// context carries anything derive/decorate added, `Context & Add` no longer extends that
	// fixed `C`, so `Composer.guard`'s narrowing overload silently stopped applying and
	// `ctx.chat` degraded to `Chat | undefined` below. if this file fails to compile, that
	// regressed.
	const bot = new Composer<Context>()
		.derive(() => ({ db: { ready: true } }))
		.guard(isPrivate)
		.on("message:text", (ctx) => {
			const type: "private" = ctx.chat.type;
			assert.equal(type, "private");
			assert.equal(ctx.db.ready, true);
		});

	await createTestEnv(bot, { strictDispatch: false }).createUser().sendMessage("hi");
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

test("asGuard throws when given an async filter instead of silently denying forever", () => {
	const asyncFilter: Filter<Context> = async () => true;
	const guard = asGuard(asyncFilter);

	assert.throws(() => guard({} as Context), TypeError);
});

test("asGuard throws when given a staging filter instead of silently dropping the staged data", () => {
	const stagingFilter: Filter<Context, { match: string }> = (_ctx, bag) => {
		bag.match = "x";
		return true;
	};
	const guard = asGuard(stagingFilter);

	assert.throws(() => guard({} as Context), TypeError);
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

test("isAdmin allows an anonymous admin/owner without ever calling getChatMember", async () => {
	let called = false;
	const bot = new Composer<Context>().guard(isAdmin).on("message", () => {
		called = true;
	});

	const env = createTestEnv(bot, { strictDispatch: false });
	env.onApi("getChatMember", () => {
		throw new Error("isAdmin should never look up an anonymous sender");
	});

	await env.dispatch(anonymousUpdate(-1));
	assert.equal(called, true);
});

test("isOwner allows only the creator; an anonymous sender is denied (could be creator or admin)", async () => {
	const results: boolean[] = [];
	const bot = new Composer<Context>().on("message", async (ctx) => {
		results.push(await isOwner(ctx));
	});

	const env = createTestEnv(bot, { strictDispatch: false });
	env.onApi("getChatMember", (params: Record<string, unknown> | undefined) => {
		const userId = (params as { user_id: number }).user_id;
		return userId === 1
			? { status: "creator", user: { id: 1, is_bot: false, first_name: "c" } }
			: { status: "administrator", user: { id: 2, is_bot: false, first_name: "a" } };
	});

	const group = env.createChat({ type: "supergroup" });
	await env.createUser({ id: 1 }).in(group).sendMessage("hi");
	await env.createUser({ id: 2 }).in(group).sendMessage("hi");
	await env.dispatch(anonymousUpdate(group.id));

	assert.deepEqual(results, [true, false, false]);
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

test("hasMembership(): an empty status list throws instead of denying forever", () => {
	assert.throws(() => hasMembership(), TypeError);
});

test("hasMembership: an anonymous sender matches only when both creator and administrator are accepted", async () => {
	const results: boolean[] = [];
	const openToBoth = hasMembership("creator", "administrator");
	const creatorOnly = hasMembership("creator");
	const adminOnly = hasMembership("administrator");

	const bot = new Composer<Context>().on("message", async (ctx) => {
		results.push(await openToBoth(ctx), await creatorOnly(ctx), await adminOnly(ctx));
	});

	await createTestEnv(bot, { strictDispatch: false }).dispatch(anonymousUpdate(-1));
	assert.deepEqual(results, [true, false, false]);
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

test("hasPermission: an unset optional flag (undefined, not false) still denies", async () => {
	let result: boolean | undefined;
	const bot = new Composer<Context>().on("message:text", async (ctx) => {
		result = await hasPermission("can_pin_messages")(ctx);
	});

	const env = createTestEnv(bot, { strictDispatch: false });
	// an administrator response with no `can_pin_messages` key at all (as telegram omits it
	// when a channel-only or unset flag doesn't apply) — must read as false, not throw.
	env.onApi("getChatMember", {
		status: "administrator",
		user: { id: 1, is_bot: false, first_name: "a" },
	});

	await env
		.createUser({ id: 1 })
		.in(env.createChat({ type: "supergroup" }))
		.sendMessage("hi");
	assert.equal(result, false);
});

test("hasPermission: an anonymous admin/owner is denied by default, allowed with allowAnonymous", async () => {
	const results: boolean[] = [];
	const strict = hasPermission("can_restrict_members");
	const lenient = hasPermission("can_restrict_members", { allowAnonymous: true });

	const bot = new Composer<Context>().on("message", async (ctx) => {
		results.push(await strict(ctx), await lenient(ctx));
	});

	await createTestEnv(bot, { strictDispatch: false }).dispatch(anonymousUpdate(-1));
	assert.deepEqual(results, [false, true]);
});

test("hasAnyPermission: passes when any listed flag is set; empty list throws", async () => {
	assert.throws(() => hasAnyPermission([]), TypeError);

	let result: boolean | undefined;
	const bot = new Composer<Context>().on("message:text", async (ctx) => {
		result = await hasAnyPermission(["can_restrict_members", "can_pin_messages"])(ctx);
	});

	const env = createTestEnv(bot, { strictDispatch: false });
	env.onApi("getChatMember", {
		status: "administrator",
		user: { id: 1, is_bot: false, first_name: "a" },
		can_pin_messages: true,
	});

	await env
		.createUser({ id: 1 })
		.in(env.createChat({ type: "supergroup" }))
		.sendMessage("hi");
	assert.equal(result, true);
});

test("hasAllPermissions: passes only when every listed flag is set; empty list throws", async () => {
	assert.throws(() => hasAllPermissions([]), TypeError);

	const results: boolean[] = [];
	const bot = new Composer<Context>().on("message:text", async (ctx) => {
		results.push(await hasAllPermissions(["can_restrict_members", "can_pin_messages"])(ctx));
	});

	const env = createTestEnv(bot, { strictDispatch: false });
	env.onApi("getChatMember", {
		status: "administrator",
		user: { id: 1, is_bot: false, first_name: "a" },
		can_restrict_members: true,
		can_pin_messages: false,
	});

	await env
		.createUser({ id: 1 })
		.in(env.createChat({ type: "supergroup" }))
		.sendMessage("hi");
	assert.deepEqual(results, [false]);
});

test("botIsAdmin/botHasPermission check ctx.me's standing, not the update's sender", async () => {
	const results: Array<[boolean, boolean]> = [];
	const bot = new Composer<Context>()
		.derive(() => ({ me: { id: 999, is_bot: true, first_name: "bot" } }))
		.on("message:text", async (ctx) => {
			results.push([await botIsAdmin(ctx), await botHasPermission("can_delete_messages")(ctx)]);
		});

	const env = createTestEnv(bot, { strictDispatch: false });
	env.onApi("getChatMember", (params: Record<string, unknown> | undefined) => {
		const userId = (params as { user_id: number }).user_id;
		return userId === 999
			? {
					status: "administrator",
					user: { id: 999, is_bot: true, first_name: "bot" },
					can_delete_messages: true,
				}
			: { status: "member", user: { id: 1, is_bot: false, first_name: "u" } };
	});

	await env
		.createUser({ id: 1 })
		.in(env.createChat({ type: "supergroup" }))
		.sendMessage("hi");
	assert.deepEqual(results, [[true, true]]);
});

test("botIsAdmin denies when ctx.me is unknown", async () => {
	let result: boolean | undefined;
	const bot = new Composer<Context>().on("message:text", async (ctx) => {
		result = await botIsAdmin(ctx);
	});

	const env = createTestEnv(bot, { strictDispatch: false });
	await env
		.createUser()
		.in(env.createChat({ type: "supergroup" }))
		.sendMessage("hi");

	assert.equal(result, false);
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
