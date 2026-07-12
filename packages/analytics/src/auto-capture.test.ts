import assert from "node:assert/strict";
import test from "node:test";
import { Composer, type Context } from "@yaebal/core";
import { createTestEnv } from "@yaebal/test";
import { analytics } from "./index.js";
import type { AnalyticsAdapter, AnalyticsEvent } from "./types.js";

function fakeAdapter() {
	const events: AnalyticsEvent[] = [];
	const adapter: AnalyticsAdapter = { track: (event) => void events.push(event) };
	return { adapter, events };
}

test('autoTrack: ["commands"] emits a fixed "command_used" event with the command as a property', async () => {
	const { adapter, events } = fakeAdapter();
	const bot = new Composer<Context>()
		.install(analytics({ adapters: [adapter], autoTrack: ["commands"] }))
		.command("start", (ctx) => ctx.reply("hi"));

	await createTestEnv(bot).createUser().sendCommand("start");

	assert.equal(events.length, 1);
	assert.equal(events[0]?.name, "command_used");
	assert.deepEqual(events[0]?.properties, { command: "start" });
});

test('autoTrack: ["callback_queries"] emits "callback_query" with the raw data as a property', async () => {
	const { adapter, events } = fakeAdapter();
	const bot = new Composer<Context>()
		.install(analytics({ adapters: [adapter], autoTrack: ["callback_queries"] }))
		.on("callback_query", (ctx) => ctx.answerCallbackQuery());

	const user = createTestEnv(bot).createUser();
	await user.click("noop:42");

	assert.equal(events.length, 1);
	assert.equal(events[0]?.name, "callback_query");
	assert.deepEqual(events[0]?.properties, { data: "noop:42" });
});

test('autoTrack: ["messages"] emits "message_received" with a contentType property', async () => {
	const { adapter, events } = fakeAdapter();
	const bot = new Composer<Context>().install(
		analytics({ adapters: [adapter], autoTrack: ["messages"] }),
	);

	await createTestEnv(bot).createUser().sendMessage("hello");

	assert.equal(events.length, 1);
	assert.equal(events[0]?.name, "message_received");
	assert.deepEqual(events[0]?.properties, { contentType: "text" });
});

test("a command message with both commands and messages enabled is only counted once", async () => {
	const { adapter, events } = fakeAdapter();
	const bot = new Composer<Context>()
		.install(analytics({ adapters: [adapter], autoTrack: ["commands", "messages"] }))
		.command("start", (ctx) => ctx.reply("hi"));

	await createTestEnv(bot).createUser().sendCommand("start");

	assert.equal(events.length, 1, "counted as command_used, not also message_received");
	assert.equal(events[0]?.name, "command_used");
});

test("auto-capture tracks AFTER the downstream handler has already run", async () => {
	const { adapter, events } = fakeAdapter();
	const order: string[] = [];
	const bot = new Composer<Context>()
		.install(analytics({ adapters: [adapter], autoTrack: ["commands"] }))
		.command("start", (ctx) => {
			order.push("handler");
			return ctx.reply("hi");
		});

	events.push = ((...args: AnalyticsEvent[]) => {
		order.push("track");
		return Array.prototype.push.apply(events, args);
	}) as typeof events.push;

	await createTestEnv(bot).createUser().sendCommand("start");

	assert.deepEqual(order, ["handler", "track"]);
});

test("without autoTrack, no events fire on their own — ctx.track is still manual", async () => {
	const { adapter, events } = fakeAdapter();
	const bot = new Composer<Context>()
		.install(analytics({ adapters: [adapter] }))
		.command("start", (ctx) => ctx.reply("hi"));

	await createTestEnv(bot).createUser().sendCommand("start");

	assert.equal(events.length, 0);
});
