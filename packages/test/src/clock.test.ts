import assert from "node:assert/strict";
import test from "node:test";
import { installTestClock } from "./clock.js";

test("installTestClock overrides Date.now and advances on demand", async () => {
	const clock = installTestClock(1_700_000_000_000);
	try {
		assert.equal(Date.now(), 1_700_000_000_000);
		await clock.advance(5000);
		assert.equal(Date.now(), 1_700_000_005_000);
	} finally {
		clock.restore();
	}
});

test("advance() fires a setTimeout whose deadline falls inside the window", async () => {
	const clock = installTestClock();
	try {
		let fired = false;
		setTimeout(
			() => {
				fired = true;
			},
			60 * 60 * 1000,
		);

		await clock.advance(30 * 60 * 1000);
		assert.equal(fired, false);

		await clock.advance(30 * 60 * 1000);
		assert.equal(fired, true);
	} finally {
		clock.restore();
	}
});

test("advance() re-arms setInterval and may fire it multiple times", async () => {
	const clock = installTestClock();
	try {
		let count = 0;
		const id = setInterval(() => count++, 1000);

		await clock.advance(3500);
		assert.equal(count, 3);

		clearInterval(id);
		await clock.advance(10_000);
		assert.equal(count, 3);
	} finally {
		clock.restore();
	}
});

test("timers scheduled inside a firing callback are picked up by the same advance() call", async () => {
	const clock = installTestClock();
	try {
		const seen: number[] = [];

		setTimeout(() => {
			seen.push(1);
			setTimeout(() => seen.push(2), 100);
		}, 100);

		await clock.advance(500);
		assert.deepEqual(seen, [1, 2]);
	} finally {
		clock.restore();
	}
});

test("restore() puts back the real Date.now/setTimeout", () => {
	const realNow = Date.now;
	const realSetTimeout = setTimeout;

	const clock = installTestClock();
	clock.restore();

	assert.equal(Date.now, realNow);
	assert.equal(setTimeout, realSetTimeout);
});
