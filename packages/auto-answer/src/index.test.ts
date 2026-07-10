import assert from "node:assert/strict";
import test from "node:test";
import { Composer, type Context } from "@yaebal/core";
import { apiError, createTestEnv } from "@yaebal/test";
import { autoAnswer } from "./index.js";

test("immediate mode: answers the moment the callback query arrives, with no handler at all", async () => {
	const bot = new Composer<Context>().install(autoAnswer());
	const env = createTestEnv(bot);

	await env.createUser().click("noop");

	assert.equal(env.callsTo("answerCallbackQuery").length, 1);
});

test("immediate mode: fires before the handler runs", async () => {
	const order: string[] = [];
	const bot = new Composer<Context>().install(autoAnswer()).on("callback_query", (_ctx, next) => {
		order.push("handler-start");
		return next();
	});
	const env = createTestEnv(bot);
	env.hooks.before.push((method) => {
		if (method === "answerCallbackQuery") order.push("answered");
	});

	await env.createUser().click("noop");

	assert.deepEqual(order, ["answered", "handler-start"]);
});

test("filter skips auto-answering for matching updates", async () => {
	const bot = new Composer<Context>().install(
		autoAnswer({ filter: (ctx) => ctx.callbackQuery.data !== "skip" }),
	);
	const env = createTestEnv(bot);

	await env.createUser().click("skip");
	assert.equal(env.callsTo("answerCallbackQuery").length, 0);

	await env.createUser().click("go");
	assert.equal(env.callsTo("answerCallbackQuery").length, 1);
});

test("static params are forwarded to answerCallbackQuery", async () => {
	const bot = new Composer<Context>().install(
		autoAnswer({ params: { text: "done", showAlert: true } }),
	);
	const env = createTestEnv(bot);

	await env.createUser().click("noop");

	const params = env.lastApiCall("answerCallbackQuery")?.params;
	assert.equal(typeof params?.callback_query_id, "string");
	assert.equal(params?.text, "done");
	assert.equal(params?.show_alert, true);
});

test("params can be computed per update", async () => {
	const bot = new Composer<Context>().install(
		autoAnswer({ params: (ctx) => ({ text: `got:${ctx.callbackQuery.data}` }) }),
	);
	const env = createTestEnv(bot);

	await env.createUser().click("hello");

	assert.equal(env.lastApiCall("answerCallbackQuery")?.params?.text, "got:hello");
});

test("deferred mode: a handler's own answer wins, no double-answer", async () => {
	const bot = new Composer<Context>()
		.install(autoAnswer({ mode: "deferred" }))
		.on("callback_query", (ctx) => ctx.answerCallbackQuery({ text: "handled" }));
	const env = createTestEnv(bot);

	await env.createUser().click("noop");

	assert.equal(env.callsTo("answerCallbackQuery").length, 1);
	assert.equal(env.lastApiCall("answerCallbackQuery")?.params?.text, "handled");
});

test("deferred mode: falls back to auto-answer when the handler forgets", async () => {
	const bot = new Composer<Context>()
		.install(autoAnswer({ mode: "deferred" }))
		.on("callback_query", (_ctx, next) => next());
	const env = createTestEnv(bot);

	await env.createUser().click("noop");

	assert.equal(env.callsTo("answerCallbackQuery").length, 1);
});

test("onAnswer observes a successful auto-answer", async () => {
	const seen: (string | undefined)[] = [];
	const bot = new Composer<Context>().install(
		autoAnswer({ onAnswer: (ctx) => seen.push(ctx.callbackQuery.data) }),
	);
	const env = createTestEnv(bot);

	await env.createUser().click("pressed");

	assert.deepEqual(seen, ["pressed"]);
});

test("a failed auto-answer never throws — onError observes it instead", async () => {
	const errors: unknown[] = [];
	const bot = new Composer<Context>().install(
		autoAnswer({ onError: (error) => errors.push(error) }),
	);
	const env = createTestEnv(bot);
	env.onApi("answerCallbackQuery", apiError(400, "Bad Request: query is too old"));

	await env.createUser().click("noop");

	assert.equal(errors.length, 1);
});
