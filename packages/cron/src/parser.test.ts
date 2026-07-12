import assert from "node:assert/strict";
import test from "node:test";
import { CronExpressionError } from "./errors.js";
import { parseCron } from "./parser.js";

test("parseCron matches minute/hour/day-of-week fields", { timeout: 5000 }, () => {
	const schedule = parseCron("30 9 * * 1-5");

	assert.equal(schedule.matches(new Date("2026-07-13T09:30:00Z")), true); // Monday
	assert.equal(schedule.matches(new Date("2026-07-11T09:30:00Z")), false); // Saturday
	assert.equal(schedule.matches(new Date("2026-07-13T09:31:00Z")), false);
});

test("parseCron supports steps and lists", { timeout: 5000 }, () => {
	const schedule = parseCron("*/15 * * * *");
	assert.deepEqual(
		[0, 15, 30, 45].map((m) => schedule.matches(new Date(Date.UTC(2026, 0, 1, 0, m)))),
		[true, true, true, true],
	);
	assert.equal(schedule.matches(new Date(Date.UTC(2026, 0, 1, 0, 10))), false);

	const list = parseCron("0,10,20 * * * *");
	assert.equal(list.matches(new Date(Date.UTC(2026, 0, 1, 0, 10))), true);
	assert.equal(list.matches(new Date(Date.UTC(2026, 0, 1, 0, 15))), false);
});

test("parseCron day-of-month/day-of-week combine with OR when both are restricted", {
	timeout: 5000,
}, () => {
	const schedule = parseCron("0 0 1 * 1"); // the 1st of the month, OR any Monday.
	assert.equal(schedule.matches(new Date("2026-07-01T00:00:00Z")), true); // 1st, a Wednesday
	assert.equal(schedule.matches(new Date("2026-07-13T00:00:00Z")), true); // a Monday, not the 1st
	assert.equal(schedule.matches(new Date("2026-07-14T00:00:00Z")), false); // neither
});

test("parseCron resolves @aliases, case-insensitively", { timeout: 5000 }, () => {
	assert.equal(parseCron("@daily").matches(new Date("2026-01-01T00:00:00Z")), true);
	assert.equal(parseCron("@Hourly").matches(new Date("2026-01-01T05:00:00Z")), true);
	assert.equal(parseCron("@HOURLY").matches(new Date("2026-01-01T05:01:00Z")), false);
});

test("parseCron('@reboot') never matches and has no periodic next run", { timeout: 5000 }, () => {
	const schedule = parseCron("@reboot");
	assert.equal(schedule.isReboot, true);
	assert.equal(schedule.matches(new Date()), false);
	assert.throws(() => schedule.next(new Date()), CronExpressionError);
});

test("parseCron.next finds the next matching minute strictly after `from`", {
	timeout: 5000,
}, () => {
	const schedule = parseCron("0 * * * *"); // top of every hour
	const next = schedule.next(new Date("2026-01-01T10:00:00Z"));
	assert.equal(next.toISOString(), "2026-01-01T11:00:00.000Z");
});

test("parseCron.next rolls to the next minute when `from` lands exactly on a boundary", {
	timeout: 5000,
}, () => {
	const schedule = parseCron("0 * * * *");
	const next = schedule.next(new Date("2026-01-01T11:00:00.000Z"));
	assert.equal(next.toISOString(), "2026-01-01T12:00:00.000Z");
});

test("parseCron accepts month and day-of-week names, case-insensitively", { timeout: 5000 }, () => {
	const schedule = parseCron("0 9 * jan mon-fri");
	assert.equal(schedule.matches(new Date("2026-01-05T09:00:00Z")), true); // Monday in January
	assert.equal(schedule.matches(new Date("2026-02-02T09:00:00Z")), false); // Monday, wrong month
	assert.equal(schedule.matches(new Date("2026-01-04T09:00:00Z")), false); // Sunday in January
});

test("parseCron rejects malformed expressions", { timeout: 5000 }, () => {
	assert.throws(() => parseCron("* * *"), CronExpressionError);
	assert.throws(() => parseCron("60 * * * *"), CronExpressionError);
	assert.throws(() => parseCron("abc * * * *"), CronExpressionError);
});

// bug fix: `Number()` coercion silently accepted garbage as a valid field value.
test("parseCron strictly rejects non-digit numeric-looking values", { timeout: 5000 }, () => {
	assert.throws(() => parseCron("-5 * * * *"), CronExpressionError); // used to parse as minutes 0-5
	assert.throws(() => parseCron("0x10 * * * *"), CronExpressionError); // used to parse as minute 16
	assert.throws(() => parseCron("1e1 * * * *"), CronExpressionError); // used to parse as minute 10
	assert.throws(() => parseCron(" * * * *"), CronExpressionError); // empty leading field
});

