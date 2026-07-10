import assert from "node:assert/strict";
import test from "node:test";
import { Composer, type Context } from "@yaebal/core";
import { apiError, createTestEnv } from "@yaebal/test";
import { type TypingControl, typing } from "./index.js";

type Ctx = Context & TypingControl;

/**
 * a `derive()`-installed plugin's context enrichment is `await fn(ctx)` — always at least one
 * microtask hop before a handler runs. so an un-awaited dispatch call hasn't reached the handler
 * (and hasn't registered its timers) by the time a synchronous `advanceTime()` scans for them.
 * yielding through a real macrotask first drains that gap.
 */
function flushMicrotasks(): Promise<void> {
	return new Promise((resolve) => setImmediate(resolve));
}

test("typing(action) sends a single sendChatAction with the given action", async () => {
	const bot = new Composer<Ctx>()
		.install(typing())
		.on("message", (ctx) => ctx.typing("upload_photo"));
	const env = createTestEnv(bot);

	await env.createUser().sendMessage("hi");

	assert.equal(env.callsTo("sendChatAction").length, 1);
	assert.equal(env.lastApiCall("sendChatAction")?.params?.action, "upload_photo");
});

test('typing() with no args defaults to the "typing" action', async () => {
	const bot = new Composer<Ctx>().install(typing()).on("message", (ctx) => ctx.typing());
	const env = createTestEnv(bot);

	await env.createUser().sendMessage("hi");

	assert.equal(env.lastApiCall("sendChatAction")?.params?.action, "typing");
});

test("typing(action) rejects when the update has no chat", async () => {
	const bot = new Composer<Ctx>().install(typing()).on("inline_query", async (ctx) => {
		await assert.rejects(ctx.typing("upload_photo"), /no chat in this update/);
	});
	const env = createTestEnv(bot);

	await env.createUser().sendInlineQuery("cats");
});

test("typing(fn) sends the action immediately and resolves to fn's result", async () => {
	const bot = new Composer<Ctx>().install(typing()).on("message", async (ctx) => {
		const result = await ctx.typing(async () => "done");
		await ctx.reply(result);
	});
	const env = createTestEnv(bot);

	await env.createUser().sendMessage("hi");

	assert.equal(env.callsTo("sendChatAction").length, 1);
	assert.equal(env.lastApiCall("sendMessage")?.params?.text, "done");
});

test("typing(fn) propagates fn's rejection and still clears the indicator", async () => {
	const bot = new Composer<Ctx>().install(typing()).on("message", async (ctx, next) => {
		await assert.rejects(
			ctx.typing(async () => {
				throw new Error("boom");
			}),
			/boom/,
		);
		await next();
	});
	const env = createTestEnv(bot);

	await env.createUser().sendMessage("hi");

	assert.equal(env.callsTo("sendChatAction").length, 1);
});

test("typing(fn) re-sends the action on an interval while fn is pending, then stops", async () => {
	const bot = new Composer<Ctx>()
		.install(typing({ intervalMs: 1000 }))
		.on("message", (ctx) =>
			ctx.typing(() => new Promise<void>((resolve) => setTimeout(resolve, 2500))),
		);
	const env = createTestEnv(bot);
	env.useFakeTimers(); // arm before the handler schedules any timer

	const dispatched = env.createUser().sendMessage("hi");
	await flushMicrotasks(); // let the handler reach ctx.typing(fn) and register its timers
	await env.advanceTime(2500); // immediate ping + fires at 1000ms and 2000ms before fn resolves
	await dispatched;

	assert.equal(env.callsTo("sendChatAction").length, 3);

	await env.advanceTime(5000); // the interval must be cleared — no further pings
	assert.equal(env.callsTo("sendChatAction").length, 3);

	env.shutdown();
});

test("typing(fn) skips the indicator gracefully when the update has no chat", async () => {
	let result: string | undefined;
	const bot = new Composer<Ctx>().install(typing()).on("inline_query", async (ctx) => {
		result = await ctx.typing(async () => "ok");
	});
	const env = createTestEnv(bot);

	await env.createUser().sendInlineQuery("cats");

	assert.equal(env.callsTo("sendChatAction").length, 0);
	assert.equal(result, "ok");
});

test("a failed keep-alive ping never aborts fn — onError observes it instead", async () => {
	const errors: unknown[] = [];
	const bot = new Composer<Ctx>()
		.install(typing({ intervalMs: 1000, onError: (error) => errors.push(error) }))
		.on("message", (ctx) =>
			ctx.typing(() => new Promise<void>((resolve) => setTimeout(resolve, 1500))),
		);
	const env = createTestEnv(bot);
	env.onApi("sendChatAction", apiError(400, "Bad Request: chat not found"));
	env.useFakeTimers();

	const dispatched = env.createUser().sendMessage("hi");
	await flushMicrotasks(); // let the handler reach ctx.typing(fn) and register its timers
	await env.advanceTime(1500);
	await assert.doesNotReject(dispatched);

	assert.ok(errors.length >= 1);

	env.shutdown();
});

test("per-call options override the plugin's defaults", async () => {
	const bot = new Composer<Ctx>()
		.install(typing({ action: "typing" }))
		.on("message", (ctx) => ctx.typing(async () => "done", { action: "record_voice" }));
	const env = createTestEnv(bot);

	await env.createUser().sendMessage("hi");

	assert.equal(env.lastApiCall("sendChatAction")?.params?.action, "record_voice");
});
