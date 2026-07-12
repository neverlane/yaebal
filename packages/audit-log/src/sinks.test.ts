import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { batchSink, consoleSink, type FileSinkFs, fileSink, memorySink } from "./sinks.js";
import type { AuditApiCallEvent, AuditSink } from "./types.js";

const event = (overrides: Partial<Omit<AuditApiCallEvent, "kind">> = {}): AuditApiCallEvent => ({
	kind: "api.call",
	level: "info",
	timestamp: 1,
	callId: "c1",
	method: "sendMessage",
	params: undefined,
	attempt: 1,
	...overrides,
});

// ── consoleSink ──────────────────────────────────────────────────────────────────────────────

test("consoleSink prints the entry via console.log", () => {
	const originalLog = console.log;
	const calls: unknown[][] = [];
	console.log = (...args: unknown[]) => calls.push(args);
	try {
		consoleSink().write("hello", event());
	} finally {
		console.log = originalLog;
	}
	assert.deepEqual(calls, [["[audit-log]", "hello"]]);
});

// ── memorySink ───────────────────────────────────────────────────────────────────────────────

test("memorySink records entries and events in order", () => {
	const sink = memorySink();
	sink.write("a", event({ method: "a" }));
	sink.write("b", event({ method: "b" }));

	assert.deepEqual(sink.entries, ["a", "b"]);
	assert.equal(sink.events.length, 2);
});

test("memorySink drops the oldest entries once past its limit", () => {
	const sink = memorySink({ limit: 2 });
	sink.write("a", event());
	sink.write("b", event());
	sink.write("c", event());

	assert.deepEqual(sink.entries, ["b", "c"]);
});

test("memorySink.clear() empties the buffer", () => {
	const sink = memorySink();
	sink.write("a", event());
	sink.clear();
	assert.deepEqual(sink.entries, []);
	assert.deepEqual(sink.events, []);
});

// ── fileSink (injected fake fs — deterministic, no real disk I/O) ──────────────────────────────

function fakeFs(): FileSinkFs & { files: Map<string, string>; renamed: Array<[string, string]> } {
	const files = new Map<string, string>();
	const renamed: Array<[string, string]> = [];
	return {
		files,
		renamed,
		async appendFile(path, data) {
			files.set(path, (files.get(path) ?? "") + data);
		},
		async stat(path) {
			const content = files.get(path);
			if (content === undefined) throw new Error("ENOENT");
			return { size: content.length };
		},
		async rename(from, to) {
			renamed.push([from, to]);
			files.set(to, files.get(from) ?? "");
			files.delete(from);
		},
		async mkdir() {},
		dirname: (path) => path.split("/").slice(0, -1).join("/") || ".",
	};
}

test("fileSink appends one JSON line per entry", async () => {
	const fs = fakeFs();
	const sink = fileSink("/logs/audit.jsonl", { fs });

	await sink.write(event({ method: "a" }), event({ method: "a" }));
	await sink.write(event({ method: "b" }), event({ method: "b" }));

	const lines = (fs.files.get("/logs/audit.jsonl") ?? "").trim().split("\n");
	assert.equal(lines.length, 2);
	assert.equal(JSON.parse(lines[0] ?? "").method, "a");
	assert.equal(JSON.parse(lines[1] ?? "").method, "b");
});

test("fileSink writes a string entry (e.g. from textFormatter) as-is, not re-json-encoded", async () => {
	const fs = fakeFs();
	const sink = fileSink("/logs/audit.log", { fs });
	await sink.write("already a text line", event());
	assert.equal(fs.files.get("/logs/audit.log"), "already a text line\n");
});

test("fileSink rotates once the file exceeds maxBytes", async () => {
	const fs = fakeFs();
	const sink = fileSink("/logs/audit.jsonl", { fs, maxBytes: 10 });

	await sink.write("this line is definitely over ten bytes", event());

	assert.equal(fs.renamed.length, 1);
	assert.deepEqual(fs.renamed[0], ["/logs/audit.jsonl", "/logs/audit.jsonl.1"]);
});

test("fileSink writes are serialized — no interleaving under concurrent write()s", async () => {
	const fs = fakeFs();
	const sink = fileSink("/logs/audit.jsonl", { fs });

	await Promise.all([
		sink.write(event({ method: "a" }), event({ method: "a" })),
		sink.write(event({ method: "b" }), event({ method: "b" })),
		sink.write(event({ method: "c" }), event({ method: "c" })),
	]);

	const lines = (fs.files.get("/logs/audit.jsonl") ?? "").trim().split("\n");
	assert.equal(lines.length, 3);
});

// ── fileSink (real disk, os.tmpdir()) ───────────────────────────────────────────────────────

test("fileSink writes real JSONL to disk and flush() drains the write queue", {
	timeout: 5000,
}, async () => {
	const dir = await mkdtemp(join(tmpdir(), "yaebal-audit-log-"));
	const path = join(dir, "audit.jsonl");
	try {
		const sink = fileSink(path);
		sink.write(event({ method: "sendMessage" }), event({ method: "sendMessage" }));
		await sink.flush?.();

		const content = await readFile(path, "utf8");
		const lines = content.trim().split("\n");
		assert.equal(lines.length, 1);
		assert.equal(JSON.parse(lines[0] ?? "").method, "sendMessage");
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});

// ── batchSink ────────────────────────────────────────────────────────────────────────────────

test("batchSink flushes once the buffer reaches size", async () => {
	const written: unknown[] = [];
	const inner: AuditSink = {
		write(entry) {
			written.push(entry);
		},
	};
	const sink = batchSink(inner, { size: 2 });

	await sink.write("a", event());
	assert.equal(written.length, 0, "not flushed yet — buffer below size");
	await sink.write("b", event());
	assert.equal(written.length, 2, "flushed once size was reached");
});

test("batchSink.flush() drains a partial batch and calls inner.flush()", async () => {
	const written: unknown[] = [];
	let innerFlushed = false;
	const inner: AuditSink = {
		write(entry) {
			written.push(entry);
		},
		async flush() {
			innerFlushed = true;
		},
	};
	const sink = batchSink(inner, { size: 20 });

	await sink.write("a", event());
	assert.equal(written.length, 0);

	await sink.flush?.();

	assert.equal(written.length, 1);
	assert.equal(innerFlushed, true);
});

test("batchSink flushes on its interval timer regardless of buffer size", {
	timeout: 5000,
}, async () => {
	const written: unknown[] = [];
	const inner: AuditSink = {
		write(entry) {
			written.push(entry);
		},
	};
	const sink = batchSink(inner, { size: 100, intervalMs: 20 });

	await sink.write("a", event());
	assert.equal(written.length, 0);

	await new Promise((resolve) => setTimeout(resolve, 60));

	assert.equal(written.length, 1);
});
