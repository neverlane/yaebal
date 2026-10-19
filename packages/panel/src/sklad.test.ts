import assert from "node:assert/strict";
import test from "node:test";
import type { SkladLikeAdapter } from "./sklad.js";
import { skladPanelStore } from "./sklad.js";

/**
 * a minimal Map-backed adapter satisfying `SkladLikeAdapter<unknown>` — structurally identical
 * to `@yaebal/sklad`'s `MemoryStorage`, `redisStorage`, `sqliteStorage` and `kvStorage`. kept
 * local (no `@yaebal/sklad` runtime dependency) the same way `@yaebal/cron`'s own tests fake
 * its `CronStoreAdapter` — this package never depends on sklad at runtime, only in its types.
 */
function fakeAdapter(): SkladLikeAdapter<unknown> {
	const map = new Map<string, unknown>();
	return {
		get: (key) => map.get(key),
		set: (key, value) => {
			map.set(key, value);
		},
		delete: (key) => {
			map.delete(key);
		},
	};
}

test("skladPanelStore: records, sorts newest-first, preserves names and tracks unread", async () => {
	const store = skladPanelStore(fakeAdapter());

	await store.record({ id: 1, name: "@sam" }, { direction: "in", text: "hi", date: 10 });
	await store.record({ id: 1 }, { direction: "out", text: "yo", date: 20 }); // no name → keep "@sam"
	await store.record({ id: 2, name: "@lee" }, { direction: "in", text: "hey", date: 30 });

	const chats = await store.chats();
	assert.equal(chats[0]?.id, 2);
	assert.equal(chats.find((c) => c.id === 1)?.name, "@sam");
	assert.equal(chats.find((c) => c.id === 1)?.unread, 1); // only the "in" bumped unread

	assert.equal((await store.history(1)).length, 2);
});

test("skladPanelStore: composite (date, seq) cursor doesn't drop same-timestamp messages", async () => {
	const store = skladPanelStore(fakeAdapter());
	for (let i = 1; i <= 5; i++) {
		await store.record({ id: 1 }, { direction: "in", text: `m${i}`, date: 100 });
	}

	const page1 = await store.history(1, { limit: 2 });
	assert.deepEqual(
		page1.map((m) => m.text),
		["m4", "m5"],
	);
	const oldestSeq = page1[0]?.seq;
	assert.ok(oldestSeq !== undefined);

	const page2 = await store.history(1, { before: 100, beforeSeq: oldestSeq, limit: 2 });
	assert.deepEqual(
		page2.map((m) => m.text),
		["m2", "m3"],
	);
});

test("skladPanelStore: status/assign/pin/markRead/updateMessage/deleteChat/search", async () => {
	const store = skladPanelStore(fakeAdapter());
	await store.record(
		{ id: 1, name: "@a" },
		{ direction: "in", text: "hello world", date: 1, id: 700 },
	);

	assert.equal(await store.status(1), "open");
	await store.setStatus(1, "handled");
	assert.equal(await store.status(1), "handled");

	await store.assign(1, "alice");
	assert.equal((await store.chats())[0]?.assignedTo, "alice");
	await store.assign(1, null);
	assert.equal((await store.chats())[0]?.assignedTo, undefined);

	await store.pin(1, true);
	assert.equal((await store.chats())[0]?.pinned, true);

	assert.equal((await store.chats())[0]?.unread, 1);
	await store.markRead(1);
	assert.equal((await store.chats())[0]?.unread, 0);

	await store.updateMessage(1, 700, { text: "edited", edited: true });
	assert.equal((await store.history(1))[0]?.text, "edited");
	assert.equal((await store.history(1))[0]?.edited, true);

	assert.deepEqual(
		(await store.search?.("edited"))?.map((r) => r.message.text),
		["edited"],
	);
	assert.deepEqual(await store.search?.("nope"), []);

	await store.deleteChat(1);
	assert.equal((await store.chats()).length, 0);
	assert.equal((await store.history(1)).length, 0);
});

test("skladPanelStore.markRead only emits on a real transition (regression: SSE feedback loop)", async () => {
	const store = skladPanelStore(fakeAdapter());
	await store.record({ id: 1 }, { direction: "in", text: "hi", date: 1 });

	const seen: string[] = [];
	store.subscribe?.((e) => seen.push(e.type));

	await store.markRead(1);
	await store.markRead(1);
	await store.markRead(1);

	assert.deepEqual(seen, ["read"]);
});

