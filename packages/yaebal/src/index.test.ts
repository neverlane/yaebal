import assert from "node:assert/strict";
import test from "node:test";
import { Context, createBot, richContext } from "./index.js";

const api = {} as never;

const messageUpdate = {
	update_id: 1,
	message: {
		message_id: 5,
		date: 0,
		chat: { id: 42, type: "private" },
		from: { id: 7, is_bot: false, first_name: "u" },
		text: "hi",
	},
} as never;

test("richContext is a real Context with payload fields and shortcut methods", () => {
	const ctx = richContext(api, messageUpdate, "message");

	assert.ok(ctx instanceof Context); // satisfies the middleware's Context contract

	assert.equal(ctx.text, "hi"); // core getter still works
	assert.equal((ctx as Context & { message_id: number }).message_id, 5); // payload field grafted on
	assert.equal(typeof (ctx as Context & { react: unknown }).react, "function"); // autogen shortcut grafted on
	assert.equal(typeof ctx.send, "function"); // core method preserved
});

test("createBot returns a Bot wired with the rich factory", () => {
	const bot = createBot("123:abc");

	assert.equal(typeof bot.handleUpdate, "function");
	assert.equal(typeof bot.start, "function");
});

// compile-time proof: the typed routers narrow ctx to the rich per-update context.
// (this block only builds if the types actually flow — it's the type test.)
test("typed routers expose the generated shortcuts + narrowed fields", () => {
	const bot = createBot("123:abc");

	bot.on("message:text", (ctx) => {
		const t: string = ctx.text; // narrowed to string by the filter query

		void t;
		void ctx.react; // MessageContext shortcut — typed, not just runtime
		void ctx.editText;
	});

	bot.on("callback_query:data", (ctx) => {
		void ctx.answer; // CallbackQueryContext shortcut
	});

	bot.command("start", (ctx) => {
		const args: string[] = ctx.args;

		void args;
		void ctx.react; // command handlers get the message context
	});
	
	assert.ok(bot);
});
