import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileStorage } from "./file.js";

async function tmpPath(name: string): Promise<string> {
	const dir = await mkdtemp(join(tmpdir(), "yaebal-sklad-"));
	return join(dir, name);
}

test("fileStorage persists across instances", async () => {
	const path = await tmpPath("store.json");

	const first = fileStorage<{ n: number }>(path);
	await first.set("k", { n: 1 });

	const second = fileStorage<{ n: number }>(path);
	assert.deepEqual(await second.get("k"), { n: 1 });
	assert.equal(await second.has?.("k"), true);

	await second.delete("k");
	const third = fileStorage<{ n: number }>(path);
	assert.equal(await third.get("k"), undefined);
});

test("fileStorage creates missing directories", async () => {
	const path = join(await tmpPath("x"), "nested", "deep", "store.json");

	const s = fileStorage<string>(path);
	await s.set("k", "v");
	assert.equal(await s.get("k"), "v");
});

test("fileStorage ttl expires lazily and touch refreshes", async () => {
	let t = 0;
	const s = fileStorage<string>(await tmpPath("ttl.json"), { ttl: 100, now: () => t });

	await s.set("k", "v");
	t = 90;
	await s.touch?.("k");
	t = 150;
	assert.equal(await s.get("k"), "v"); // touch moved expiry to 90+100

	t = 191;
	assert.equal(await s.get("k"), undefined);
	assert.equal(await s.has?.("k"), false);
});

test("fileStorage hands out detached copies", async () => {
	const s = fileStorage<{ n: number }>(await tmpPath("clone.json"));

	const original = { n: 1 };
	await s.set("k", original);
	original.n = 99;

	const read = await s.get("k");
	assert.equal(read?.n, 1);
	if (read) read.n = 42;
	assert.equal((await s.get("k"))?.n, 1);
});

test("fileStorage serializes concurrent writes into a consistent document", async () => {
	const path = await tmpPath("concurrent.json");
	const s = fileStorage<number>(path);

	await Promise.all(Array.from({ length: 20 }, (_, i) => Promise.resolve(s.set(`k${i}`, i))));

	const doc = JSON.parse(await readFile(path, "utf8")) as Record<string, { v: number }>;
	assert.equal(Object.keys(doc).length, 20);
	assert.equal(await s.get("k19"), 19);
});
