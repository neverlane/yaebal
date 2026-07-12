import assert from "node:assert/strict";
import test from "node:test";
import { Composer, type Context } from "@yaebal/core";
import { MemoryStorage, type StorageAdapter, sqliteStorage } from "@yaebal/sklad";
import { createTestEnv } from "@yaebal/test";
import { type CacheEvent, cache, createCache } from "./index.js";

const sqlite = await import("node:sqlite").then(
	(m) => m,
	() => undefined,
);

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
	const storage = new MemoryStorage();
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

test("wrap never caches a rejected fn (no errorTtl)", async () => {
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

// ── stale-while-revalidate ──────────────────────────────────────────────

test("wrap serves the stale value immediately and revalidates once in the background", async () => {
	let now = 0;
	let calls = 0;
	const c = createCache({ now: () => now });
	const fn = async () => `v${++calls}`;

	assert.equal(await c.wrap("k", fn, { ttl: 100, staleTtl: 1000 }), "v1");

	now = 150; // past ttl, within the stale window
	assert.equal(await c.wrap("k", fn, { ttl: 100, staleTtl: 1000 }), "v1"); // stale, returned immediately
	await new Promise((r) => setImmediate(r)); // let the background revalidation settle

	assert.equal(calls, 2);
	assert.equal(await c.get("k"), "v2"); // revalidated value is now fresh
});

test("wrap dedupes concurrent stale-triggered revalidations into one background call", {
	timeout: 2000,
}, async () => {
	let now = 0;
	let calls = 0;
	const c = createCache({ now: () => now });
	const fn = async () => {
		calls++;
		await new Promise((r) => setTimeout(r, 5));
		return `v${calls}`;
	};

	await c.wrap("k", fn, { ttl: 100, staleTtl: 1000 });
	now = 150;

	const [a, b] = await Promise.all([
		c.wrap("k", fn, { ttl: 100, staleTtl: 1000 }),
		c.wrap("k", fn, { ttl: 100, staleTtl: 1000 }),
	]);
	assert.deepEqual([a, b], ["v1", "v1"]); // both got the stale value immediately

	await new Promise((r) => setTimeout(r, 20));
	assert.equal(calls, 2); // only one revalidation ran, not two
});

test("a failing stale revalidation doesn't crash the caller and leaves the stale value servable", {
	timeout: 2000,
}, async () => {
	let now = 0;
	let calls = 0;
	const events: string[] = [];
	const c = createCache({ now: () => now, onEvent: (e) => void events.push(e.type) });
	const fn = async () => {
		calls++;
		if (calls === 1) return "v1";
		throw new Error("upstream down");
	};

	await c.wrap("k", fn, { ttl: 100, staleTtl: 1000 });
	now = 150;

	const value = await c.wrap("k", fn, { ttl: 100, staleTtl: 1000 });
	assert.equal(value, "v1"); // caller still gets the stale value even though the refresh will fail

	await new Promise((r) => setImmediate(r));
	assert.equal(calls, 2);
	assert.ok(events.includes("error")); // the failure is observable, not swallowed silently
	assert.equal(await c.get("k"), "v1"); // failed refresh left the stale entry untouched
});

test("wrap treats an entry past its stale window as a normal miss", async () => {
	let now = 0;
	let calls = 0;
	const c = createCache({ now: () => now });
	const fn = async () => `v${++calls}`;

	await c.wrap("k", fn, { ttl: 100, staleTtl: 200 });
	now = 400; // past ttl(100) + staleTtl(200)
	assert.equal(await c.wrap("k", fn, { ttl: 100, staleTtl: 200 }), "v2");
	assert.equal(calls, 2);
});

// ── sliding expiry ───────────────────────────────────────────────────────

test("sliding refreshes ttl on every hit instead of a fixed absolute expiry", async () => {
	let now = 0;
	const c = createCache({ now: () => now });
	await c.set("k", "v", { ttl: 100, sliding: true });

	now = 90;
	assert.equal(await c.get("k"), "v"); // hit refreshes expiry to 90+100

	now = 180;
	assert.equal(await c.get("k"), "v"); // still alive because of the refresh

	now = 281; // no reads since 180 — 180+100 has now passed
	assert.equal(await c.get("k"), undefined);
});

test("sliding without any resolvable ttl throws", async () => {
	const c = createCache();
	await assert.rejects(() => c.set("k", "v", { sliding: true }), RangeError);
});

test("CacheOptions.sliding sets the default for set/wrap", async () => {
	let now = 0;
	const c = createCache({ now: () => now, ttl: 100, sliding: true });
	await c.set("k", "v");

	now = 90;
	await c.get("k");
	now = 180;
	assert.equal(await c.get("k"), "v"); // refreshed by the read at t=90
});

// ── negative caching ─────────────────────────────────────────────────────

test("wrap with errorTtl remembers a rejection and re-throws it without calling fn again", async () => {
	let now = 0;
	let calls = 0;
	const c = createCache({ now: () => now });
	const fn = async () => {
		calls++;
		throw new Error("boom");
	};

	await assert.rejects(() => c.wrap("k", fn, { errorTtl: 1000 }), /boom/);
	await assert.rejects(() => c.wrap("k", fn, { errorTtl: 1000 }), /boom/);
	assert.equal(calls, 1); // the second call re-threw the tombstone, fn wasn't called again

	now = 1000;
	await assert.rejects(() => c.wrap("k", fn, { errorTtl: 1000 }), /boom/);
	assert.equal(calls, 2); // tombstone expired — fn called again
});

test("a negative-cache tombstone makes get/peek/has report a miss, not the error", async () => {
	const c = createCache();
	await assert.rejects(() =>
		c.wrap(
			"k",
			async () => {
				throw new Error("boom");
			},
			{ errorTtl: 1000 },
		),
	);

	assert.equal(await c.get("k"), undefined);
	assert.equal(await c.peek("k"), undefined);
	assert.equal(await c.has("k"), false);
});

test("onEvent reports negative-hit for a tombstoned key", async () => {
	const events: string[] = [];
	const c = createCache({ onEvent: (e) => void events.push(e.type) });
	const fn = async () => {
		throw new Error("boom");
	};

	await assert.rejects(() => c.wrap("k", fn, { errorTtl: 1000 }));
	await assert.rejects(() => c.wrap("k", fn, { errorTtl: 1000 }));

	assert.ok(events.includes("negative-hit"));
});

// ── invalidation ─────────────────────────────────────────────────────────

test("invalidatePrefix drops every key starting with the prefix, and only those", async () => {
	const c = createCache();
	await c.set("chat:1", "a");
	await c.set("chat:2", "b");
	await c.set("user:1", "c");

	await c.invalidatePrefix("chat:");

	assert.equal(await c.get("chat:1"), undefined);
	assert.equal(await c.get("chat:2"), undefined);
	assert.equal(await c.get("user:1"), "c");
});

test("clear drops every key under this cache's scope, without touching a sibling scope", async () => {
	const storage = new MemoryStorage();
	const a = createCache({ storage, scope: "a" });
	const b = createCache({ storage, scope: "b" });

	await a.set("k", "from-a");
	await b.set("k", "from-b");
	await a.clear();

	assert.equal(await a.get("k"), undefined);
	assert.equal(await b.get("k"), "from-b");
});

test("invalidatePrefix throws when the storage adapter can't enumerate keys", async () => {
	const storage: StorageAdapter<unknown> = {
		get: async () => undefined,
		set: async () => {},
		delete: async () => {},
	};
	const c = createCache({ storage });
	await assert.rejects(() => c.invalidatePrefix(""), /enumeration/);
});

test("invalidatePrefix works against sqliteStorage", { skip: sqlite === undefined }, async () => {
	if (sqlite === undefined) return;

	const db = new sqlite.DatabaseSync(":memory:");
	const c = createCache({ storage: sqliteStorage(db) });

	await c.set("chat:1", "a");
	await c.set("chat:2", "b");
	await c.set("user:1", "c");
	await c.invalidatePrefix("chat:");

	assert.equal(await c.get("chat:1"), undefined);
	assert.equal(await c.get("user:1"), "c");
});

// ── batch ────────────────────────────────────────────────────────────────

test("setMany writes several entries at once, getMany reads back only the live ones", async () => {
	let now = 0;
	const c = createCache({ now: () => now });

	await c.setMany([
		{ key: "a", value: 1 },
		{ key: "b", value: 2, ttl: 10 },
	]);

	now = 20; // "b" expired
	const result = await c.getMany(["a", "b", "missing"]);

	assert.equal(result.get("a"), 1);
	assert.equal(result.has("b"), false);
	assert.equal(result.has("missing"), false);
	assert.equal(result.size, 1);
});

// ── namespaces ───────────────────────────────────────────────────────────

test("namespace prefixes every key, transparently to the caller", async () => {
	const c = createCache();
	const ns = c.namespace("ns:");

	await ns.set("k", "v");
	assert.equal(await c.get("ns:k"), "v");
	assert.equal(await ns.get("k"), "v");
});

test("forChat is sugar for namespace(chat:<id>:)", async () => {
	const c = createCache();
	await c.forChat(42).set("info", "hello");
	assert.equal(await c.get("chat:42:info"), "hello");
});

test("namespace.clear only drops that namespace's keys", async () => {
	const c = createCache();
	await c.set("other", "keep");

	const ns = c.namespace("ns:");
	await ns.set("a", 1);
	await ns.set("b", 2);
	await ns.clear();

	assert.equal(await ns.get("a"), undefined);
	assert.equal(await ns.get("b"), undefined);
	assert.equal(await c.get("other"), "keep");
});

test("nested namespaces compose their prefixes", async () => {
	const c = createCache();
	await c.namespace("a:").namespace("b:").set("k", "v");
	assert.equal(await c.get("a:b:k"), "v");
});

// ── observability must never break the data path (bug fix) ─────────────

test("a throwing onEvent never breaks the cache call that triggered it", async () => {
	const c = createCache({
		onEvent: (event) => {
			if (event.type === "store") throw new Error("metrics down");
		},
	});

	const originalConsoleError = console.error;
	let logged: unknown;
	console.error = (...args: unknown[]) => {
		logged = args;
	};

	try {
		const value = await c.wrap("k", async () => "precious");
		assert.equal(value, "precious"); // the fn's result survives a broken observer
	} finally {
		console.error = originalConsoleError;
	}

	assert.ok(logged); // the observer's failure is still surfaced, just not thrown
});

// ── metrics accuracy (bug fixes) ────────────────────────────────────────

test("a caller that catches a fetch already in flight additionally emits dedupe (not a silent duplicate fetch)", {
	timeout: 2000,
}, async () => {
	const events: string[] = [];
	const c = createCache({ onEvent: (e) => void events.push(e.type) });
	let calls = 0;
	const fn = async () => {
		calls++;
		await new Promise((r) => setTimeout(r, 5));
		return "v";
	};

	await Promise.all([c.wrap("k", fn), c.wrap("k", fn)]);

	// both callers raced through storage before either claimed the fetch, so both honestly
	// report "miss" (storage had nothing when *they* looked) — but exactly one "dedupe" shows
	// up too, for whichever caller found the other's fetch already registered. what actually
	// matters — fn running once, not twice — is asserted directly below.
	assert.deepEqual(
		events.filter((t) => t === "miss" || t === "dedupe"),
		["miss", "miss", "dedupe"],
	);
	assert.equal(calls, 1);
});

test("get emits hit/miss events, not just wrap", async () => {
	const events: string[] = [];
	const c = createCache({ onEvent: (e) => void events.push(e.type) });

	await c.set("k", "v");
	await c.get("k");
	await c.get("missing");

	assert.deepEqual(
		events.filter((t) => t === "hit" || t === "miss"),
		["hit", "miss"],
	);
});

test("has emits hit/miss events too", async () => {
	const events: string[] = [];
	const c = createCache({ onEvent: (e) => void events.push(e.type) });

	await c.set("k", "v");
	await c.has("k");
	await c.has("missing");

	assert.deepEqual(
		events.filter((t) => t === "hit" || t === "miss"),
		["hit", "miss"],
	);
});

test("cache events carry both the logical key and the scoped key", async () => {
	const events: CacheEvent[] = [];
	const c = createCache({ scope: "bot1", onEvent: (e) => void events.push(e) });

	await c.set("a", 1);
	const stored = events.find((e) => e.type === "store");

	assert.equal(stored?.key, "a");
	assert.equal(stored?.scopedKey, "bot1:a");
});

// ── ttl validation ───────────────────────────────────────────────────────

test("a non-finite or non-positive ttl throws instead of silently meaning something else", async () => {
	const c = createCache();
	await assert.rejects(() => c.set("k", "v", Number.NaN), RangeError);
	await assert.rejects(() => c.set("k", "v", -100), RangeError);
	await assert.rejects(() => c.set("k", "v", 0), RangeError);
	await assert.rejects(() => c.set("k", "v", Number.POSITIVE_INFINITY), RangeError);
});

test("createCache validates its default ttl eagerly, at construction", () => {
	assert.throws(() => createCache({ ttl: Number.NaN }), RangeError);
});

// ── bounded default memory ──────────────────────────────────────────────

test("the default store is LRU-capped so unbounded keys can't leak memory forever", async () => {
	const c = createCache({ max: 2 });
	await c.set("a", 1);
	await c.set("b", 2);
	await c.get("a"); // refresh a's recency
	await c.set("c", 3);

	assert.equal(await c.get("a"), 1);
	assert.equal(await c.get("b"), undefined);
	assert.equal(await c.get("c"), 3);
});

test("active sweep reclaims expired entries in the background, and dispose stops future sweeps", {
	timeout: 3000,
}, async () => {
	let now = 0;
	const storage = new MemoryStorage();
	const c = createCache({ storage, now: () => now, sweepIntervalMs: 20 });

	await c.set("a", 1, 10);
	now = 100; // logically expired, but nobody has read it — lazy eviction never triggers
	await new Promise((r) => setTimeout(r, 60));
	assert.equal(storage.size, 0); // swept away without a read

	c.dispose();
	await c.set("b", 1, 10);
	now = 200;
	await new Promise((r) => setTimeout(r, 60));
	assert.equal(storage.size, 1); // no sweep ran after dispose
});

// ── peek ─────────────────────────────────────────────────────────────────

test("peek distinguishes a cached undefined from a genuine miss", async () => {
	const c = createCache();
	await c.set("k", undefined);

	assert.deepEqual(await c.peek("k"), { value: undefined });
	assert.equal(await c.peek("missing"), undefined);
	assert.equal(await c.has("k"), true); // has agrees a live entry exists
});

test("wrap caching an undefined result only calls fn once", async () => {
	const c = createCache();
	let calls = 0;
	const fn = async () => {
		calls++;
		return undefined;
	};

	await c.wrap("u", fn);
	await c.wrap("u", fn);

	assert.equal(calls, 1);
	assert.deepEqual(await c.peek("u"), { value: undefined });
});

// ── typed keys ───────────────────────────────────────────────────────────

test("typed keys: a mismatched value/return doesn't typecheck (enforced by `pnpm typecheck`)", async () => {
	interface ChatInfo {
		title: string;
	}
	interface Schema {
		flags: boolean;
		[key: `chat:${number}`]: ChatInfo;
	}

	const typed = createCache<Schema>();
	await typed.set("chat:1", { title: "ok" });
	// @ts-expect-error — a cataloged key's value is checked against the schema. a separate key,
	// never read back below: `@ts-expect-error` only suppresses the compiler, not the runtime
	// call, so reusing "chat:1" here would silently clobber the assertion below with "nope".
	await typed.set("chat:99", "nope");

	await typed.wrap("chat:2", async () => ({ title: "ok" }));
	// @ts-expect-error — a cataloged key's wrap result is checked against the schema too
	await typed.wrap("chat:98", async () => "nope");

	const chat = await typed.get("chat:1");
	assert.equal(chat?.title, "ok");

	// keys outside the catalog stay free-form, exactly like a schema-less cache
	await typed.set("anything", 123);
	assert.equal(await typed.get<number>("anything"), 123);
});