// bug fix: an unsatisfiable expression used to pass parseCron and only blow up later, mid-schedule
// (see scheduler.test.ts for the unhandledRejection/half-armed-start fallout this caused).
test("parseCron rejects an unsatisfiable day-of-month/month combination", { timeout: 5000 }, () => {
	assert.throws(() => parseCron("0 0 31 2 *"), CronExpressionError); // February never has 31 days
	assert.throws(() => parseCron("0 0 30 2 *"), CronExpressionError); // nor 30
});

test("parseCron allows day-of-month 29 in February (leap-year-lenient)", { timeout: 5000 }, () => {
	assert.doesNotThrow(() => parseCron("0 0 29 2 *"));
});

test("parseCron does not flag an out-of-range day-of-month when day-of-week is also restricted", {
	timeout: 5000,
}, () => {
	// OR-combined: day-of-week alone can still satisfy it every week, so this is not unsatisfiable.
	assert.doesNotThrow(() => parseCron("0 0 31 2 1"));
});

test("parseCron supports a 6-field expression with a leading seconds field", {
	timeout: 5000,
}, () => {
	const schedule = parseCron("30 0 9 * * *"); // 09:00:30 every day
	assert.equal(schedule.hasSeconds, true);
	assert.equal(schedule.matches(new Date("2026-01-01T09:00:30Z")), true);
	assert.equal(schedule.matches(new Date("2026-01-01T09:00:00Z")), false);
	assert.equal(schedule.matches(new Date("2026-01-01T09:00:31Z")), false);
});

test("parseCron 6-field next() finds the next matching second, including within the same minute", {
	timeout: 5000,
}, () => {
	const schedule = parseCron("*/20 * * * * *"); // every 20 seconds
	const next = schedule.next(new Date("2026-01-01T09:00:05Z"));
	assert.equal(next.toISOString(), "2026-01-01T09:00:20.000Z");

	const rollover = schedule.next(new Date("2026-01-01T09:00:59Z"));
	assert.equal(rollover.toISOString(), "2026-01-01T09:01:00.000Z");
});

test("parseCron tz: matches evaluates wall-clock fields in the given zone", {
	timeout: 5000,
}, () => {
	const schedule = parseCron("0 9 * * *"); // 09:00 local
	// 09:00 Moscow (UTC+3) is 06:00 UTC.
	assert.equal(schedule.matches(new Date("2026-07-12T06:00:00Z"), "Europe/Moscow"), true);
	assert.equal(schedule.matches(new Date("2026-07-12T09:00:00Z"), "Europe/Moscow"), false);
	assert.equal(schedule.matches(new Date("2026-07-12T09:00:00Z")), true); // default UTC
});

test("parseCron tz: next() resolves the next occurrence in the given zone", {
	timeout: 5000,
}, () => {
	const schedule = parseCron("0 9 * * *"); // daily at 09:00 local
	const next = schedule.next(new Date("2026-07-12T00:00:00Z"), "Europe/Moscow");
	assert.equal(next.toISOString(), "2026-07-12T06:00:00.000Z"); // 09:00 MSK == 06:00 UTC
});

test("parseCron tz: rejects an unrecognized zone lazily, at evaluation time", {
	timeout: 5000,
}, () => {
	const schedule = parseCron("0 9 * * *");
	assert.throws(() => schedule.matches(new Date(), "Not/AZone"), RangeError);
});

test("parseCron tz: skips a wall-clock time that doesn't exist on a DST spring-forward day", {
	timeout: 5000,
}, () => {
	// America/New_York jumps 2:00 -> 3:00 on 2026-03-08; 02:30 never happens that day.
	const schedule = parseCron("30 2 * * *");
	const next = schedule.next(new Date("2026-03-07T12:00:00Z"), "America/New_York");
	assert.equal(next.toISOString(), "2026-03-09T06:30:00.000Z"); // March 9, 02:30 EDT — March 8 skipped
});

test("parseCron tz: a rare schedule with a non-UTC zone resolves quickly via skip-ahead", {
	timeout: 5000,
}, () => {
	const schedule = parseCron("0 0 29 2 *"); // Feb 29 only — up to 4 years away
	const start = performance.now();
	const next = schedule.next(new Date("2027-03-01T00:00:00Z"), "Europe/Moscow");
	assert.equal(next.toISOString(), "2028-02-28T21:00:00.000Z"); // 2028-02-29 00:00 MSK
	assert.ok(
		performance.now() - start < 200,
		"must not fall back to a minute-by-minute 4-year scan",
	);
});
