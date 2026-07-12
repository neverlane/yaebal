import assert from "node:assert/strict";
import test from "node:test";
import { Composer, type Context } from "@yaebal/core";
import { createTestEnv } from "@yaebal/test";
import { memoryAdapter } from "./adapters/memory.js";
import { analyticsAdmin } from "./admin.js";
import type { AnalyticsAdapter } from "./types.js";

function seededStore() {
	const store = memoryAdapter();
	const now = Date.now();
	store.track({ name: "start", timestamp: now - 1000 });
	store.track({ name: "start", timestamp: now - 500 });
	store.track({ name: "purchase", timestamp: now - 200 });
	store.track({ name: "old_event", timestamp: now - 10 * 86_400_000 }); // outside every window
	return store;
}

test("/analytics reports the default 24h window's top events", async () => {
	const store = seededStore();
	const bot = new Composer<Context>().install(
		analyticsAdmin({ isAdmin: () => true, adapter: store }),
	);

	const env = createTestEnv(bot);
	await env.createUser().sendCommand("analytics");

	const text = env.lastApiCall("sendMessage")?.params?.text as string;
	assert.match(text, /events in the last 24h: 3/);
	assert.match(text, /start: 2/);
	assert.match(text, /purchase: 1/);
	assert.doesNotMatch(text, /old_event/);
});

test("/analytics <window> switches the lookback window", async () => {
	const store = seededStore();
	const bot = new Composer<Context>().install(
		analyticsAdmin({ isAdmin: () => true, adapter: store }),
	);

	const env = createTestEnv(bot);
	await env.createUser().sendCommand("analytics", "30d");

	const text = env.lastApiCall("sendMessage")?.params?.text as string;
	assert.match(text, /events in the last 30d: 4/, "the 30d window also catches old_event");
});

test("an unrecognized window argument replies with usage instead of guessing", async () => {
	const store = seededStore();
	const bot = new Composer<Context>().install(
		analyticsAdmin({ isAdmin: () => true, adapter: store }),
	);

	const env = createTestEnv(bot);
	await env.createUser().sendCommand("analytics", "bogus");

	assert.match(env.lastApiCall("sendMessage")?.params?.text as string, /usage:/);
});

test("isAdmin gates the command without halting the outer chain", async () => {
	const store = seededStore();
	const bot = new Composer<Context>()
		.install(analyticsAdmin({ isAdmin: (ctx) => ctx.from?.id === 1, adapter: store }))
		.command("analytics", (ctx) => ctx.reply("fallback"));

	const env = createTestEnv(bot);
	await env.createUser({ id: 2 }).sendCommand("analytics");

	assert.equal(env.lastApiCall("sendMessage")?.params?.text, "fallback");
});

test("a custom command name is honored", async () => {
	const store = seededStore();
	const bot = new Composer<Context>().install(
		analyticsAdmin({ isAdmin: () => true, adapter: store, command: "stats" }),
	);

	const env = createTestEnv(bot);
	await env.createUser().sendCommand("stats");

	assert.match(env.lastApiCall("sendMessage")?.params?.text as string, /events in the last/);
});

test("an adapter with no query() is rejected at construction, not on first command", () => {
	const noQuery: AnalyticsAdapter = { track: () => {} };
	assert.throws(() => analyticsAdmin({ isAdmin: () => true, adapter: noQuery }), /query\(\)/);
});
