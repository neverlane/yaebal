import assert from "node:assert/strict";
import test from "node:test";
import { Composer, type Context } from "@yaebal/core";
import { createTestEnv } from "@yaebal/test";
import { p } from "./catalog.js";
import { analytics, createAnalytics, fromEvent } from "./index.js";
import type { AnalyticsAdapter, AnalyticsEvent } from "./types.js";

function fakeAdapter() {
	const events: AnalyticsEvent[] = [];
	const adapter: AnalyticsAdapter = { track: (event) => void events.push(event) };
	return { adapter, events };
}

test("ctx.track forwards name, properties, userId and chatId to every adapter (untyped mode)", async () => {
	const { adapter, events } = fakeAdapter();

	const bot = new Composer<Context>()
		.install(analytics({ adapters: [adapter] }))
		.command("start", (ctx) => {
			ctx.track("start", { source: "deeplink" });
			return ctx.reply("hi");
		});

	await createTestEnv(bot).createUser({ id: 42 }).sendCommand("start");

	assert.equal(events.length, 1);
	assert.equal(events[0]?.name, "start");
	assert.deepEqual(events[0]?.properties, { source: "deeplink" });
	assert.equal(events[0]?.userId, 42);
	assert.equal(typeof events[0]?.timestamp, "number");
});

test("ctx.track validates against a typed events catalog", async () => {
	const { adapter, events } = fakeAdapter();

	const bot = new Composer<Context>()
		.install(
			analytics({
				adapters: [adapter],
				events: { purchase: { props: p.object({ amount: p.number() }) } },
			}),
		)
		.command("buy", (ctx) => {
			ctx.track("purchase", { amount: 9 });
			return ctx.reply("ok");
		});

	await createTestEnv(bot).createUser().sendCommand("buy");

	assert.deepEqual(events[0]?.properties, { amount: 9 });
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
	await Promise.resolve(); // let the rejected adapter's microtask settle

	assert.equal(ok.events.length, 1);
	assert.equal(errors.length, 2);
});

test("plugin.flush() awaits every adapter's flush", async () => {
	const flushed: string[] = [];
	const a: AnalyticsAdapter = { track: () => {}, flush: () => void flushed.push("a") };
	const b: AnalyticsAdapter = { track: () => {}, flush: async () => void flushed.push("b") };
	const noFlush: AnalyticsAdapter = { track: () => {} };

	const plugin = analytics({ adapters: [a, b, noFlush] });
	await plugin.flush();

	assert.deepEqual(flushed.sort(), ["a", "b"]);
});

test("ctx.identify forwards to every adapter's identify with ctx.from.id; no-op without a user", async () => {
	const identified: Array<[string, Record<string, unknown>]> = [];
	const adapter: AnalyticsAdapter = {
		track: () => {},
		identify: (id, properties) => void identified.push([id, properties]),
	};

	const bot = new Composer<Context>()
		.install(analytics({ adapters: [adapter] }))
		.command("start", (ctx) => {
			ctx.identify({ plan: "pro" });
			return ctx.reply("hi");
		});

	await createTestEnv(bot).createUser({ id: 7 }).sendCommand("start");

	assert.deepEqual(identified, [["7", { plan: "pro" }]]);
});

test("the context() enricher merges extra properties onto every ctx.track call", async () => {
	const { adapter, events } = fakeAdapter();

	const bot = new Composer<Context>()
		.install(
			analytics({
				adapters: [adapter],
				context: (ctx) => ({ languageCode: ctx.from?.language_code }),
			}),
		)
		.command("start", (ctx) => {
			ctx.track("start", { foo: "bar" });
			return ctx.reply("hi");
		});

	await createTestEnv(bot).createUser({ languageCode: "ru" }).sendCommand("start");

	assert.deepEqual(events[0]?.properties, { languageCode: "ru", foo: "bar" });
});

test("createAnalytics is a standalone client usable outside of ctx", async () => {
	const { adapter, events } = fakeAdapter();
	const client = createAnalytics({ adapters: [adapter] });

	client.track({ name: "job_completed", properties: { total: 3 } });
	await client.flush();

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
	await client.flush();

	assert.equal(events.length, 2);
	assert.equal(events[0]?.name, "broadcast.job_completed");
	assert.deepEqual(events[0]?.properties, { jobId: "j1" });
	assert.equal(events[1]?.name, "start");
});

test("plugin.flush() also drains a shared client passed via analytics(client)", async () => {
	const flushed: string[] = [];
	const adapter: AnalyticsAdapter = { track: () => {}, flush: () => void flushed.push("done") };
	const client = createAnalytics({ adapters: [adapter] });

	const plugin = analytics(client);
	await plugin.flush();

	assert.deepEqual(flushed, ["done"]);
});

// ── auto bot.onStop wiring ──────────────────────────────────────────────────────────────────

class FakeBot extends Composer<Context> {
	stopHandlers: Array<() => unknown> = [];
	onStop(handler: () => unknown): this {
		this.stopHandlers.push(handler);
		return this;
	}
}

test("analytics() wires bot.onStop to flush() when installed on a Bot-like composer", async () => {
	const flushed: string[] = [];
	const adapter: AnalyticsAdapter = { track: () => {}, flush: () => void flushed.push("flushed") };
	const bot = new FakeBot();

	const plugin = analytics({ adapters: [adapter] });
	const out = plugin(bot as unknown as Composer<Context>);

	assert.equal(out, bot, "the plugin must chain on (and return) the same composer it was given");
	assert.equal(bot.stopHandlers.length, 1);

	await bot.stopHandlers[0]?.();
	assert.deepEqual(flushed, ["flushed"]);
});

test("analytics() degrades gracefully on a bare Composer — no onStop, .flush() still works manually", async () => {
	const flushed: string[] = [];
	const adapter: AnalyticsAdapter = { track: () => {}, flush: () => void flushed.push("flushed") };
	const composer = new Composer<Context>();

	const plugin = analytics({ adapters: [adapter] });
	assert.doesNotThrow(() => plugin(composer));

	await plugin.flush();
	assert.deepEqual(flushed, ["flushed"]);
});

// ── catalog validation surfaces through the plugin too ──────────────────────────────────────

test("an invalid catalog throws when analytics() is called, not on first update", () => {
	assert.throws(() => analytics({ adapters: [], events: { "not valid": true } }), /event name/);
});
