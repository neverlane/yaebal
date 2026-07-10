import assert from "node:assert/strict";
import test from "node:test";
import {
	type KVNamespaceLike,
	kvStorage,
	MemoryStorage,
	type RedisLike,
	redisStorage,
	sqliteStorage,
} from "./index.js";

test("MemoryStorage round-trips, deletes, reports has", () => {
	const s = new MemoryStorage<number>();

	s.set("a", 1);
	assert.equal(s.get("a"), 1);
	assert.equal(s.has("a"), true);

	s.delete("a");
	assert.equal(s.get("a"), undefined);
	assert.equal(s.has("a"), false);
});

test("MemoryStorage clones by default — references can't mutate stored state", () => {
	const s = new MemoryStorage<{ n: number }>();
	const original = { n: 1 };

	s.set("k", original);
	original.n = 99;
	assert.equal(s.get("k")?.n, 1); // set() detached from the caller's object

	const read = s.get("k");
	if (read) read.n = 42;
	assert.equal(s.get("k")?.n, 1); // get() hands out a copy too
});

test("MemoryStorage clone: false shares references (opt-in)", () => {
	const s = new MemoryStorage<{ n: number }>({ clone: false });
	const value = { n: 1 };

	s.set("k", value);
	value.n = 2;
	assert.equal(s.get("k")?.n, 2);
});

test("MemoryStorage ttl expires lazily and touch refreshes", () => {
	let t = 0;
	const s = new MemoryStorage<string>({ ttl: 100, now: () => t });

	s.set("k", "v");
	t = 100;
	assert.equal(s.get("k"), "v"); // exactly at ttl — still alive

	s.touch("k");
	t = 200;
	assert.equal(s.get("k"), "v"); // touch pushed expiry to 100+100

	t = 301;
	assert.equal(s.get("k"), undefined);
	assert.equal(s.has("k"), false);
});

test("MemoryStorage max evicts least-recently-used", () => {
	const s = new MemoryStorage<number>({ max: 2 });

	s.set("a", 1);
	s.set("b", 2);
	s.get("a"); // refresh a's recency — b is now the eviction candidate
	s.set("c", 3);

	assert.equal(s.get("a"), 1);
	assert.equal(s.get("b"), undefined);
	assert.equal(s.get("c"), 3);
});

function fakeRedis() {
	const store = new Map<string, string>();
	const expires = new Map<string, number>();

	const client: RedisLike = {
		async get(key) {
			return store.get(key) ?? null;
		},
		async set(key, value) {
			store.set(key, value);
		},
		async del(key) {
			store.delete(key);
			expires.delete(key);
		},
		async expire(key, seconds) {
			expires.set(key, seconds);
		},
	};

	return { client, store, expires };
}

test("redisStorage serializes, prefixes and deletes", async () => {
	const { client, store } = fakeRedis();
	const s = redisStorage<{ n: number }>(client, { prefix: "app:" });

	await s.set("k", { n: 5 });
	assert.equal(store.get("app:k"), JSON.stringify({ n: 5 }));
	assert.deepEqual(await s.get("k"), { n: 5 });
	assert.equal(await s.has?.("k"), true);

	await s.delete("k");
	assert.equal(await s.get("k"), undefined);
	assert.equal(await s.has?.("k"), false);
});

test("redisStorage ttl sets EXPIRE (rounded up) and advertises touch", async () => {
	const { client, expires } = fakeRedis();
	const s = redisStorage<string>(client, { ttl: 1500 });

	await s.set("k", "v");
	assert.equal(expires.get("k"), 2); // 1500ms → ceil → 2s

	assert.equal(typeof s.touch, "function");
	expires.delete("k");
	await s.touch?.("k");
	assert.equal(expires.get("k"), 2);
});

test("redisStorage without ttl does not advertise touch", () => {
	const { client } = fakeRedis();
	assert.equal(redisStorage(client).touch, undefined);
});

const sqlite = await import("node:sqlite").then(
	(m) => m,
	() => undefined,
);

test("sqliteStorage round-trips, expires and touches", { skip: sqlite === undefined }, () => {
	if (sqlite === undefined) return;

	const db = new sqlite.DatabaseSync(":memory:");
	let t = 0;
	const s = sqliteStorage<{ n: number }>(db, { ttl: 100, now: () => t });

	s.set("k", { n: 1 });
	assert.deepEqual(s.get("k"), { n: 1 });
	assert.equal(s.has?.("k"), true);

	t = 99;
	s.touch?.("k");
	t = 150;
	assert.deepEqual(s.get("k"), { n: 1 }); // touch moved expiry to 99+100

	t = 200;
	assert.equal(s.get("k"), undefined);

	s.set("k2", { n: 2 });
	s.delete("k2");
	assert.equal(s.get("k2"), undefined);
});

test("sqliteStorage rejects a hostile table name", { skip: sqlite === undefined }, () => {
	if (sqlite === undefined) return;

	const db = new sqlite.DatabaseSync(":memory:");
	assert.throws(() => sqliteStorage(db, { table: "x; DROP TABLE users" }), /invalid table name/);
});

function fakeKv() {
	const store = new Map<string, { value: string; ttl?: number }>();

	const kv: KVNamespaceLike = {
		async get(key, _type) {
			return store.get(key)?.value ?? null;
		},
		async put(key, value, options) {
			store.set(key, { value, ttl: options?.expirationTtl });
		},
		async delete(key) {
			store.delete(key);
		},
	};

	return { kv, store };
}

test("kvStorage round-trips and clamps ttl to cloudflare's 60s minimum", async () => {
	const { kv, store } = fakeKv();
	const s = kvStorage<{ n: number }>(kv, { prefix: "s:", ttl: 5_000 });

	await s.set("k", { n: 7 });
	assert.equal(store.get("s:k")?.ttl, 60); // 5s requested, clamped to the kv minimum
	assert.deepEqual(await s.get("k"), { n: 7 });
	assert.equal(await s.has?.("k"), true);

	await s.delete("k");
	assert.equal(await s.get("k"), undefined);

	assert.equal(s.touch, undefined); // kv has no cheap ttl refresh
});
