import assert from "node:assert/strict";
import test from "node:test";
import { split } from "./index.js";

test("short text is returned as a single chunk", () => {
	assert.deepEqual(split("hello"), ["hello"]);
	assert.deepEqual(split(""), [""]);
});

test("splits on newlines, each chunk within the limit", () => {
	const lines = Array.from({ length: 10 }, (_, i) => `line ${i} ${"x".repeat(40)}`);
	const text = lines.join("\n");
	const chunks = split(text, 100);

	for (const c of chunks) assert.ok(c.length <= 100, `chunk len ${c.length}`);

	// rejoining preserves content (newline-joined chunks reconstruct the text)
	assert.equal(chunks.join("\n"), text);
});

test("a single line longer than max is hard-split", () => {
	const line = "a".repeat(250);
	const chunks = split(line, 100);

	assert.deepEqual(chunks, ["a".repeat(100), "a".repeat(100), "a".repeat(50)]);
});

test("does not split when exactly at the limit", () => {
	const text = "a".repeat(100);
	
	assert.deepEqual(split(text, 100), [text]);
});
