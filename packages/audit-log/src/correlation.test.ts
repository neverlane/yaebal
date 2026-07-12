import assert from "node:assert/strict";
import test from "node:test";
import {
	beginCall,
	currentCorrelation,
	endCall,
	newCorrelationId,
	runWithCorrelation,
} from "./correlation.js";

test("newCorrelationId produces distinct ids", () => {
	const a = newCorrelationId();
	const b = newCorrelationId();
	assert.notEqual(a, b);
	assert.ok(a.length > 0);
});

test("runWithCorrelation makes the store visible via currentCorrelation() for the duration of fn, and not after", {
	timeout: 5000,
}, async () => {
	assert.equal(currentCorrelation(), undefined);

	await runWithCorrelation({ updateId: 1, correlationId: "corr-1" }, async () => {
		assert.deepEqual(currentCorrelation(), { updateId: 1, correlationId: "corr-1" });
	});

	assert.equal(currentCorrelation(), undefined);
});

test("runWithCorrelation isolates concurrent stores from each other", {
	timeout: 5000,
}, async () => {
	const seen: string[] = [];

	await Promise.all([
		runWithCorrelation({ updateId: 1, correlationId: "a" }, async () => {
			await new Promise((r) => setTimeout(r, 10));
			seen.push(currentCorrelation()?.correlationId ?? "?");
		}),
		runWithCorrelation({ updateId: 2, correlationId: "b" }, async () => {
			seen.push(currentCorrelation()?.correlationId ?? "?");
		}),
	]);

	assert.deepEqual(seen.sort(), ["a", "b"]);
});

test("beginCall assigns a fresh callId + attempt 1 to a new params object", () => {
	const params = { text: "hi" };
	const { callId, attempt } = beginCall(params);
	assert.equal(attempt, 1);
	assert.ok(callId.length > 0);
});

test("beginCall on the same params reference increments attempt and keeps the callId — the retry case", () => {
	const params = { text: "hi" };
	const first = beginCall(params);
	const second = beginCall(params);
	const third = beginCall(params);

	assert.equal(first.callId, second.callId);
	assert.equal(second.callId, third.callId);
	assert.equal(first.attempt, 1);
	assert.equal(second.attempt, 2);
	assert.equal(third.attempt, 3);
});

test("beginCall on two different params objects assigns two different callIds", () => {
	const a = beginCall({ text: "a" });
	const b = beginCall({ text: "b" });
	assert.notEqual(a.callId, b.callId);
});

test("beginCall with undefined params (a no-arg method) never tracks attempts across calls", () => {
	const a = beginCall(undefined);
	const b = beginCall(undefined);
	assert.equal(a.attempt, 1);
	assert.equal(b.attempt, 1);
	assert.notEqual(a.callId, b.callId);
});

test("endCall returns the callId + elapsed time, and clears the tracking entry", async () => {
	const params = { text: "hi" };
	const begun = beginCall(params);

	await new Promise((r) => setTimeout(r, 5));

	const ended = endCall(params);
	assert.equal(ended?.callId, begun.callId);
	assert.ok(ended && ended.durationMs >= 0);

	// tracking was cleared — a fresh beginCall on the same reference starts a new call
	const restarted = beginCall(params);
	assert.notEqual(restarted.callId, begun.callId);
	assert.equal(restarted.attempt, 1);
});

test("endCall on an untracked (or undefined) params returns undefined instead of throwing", () => {
	assert.equal(endCall(undefined), undefined);
	assert.equal(endCall({ never: "tracked" }), undefined);
});
