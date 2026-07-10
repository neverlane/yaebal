import assert from "node:assert/strict";
import test from "node:test";
import { Composer, type Context } from "@yaebal/core";
import { createTestEnv } from "@yaebal/test";
import {
	type AnalyticsAdapter,
	type AnalyticsEvent,
	analytics,
	createAnalytics,
	fromEvent,
} from "./index.js";

function fakeAdapter() {
	const events: AnalyticsEvent[] = [];
	const adapter: AnalyticsAdapter = { track: (event) => void events.push(event) };
	return { adapter, events };
}

test("ctx.track forwards name, properties, userId and chatId to every adapter", async () => {
	const { adapter, events } = fakeAdapter();

	const bot = new Composer<Context>()
		.install(analytics({ adapters: [adapter] }))
		.command("start", (ctx) => {
			ctx.track("start", { source: "deeplink" });
			return ctx.reply("hi");
		});

	const env = createTestEnv(bot);
	await env.createUser({ id: 42 }).sendCommand("start");

	assert.equal(events.length, 1);
	assert.equal(events[0]?.name, "start");
	assert.deepEqual(events[0]?.properties, { source: "deeplink" });
	assert.equal(events[0]?.userId, 42);
	assert.equal(typeof events[0]?.timestamp, "number");
});

test("dispatches to every configured adapter", async () => {
	const first = fakeAdapter();
	const second = fakeAdapter();

	const bot = new Composer<Context>()
		.install(analytics({ adapters: [first.adapter, second.adapter] }))
		.command("start", (ctx) => ctx.track("start"));

	await createTestEnv(bot).createUser().sendCommand("start");

	assert.equal(first.events.length, 1);
	assert.equal(second.events.length, 1);
});

test("a throwing or rejecting adapter is isolated via onError, other adapters still run", async () => {
	const errors: unknown[] = [];
	const ok = fakeAdapter();
	const throwing: AnalyticsAdapter = {
		track: () => {
			throw new Error("boom");
		},
	};
	const rejecting: AnalyticsAdapter = { track: () => Promise.reject(new Error("async boom")) };

	const bot = new Composer<Context>()
		.install(
			analytics({
				adapters: [throwing, rejecting, ok.adapter],
				onError: (error) => errors.push(error),
			}),
		)
		.command("start", (ctx) => ctx.track("start"));

	await createTestEnv(bot).createUser().sendCommand("start");
	// let the rejected adapter's microtask settle
	await Promise.resolve();

	assert.equal(ok.events.length, 1);
	assert.equal(errors.length, 2);
});

test("flush() awaits every adapter's flush", async () => {
	const flushed: string[] = [];
	const a: AnalyticsAdapter = { track: () => {}, flush: () => void flushed.push("a") };
	const b: AnalyticsAdapter = { track: () => {}, flush: async () => void flushed.push("b") };
	const noFlush: AnalyticsAdapter = { track: () => {} };

	const plugin = analytics({ adapters: [a, b, noFlush] });
	await plugin.flush();

	assert.deepEqual(flushed.sort(), ["a", "b"]);
});

test("createAnalytics is a standalone client usable outside of ctx", () => {
	const { adapter, events } = fakeAdapter();
	const client = createAnalytics({ adapters: [adapter] });

	client.track({ name: "job_completed", properties: { total: 3 } });

	assert.equal(events.length, 1);
	assert.equal(events[0]?.name, "job_completed");
	assert.equal(events[0]?.userId, undefined);
});

test("analytics(client) shares one Analytics instance with ctx.track", async () => {
	const { adapter, events } = fakeAdapter();
	const client = createAnalytics({ adapters: [adapter] });

	// a foreign event stream (shaped like @yaebal/broadcast's onEvent) feeding the same adapters
	client.track(fromEvent("broadcast", { type: "job_completed", jobId: "j1" }));

	const bot = new Composer<Context>()
		.install(analytics(client))
		.command("start", (ctx) => ctx.track("start"));

	await createTestEnv(bot).createUser().sendCommand("start");

	assert.equal(events.length, 2);
	assert.equal(events[0]?.name, "broadcast.job_completed");
	assert.deepEqual(events[0]?.properties, { jobId: "j1" });
	assert.equal(events[1]?.name, "start");
});

test("fromEvent prefixes the name and strips type into properties", () => {
	assert.deepEqual(fromEvent("broadcast", { type: "rate_limited", waitMs: 10 }), {
		name: "broadcast.rate_limited",
		properties: { waitMs: 10 },
	});
});
