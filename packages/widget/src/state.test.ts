import assert from "node:assert/strict";
import test from "node:test";
import { WidgetError } from "./limits.js";
import { nextRevision, widgetState } from "./state.js";

interface Votes {
	yes: number;
	no: number;
}

const isVotes = (v: unknown): v is Votes =>
	typeof v === "object" &&
	v !== null &&
	typeof (v as Votes).yes === "number" &&
	typeof (v as Votes).no === "number";

test("a plain codec round-trips json and rejects bad input", () => {
	const votes = widgetState<Votes>({ validate: isVotes });
	assert.equal(votes.revisioned, false);
	const raw = votes.encode({ yes: 1, no: 2 });
	assert.equal(raw, '{"yes":1,"no":2}');
	assert.deepEqual(votes.decode(raw), { yes: 1, no: 2 });
	assert.equal(votes.decode(null), undefined);
	assert.equal(votes.decode(undefined), undefined);
	assert.equal(votes.decode(""), undefined);
	assert.equal(votes.decode("{nope"), undefined);
	assert.equal(votes.decode('{"yes":"1"}'), undefined);
	assert.equal(votes.revisionOf(raw), undefined);
});

test("without validate anything that parses is accepted", () => {
	const any = widgetState<unknown>();
	assert.equal(any.decode("42"), 42);
	assert.equal(any.encode(undefined), "null");
});

test("encode enforces the 1024-byte limit and names the field", () => {
	const chat = widgetState<string>({ field: "chat_data" });
	assert.throws(
		() => chat.encode("x".repeat(1100)),
		(e: unknown) =>
			e instanceof WidgetError &&
			e.code === "INPUT_MEDIA_WIDGET_DATA_TOO_LARGE" &&
			/chat_data/.test(e.message),
	);
	assert.throws(() => widgetState<string>().encode("x".repeat(1100)), /public_data/);
});

test("a revisioned codec wraps values with a strictly increasing revision", () => {
	const votes = widgetState<Votes>({ revision: true, validate: isVotes });
	assert.equal(votes.revisioned, true);

	const a = votes.encode({ yes: 1, no: 0 });
	const b = votes.encode({ yes: 2, no: 0 });
	const ra = votes.revisionOf(a) as number;
	const rb = votes.revisionOf(b) as number;
	assert.ok(rb > ra);
	assert.deepEqual(JSON.parse(a), { r: ra, v: { yes: 1, no: 0 } });
	assert.deepEqual(votes.decode(b), { yes: 2, no: 0 });

	// not an envelope, or an envelope with a bad value
	assert.equal(votes.decode('{"yes":1,"no":0}'), undefined);
	assert.equal(votes.decode('{"r":"x","v":{}}'), undefined);
	assert.equal(votes.decode('{"r":1,"v":{"yes":"no"}}'), undefined);
	assert.equal(votes.decode("null"), undefined);
	assert.equal(votes.revisionOf('{"v":1}'), undefined);
	assert.equal(votes.revisionOf("nope"), undefined);
});

test("nextRevision never repeats, even within one millisecond", () => {
	const seen = new Set<number>();
	let last = 0;
	for (let i = 0; i < 1000; i++) {
		const r = nextRevision();
		assert.ok(r > last);
		seen.add(r);
		last = r;
	}
	assert.equal(seen.size, 1000);
});
