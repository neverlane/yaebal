import assert from "node:assert/strict";
import test from "node:test";
import { Composer, type Context } from "@yaebal/core";
import { createTestEnv } from "@yaebal/test";
import { guardOr } from "./guard-or.js";
import { isAdmin } from "./predicates.js";

test("guardOr: runs the handler when the predicate passes", async () => {
	let handled = false;
	let denied = false;

	const bot = new Composer<Context>()
		.use(
			guardOr(
				() => true,
				() => {
					denied = true;
				},
			),
		)
		.on("message", () => {
			handled = true;
		});

	await createTestEnv(bot, { strictDispatch: false }).createUser().sendMessage("hi");

	assert.equal(handled, true);
	assert.equal(denied, false);
});

test("guardOr: calls onDeny and gates the rest of the chain when the predicate fails", async () => {
	let handled = false;
	const denials: string[] = [];

	const bot = new Composer<Context>()
		.use(
			guardOr(
				() => false,
				(ctx) => {
					denials.push(String(ctx.from?.id));
				},
			),
		)
		.on("message", () => {
			handled = true;
		});

	await createTestEnv(bot, { strictDispatch: false }).createUser({ id: 42 }).sendMessage("hi");

	assert.equal(handled, false);
	assert.deepEqual(denials, ["42"]);
});

test("guardOr: composes with a real predicate (isAdmin) to reply on denial", async () => {
	const replies: string[] = [];

	const bot = new Composer<Context>()
		.use(
			guardOr(isAdmin, (ctx) => {
				replies.push("denied");
				return ctx;
			}),
		)
		.command("ban", (ctx) => {
			replies.push(`banned by ${String(ctx.from?.id)}`);
		});

	const env = createTestEnv(bot, { strictDispatch: false });
	env.onApi("getChatMember", { status: "member", user: { id: 1, is_bot: false, first_name: "u" } });

	const group = env.createChat({ type: "supergroup" });
	await env.createUser({ id: 1 }).in(group).sendCommand("ban");

	assert.deepEqual(replies, ["denied"]);
});
