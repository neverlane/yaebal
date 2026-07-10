import assert from "node:assert/strict";
import test from "node:test";
import { Composer, type Context } from "@yaebal/core";
import { MemoryStorage } from "@yaebal/sklad";
import { createTestEnv } from "@yaebal/test";
import { type CacheEvent, cache, createCache } from "./index.js";

test("set/get roundtrips a value", async () => {
	const c = createCache();
	await c.set("a", 1);
	assert.equal(await c.get("a"), 1);
});

test("get is undefined for a missing key", async () => {
	const c = createCache();
	assert.equal(await c.get("missing"), undefined);
});

test("delete drops an entry", async () => {
	const c = createCache();
	await c.set("a", 1);
	await c.delete("a");
	assert.equal(await c.get("a"), undefined);
});

test("has reports presence without reading", async () => {
	const c = createCache();
	assert.equal(await c.has("a"), false);
	await c.set("a", 1);
	assert.equal(await c.has("a"), true);
});

test("scope namespaces keys so two caches sharing storage never collide", async () => {
	const storage = new MemoryStorage<{ value: unknown; until: number | undefined }>();
	const a = createCache({ storage, scope: "a" });
	const b = createCache({ storage, scope: "b" });

	await a.set("key", "from-a");
	await b.set("key", "from-b");

	assert.equal(await a.get("key"), "from-a");
	assert.equal(await b.get("key"), "from-b");
});

test("wrap caches the result — fn only runs once for repeated keys", async () => {
	const c = createCache();
	let calls = 0;
	const fn = async () => {
		calls++;
		return "value";
	};

	assert.equal(await c.wrap("k", fn), "value");
	assert.equal(await c.wrap("k", fn), "value");
	assert.equal(calls, 1);
});

test("wrap dedupes concurrent misses into a single in-flight call", async () => {
	const c = createCache();
	let calls = 0;
	const fn = async () => {
		calls++;
		await new Promise((r) => setTimeout(r, 5));
		return "value";
	};

	// fired back to back, before either could possibly have resolved and cached yet
	const p1 = c.wrap("k", fn);
	const p2 = c.wrap("k", fn);

	assert.deepEqual(await Promise.all([p1, p2]), ["value", "value"]);
	assert.equal(calls, 1);
});

test("wrap never caches a rejected fn", async () => {
	const c = createCache();
	let calls = 0;
	const fn = async () => {
		calls++;
		if (calls === 1) throw new Error("boom");
		return "ok";
	};

	await assert.rejects(c.wrap("k", fn));
	assert.equal(await c.wrap("k", fn), "ok");
	assert.equal(calls, 2);
});

test("entries expire after their ttl, per the configured clock", async () => {
	let now = 0;
	const c = createCache({ now: () => now });

	await c.set("a", 1, 1000);
	assert.equal(await c.get("a"), 1);

	now = 1000;
	assert.equal(await c.get("a"), undefined);
});

test("a per-call ttl overrides the cache's default ttl", async () => {
	let now = 0;
	const c = createCache({ ttl: 10_000, now: () => now });

	await c.set("a", 1, 100);
	now = 100;
	assert.equal(await c.get("a"), undefined);
});

test("omitting ttl entirely never expires", async () => {
	let now = 0;
	const c = createCache({ now: () => now });

	await c.set("a", 1);
	now = 10 ** 9;
	assert.equal(await c.get("a"), 1);
});

test("onEvent reports hit/miss/store/delete in order", async () => {
	const events: CacheEvent[] = [];
	const c = createCache({ onEvent: (event) => void events.push(event) });

	await c.wrap("a", async () => "v");
	await c.wrap("a", async () => "v");
	await c.delete("a");

	assert.deepEqual(
		events.map((e) => e.type),
		["miss", "store", "hit", "delete"],
	);
});

test("cache() installs ctx.cache, backed by the same handle it returns", async () => {
	const plugin = cache();
	let calls = 0;

	const bot = new Composer<Context>().install(plugin).command("info", async (ctx) => {
		const info = await ctx.cache.wrap("chat-info", async () => {
			calls++;
			return "info";
		});
		await ctx.reply(info);
	});

	const env = createTestEnv(bot);
	const user = env.createUser();

	await user.sendCommand("info");
	await user.sendCommand("info");

	assert.equal(env.callsTo("sendMessage").length, 2);
	assert.equal(calls, 1); // second /info hit the cache, not fn
	assert.equal(await plugin.handle.get("chat-info"), "info"); // same store, reachable via .handle
});

test("cache() accepts a pre-built Cache instance instead of options", async () => {
	const handle = createCache();
	await handle.set("warm", "value");

	const plugin = cache(handle);
	assert.equal(plugin.handle, handle);

	const bot = new Composer<Context>()
		.install(plugin)
		.command("warm", async (ctx) => ctx.reply((await ctx.cache.get<string>("warm")) ?? ""));

	const env = createTestEnv(bot);
	await env.createUser().sendCommand("warm");

	assert.equal(env.lastApiCall("sendMessage")?.params?.text, "value");
});
