import assert from "node:assert/strict";
import test from "node:test";
import { Composer, Context, type Middleware } from "@yaebal/core";
import { and, command, fromUser, isPrivate, not, or, regex, text } from "./index.js";

const noop = async () => {};
const entry = <C extends Context>(c: Composer<C>) =>
	c.toMiddleware() as unknown as Middleware<Context>;
const api = {} as never;

const msgCtx = (body: string, chatType = "private", fromId = 1) =>
	new Context({
		api,
		update: {
			update_id: 1,
			message: {
				message_id: 1,
				date: 0,
				chat: { id: 1, type: chatType },
				from: { id: fromId, is_bot: false, first_name: "u" },
				text: body,
			},
		} as never,
		updateType: "message",
	});

const cbCtx = () =>
	new Context({
		api,
		update: {
			update_id: 2,
			callback_query: { id: "q", from: { id: 1, is_bot: false, first_name: "u" }, data: "x" },
		} as never,
		updateType: "callback_query",
	});

test("filter(text) runs only on non-empty text", async () => {
	const seen: string[] = [];

	const mw = entry(new Composer<Context>().filter(text, (ctx) => seen.push(ctx.text)));
	await mw(msgCtx("hi"), noop);
	await mw(cbCtx(), noop); // no text

	assert.deepEqual(seen, ["hi"]);
});

test("regex matches and exposes ctx.match", async () => {
	let captured = "";

	const mw = entry(
		new Composer<Context>().filter(regex(/^buy (\d+)/), (ctx) => {
			captured = ctx.match[1] ?? "";
		}),
	);
	await mw(msgCtx("buy 42"), noop);

	assert.equal(captured, "42");
});

test("command matches a name and exposes ctx.command / ctx.args", async () => {
	let cmd = "";
	let args: string[] = [];

	const mw = entry(
		new Composer<Context>().filter(command("add"), (ctx) => {
			cmd = ctx.command;
			args = ctx.args;
		}),
	);
	await mw(msgCtx("/add a b"), noop);

	assert.equal(cmd, "add");
	assert.deepEqual(args, ["a", "b"]);
});

test("and requires all; or requires any; not inverts", async () => {
	let andHits = 0;

	const andMw = entry(
		new Composer<Context>().filter(and(isPrivate, command("buy")), () => {
			andHits++;
		}),
	);
	await andMw(msgCtx("/buy", "private"), noop); // ✓ private + command
	await andMw(msgCtx("/buy", "group"), noop); // ✗ not private

	assert.equal(andHits, 1);

	let orHits = 0;

	const orMw = entry(
		new Composer<Context>().filter(or(command("a"), command("b")), () => {
			orHits++;
		}),
	);
	await orMw(msgCtx("/a"), noop);
	await orMw(msgCtx("/b"), noop);
	await orMw(msgCtx("/c"), noop);

	assert.equal(orHits, 2);

	let notHits = 0;

	const notMw = entry(
		new Composer<Context>().filter(not(fromUser(99)), () => {
			notHits++;
		}),
	);
	await notMw(msgCtx("hi", "private", 5), noop); // from 5 → allowed
	await notMw(msgCtx("hi", "private", 99), noop); // from 99 → blocked

	assert.equal(notHits, 1);
});

test("not() and failed and() do not leak attached data downstream", async () => {
	const seen: (string | undefined)[] = [];
	const probe = (ctx: Context) => {
		seen.push((ctx as Context & { command?: string }).command);
	};

	// not(command("a")) on "/a": command matches+attaches, not rejects → branch skipped,
	// but ctx.command must NOT leak to the downstream use()
	const notMw = entry(new Composer<Context>().filter(not(command("a")), () => {}).use(probe));
	await notMw(msgCtx("/a"), noop);

	// and(command("a"), fromUser(999)) on "/a" from user 1: command attaches, fromUser fails →
	// the whole and rejects and must roll back command/args
	const andMw = entry(
		new Composer<Context>().filter(and(command("a"), fromUser(999)), () => {}).use(probe),
	);
	await andMw(msgCtx("/a", "private", 1), noop);

	assert.deepEqual(seen, [undefined, undefined]); // no leak in either case
});

test("scoped derive runs only for the listed update types", async () => {
	const tags: (number | undefined)[] = [];

	const mw = entry(
		new Composer<Context>()
			.derive("message", () => ({ tag: 7 }))
			.use((ctx) => {
				tags.push((ctx as Context & { tag?: number }).tag);
			}),
	);
	await mw(msgCtx("hi"), noop); // message → derived
	await mw(cbCtx(), noop); // callback_query → skipped

	assert.deepEqual(tags, [7, undefined]);
});
