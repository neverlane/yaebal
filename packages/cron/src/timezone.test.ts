import assert from "node:assert/strict";
import test from "node:test";
import { validateTimeZone, zonedFields, zonedTimeToUtc } from "./timezone.js";

test("zonedFields reads UTC via the fast path", { timeout: 5000 }, () => {
	const fields = zonedFields(new Date("2026-07-12T06:30:15Z"), "UTC");
	assert.deepEqual(fields, {
		year: 2026,
		month: 7,
		day: 12,
		hour: 6,
		minute: 30,
		second: 15,
		weekday: 0,
	});
});

test("zonedFields resolves a fixed positive offset", { timeout: 5000 }, () => {
	// Europe/Moscow is UTC+3, no DST since 2014.
	const fields = zonedFields(new Date("2026-07-12T06:00:00Z"), "Europe/Moscow");
	assert.equal(fields.hour, 9);
	assert.equal(fields.day, 12);
});

test("zonedFields resolves a half-hour offset", { timeout: 5000 }, () => {
	const fields = zonedFields(new Date("2026-07-12T06:00:00Z"), "Asia/Kolkata");
	assert.equal(fields.hour, 11);
	assert.equal(fields.minute, 30);
});

test("zonedFields is DST-correct across a spring-forward/fall-back boundary", {
	timeout: 5000,
}, () => {
	// America/New_York: DST starts 2026-03-08 (spring forward, UTC-5 -> UTC-4).
	const beforeDst = zonedFields(new Date("2026-03-08T06:00:00Z"), "America/New_York");
	const afterDst = zonedFields(new Date("2026-03-08T08:00:00Z"), "America/New_York");
	assert.equal(beforeDst.hour, 1); // still EST (UTC-5)
	assert.equal(afterDst.hour, 4); // now EDT (UTC-4) — the 2am-3am wall hour never happened
});

test("zonedFields resolves weekday correctly, including a day rollover", { timeout: 5000 }, () => {
	// 2026-01-01 00:30 UTC is still 2025-12-31 (Wednesday) in New York.
	const fields = zonedFields(new Date("2026-01-01T00:30:00Z"), "America/New_York");
	assert.equal(fields.year, 2025);
	assert.equal(fields.month, 12);
	assert.equal(fields.day, 31);
	assert.equal(fields.weekday, 3); // Wednesday
});

test("validateTimeZone accepts UTC and IANA zones", { timeout: 5000 }, () => {
	assert.doesNotThrow(() => validateTimeZone("UTC"));
	assert.doesNotThrow(() => validateTimeZone("Europe/Moscow"));
	assert.doesNotThrow(() => validateTimeZone("America/New_York"));
});

test("validateTimeZone rejects an unrecognized zone", { timeout: 5000 }, () => {
	assert.throws(() => validateTimeZone("Not/AZone"), RangeError);
});

test("zonedTimeToUtc is the inverse of zonedFields for a fixed positive offset", {
	timeout: 5000,
}, () => {
	const utc = zonedTimeToUtc(2026, 7, 12, 9, 0, 0, "Europe/Moscow");
	assert.equal(utc.toISOString(), "2026-07-12T06:00:00.000Z");
	assert.deepEqual(zonedFields(utc, "Europe/Moscow").hour, 9);
});

test("zonedTimeToUtc is the inverse of zonedFields for a negative offset", {
	timeout: 5000,
}, () => {
	const utc = zonedTimeToUtc(2026, 1, 12, 9, 0, 0, "America/New_York");
	assert.equal(utc.toISOString(), "2026-01-12T14:00:00.000Z");
});

test("zonedTimeToUtc handles UTC via the fast path", { timeout: 5000 }, () => {
	const utc = zonedTimeToUtc(2026, 7, 12, 9, 30, 0, "UTC");
	assert.equal(utc.toISOString(), "2026-07-12T09:30:00.000Z");
});

test("zonedTimeToUtc rolls day/month overflow forward, same as Date.UTC", { timeout: 5000 }, () => {
	const utc = zonedTimeToUtc(2026, 1, 32, 0, 0, 0, "UTC"); // day 32 of January
	assert.equal(utc.toISOString(), "2026-02-01T00:00:00.000Z");
});
