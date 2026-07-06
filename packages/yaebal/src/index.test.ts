import assert from "node:assert/strict";
import test from "node:test";
import { Context, callbackData, createBot, richContext, session } from "./index.js";

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

	bot.on("guest_message", (ctx) => {
		void ctx.answer; // GuestMessageContext shortcut — answerGuestQuery, not sendMessage
		void ctx.guest_bot_caller_user; // who summoned the guest bot
	});

	assert.ok(bot);
});

test("typed enrichment keeps generated shortcuts", () => {
	const vibe = callbackData("vibe", { score: Number });
	const bot = createBot("123:abc")
		.install(session({ initial: () => ({ fire: 0 }) }))
		.derive((ctx) => ({ who: ctx.from?.first_name ?? "friend" }));

	bot.on("message:text", (ctx) => {
		const text: string = ctx.text;
		const who: string = ctx.who;
		const fire: number = ++ctx.session.fire;

		void text;
		void who;
		void fire;
		void ctx.react;
	});

	bot.callbackQuery(vibe.pattern, (ctx) => {
		const who: string = ctx.who;
		const fire: number = ctx.session.fire;

		void who;
		void fire;
		void ctx.answer;
	});

	assert.ok(bot);
});

test("guest_message answer() posts a real message via answerGuestQuery", async () => {
	const guestUpdate = {
		update_id: 1,
		guest_message: {
			message_id: 5,
			date: 0,
			chat: { id: 42, type: "private" },
			guest_query_id: "gq1",
			guest_bot_caller_user: { id: 7, is_bot: false, first_name: "u" },
		},
	} as never;

	const calls: { method: string; params: unknown }[] = [];
	const stubApi = {
		call: (method: string, params: unknown) => {
			calls.push({ method, params });
			return Promise.resolve({ inline_message_id: "im1" });
		},
	} as never;

	const ctx = richContext(stubApi, guestUpdate, "guest_message") as Context & {
		answer: (result: unknown) => Promise<unknown>;
		guest_bot_caller_user?: { first_name: string };
	};

	assert.equal(ctx.guest_bot_caller_user?.first_name, "u");

	await ctx.answer({
		type: "article",
		id: "1",
		title: "hi",
		input_message_content: { message_text: "hi" },
	});
	assert.deepEqual(calls[0], {
		method: "answerGuestQuery",
		params: {
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