test("skladPanelStore: subscribe emits record/status/chat/deleted events", async () => {
	const store = skladPanelStore(fakeAdapter());
	const seen: string[] = [];
	const off = store.subscribe?.((e) => seen.push(e.type));

	await store.record({ id: 1 }, { direction: "in", text: "hi", date: 1, id: 1 });
	await store.setStatus(1, "handled");
	await store.assign(1, "bob");
	await store.updateMessage(1, 1, { text: "hi2" });
	await store.deleteChat(1);
	off?.();
	await store.record({ id: 1 }, { direction: "in", text: "again", date: 2 });

	assert.deepEqual(seen, ["record", "status", "chat", "chat", "deleted"]);
});

test("skladPanelStore: maxHistory caps stored messages per chat", async () => {
	const store = skladPanelStore(fakeAdapter(), { maxHistory: 3 });
	for (let i = 1; i <= 5; i++) {
		await store.record({ id: 1 }, { direction: "in", text: `m${i}`, date: i });
	}

	assert.deepEqual(
		(await store.history(1)).map((m) => m.text),
		["m3", "m4", "m5"],
	);
});

test("skladPanelStore: history() returns copies, not live references", async () => {
	const store = skladPanelStore(fakeAdapter());
	await store.record({ id: 1 }, { direction: "in", text: "hi", date: 1 });

	const first = await store.history(1);
	first.push({ direction: "in", text: "injected", date: 999 });

	assert.equal((await store.history(1)).length, 1);
});

/** an async adapter that yields between read and write — like redis/kv over the network. */
function slowAdapter(map = new Map<string, unknown>()): SkladLikeAdapter<unknown> {
	const tick = () => new Promise<void>((resolve) => setImmediate(resolve));
	return {
		get: async (key) => {
			await tick();
			return structuredClone(map.get(key));
		},
		set: async (key, value) => {
			await tick();
			map.set(key, structuredClone(value));
		},
		delete: async (key) => {
			await tick();
			map.delete(key);
		},
	};
}

test("skladPanelStore: concurrent writes don't lose each other's index updates (regression)", {
	timeout: 5000,
}, async () => {
	const store = skladPanelStore(slowAdapter());

	await Promise.all([
		store.record({ id: 1, name: "@a" }, { direction: "in", text: "a", date: 1 }),
		store.record({ id: 2, name: "@b" }, { direction: "in", text: "b", date: 2 }),
		store.record({ id: 1 }, { direction: "out", text: "a2", date: 3 }),
	]);
	await Promise.all([store.pin(1, true), store.setStatus(2, "handled")]);

	const chats = await store.chats();
	assert.deepEqual(chats.map((c) => c.id).sort(), [1, 2]);
	assert.equal(chats.find((c) => c.id === 1)?.pinned, true);
	assert.equal(chats.find((c) => c.id === 2)?.status, "handled");
	assert.deepEqual(
		(await store.history(1)).map((m) => m.text),
		["a", "a2"],
	);
});

test("skladPanelStore: seq keeps growing across a restart (regression)", async () => {
	const map = new Map<string, unknown>();
	const first = skladPanelStore(slowAdapter(map));
	await first.record({ id: 1 }, { direction: "in", text: "a", date: 5 });
	await first.record({ id: 1 }, { direction: "in", text: "b", date: 5 });

	const restarted = skladPanelStore(slowAdapter(map)); // fresh process, same storage
	await restarted.record({ id: 1 }, { direction: "in", text: "c", date: 5 });

	const seqs = (await restarted.history(1)).map((m) => m.seq ?? 0);
	assert.ok(seqs[2]! > seqs[1]!, `seq must be monotonic, got ${seqs.join(",")}`);

	// the (date, seq) cursor still pages correctly through the same-second messages
	const page = await restarted.history(1, { before: 5, beforeSeq: seqs[2], limit: 5 });
	assert.deepEqual(
		page.map((m) => m.text),
		["a", "b"],
	);
});

test("skladPanelStore: limit 0 returns nothing; search is newest-first", async () => {
	const store = skladPanelStore(fakeAdapter());
	await store.record({ id: 1 }, { direction: "in", text: "hit old", date: 1 });
	await store.record({ id: 2 }, { direction: "in", text: "hit new", date: 9 });

	assert.deepEqual(await store.history(1, { limit: 0 }), []);
	const results = (await store.search?.("hit", { limit: 1 })) ?? [];
	assert.deepEqual(
		results.map((r) => r.message.text),
		["hit new"],
	);
});
