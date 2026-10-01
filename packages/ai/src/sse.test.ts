import assert from "node:assert/strict";
import test from "node:test";
import { sseData } from "./sse.js";

test("SSE accepts LF, CRLF and CR across byte boundaries and preserves data whitespace", async () => {
	for (const newline of ["\n", "\r\n", "\r"]) {
		const bytes = new TextEncoder().encode(
			[": comment", "event: delta", "data:  привет", "data: next", "", "data:", "", ""].join(
				newline,
			),
		);
		const stream = new ReadableStream<Uint8Array>({
			start(controller) {
				for (const byte of bytes) controller.enqueue(new Uint8Array([byte]));
				controller.close();
			},
		});
		const events: string[] = [];
		for await (const data of sseData(stream)) events.push(data);
		assert.deepEqual(events, [" привет\nnext", ""]);
	}
});

test("SSE cancels the source when the consumer stops early", async () => {
	let cancelled = false;
	const stream = new ReadableStream<Uint8Array>({
		start(controller) {
			controller.enqueue(new TextEncoder().encode("data: done\n\n"));
		},
		cancel() {
			cancelled = true;
		},
	});
	for await (const data of sseData(stream)) {
		assert.equal(data, "done");
		break;
	}
	assert.equal(cancelled, true);
	assert.equal(stream.locked, false);
});
