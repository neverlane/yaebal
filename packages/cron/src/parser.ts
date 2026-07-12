import { CronExpressionError } from "./errors.js";
import { type ZonedFields, zonedFields, zonedTimeToUtc } from "./timezone.js";

const ALIASES: Record<string, string> = {
	"@yearly": "0 0 1 1 *",
	"@annually": "0 0 1 1 *",
	"@monthly": "0 0 1 * *",
	"@weekly": "0 0 * * 0",
	"@daily": "0 0 * * *",
	"@midnight": "0 0 * * *",
	"@hourly": "0 * * * *",
};

/** fires once at scheduler start and never on a timer — see {@link CronSchedule.isReboot}. */
const REBOOT_ALIAS = "@reboot";

const MONTH_NAMES: Record<string, number> = {
	JAN: 1,
	FEB: 2,
	MAR: 3,
	APR: 4,
	MAY: 5,
	JUN: 6,
	JUL: 7,
	AUG: 8,
	SEP: 9,
	OCT: 10,
	NOV: 11,
	DEC: 12,
};

const DOW_NAMES: Record<string, number> = {
	SUN: 0,
	MON: 1,
	TUE: 2,
	WED: 3,
	THU: 4,
	FRI: 5,
	SAT: 6,
};

/** ~4 years of minutes — bounds the search for a schedule that (almost) never matches. seconds
 * within a matching minute are cheap (≤60 checks) and don't affect this bound. */
const MAX_MINUTE_ITERATIONS = 4 * 366 * 24 * 60;

export interface CronSchedule {
	readonly expression: string;
	/** `true` for a 6-field expression (leading seconds field); `false` for the usual 5-field
	 * minute-granularity form. */
	readonly hasSeconds: boolean;
	/** `true` for `@reboot` — fires once at scheduler start, never on a timer. `next`/`matches`
	 * are not meaningful for it and throw / always return `false`. */
	readonly isReboot: boolean;
	/** first matching instant strictly after `from`, in `tz` (default `"UTC"`). */
	next(from: Date, tz?: string): Date;
	matches(date: Date, tz?: string): boolean;
}

function daysInMonth(month: number): number {
	switch (month) {
		case 2:
			return 29; // leap-year-lenient: never falsely reject a schedule aimed at Feb 29
		case 4:
		case 6:
		case 9:
		case 11:
			return 30;
		default:
			return 31;
	}
}

function validateSatisfiable(
	source: string,
	daysOfMonth: Set<number>,
	months: Set<number>,
	domIsWildcard: boolean,
	dowIsWildcard: boolean,
): void {
	// day-of-month only decides the match on its own when it's restricted and day-of-week isn't
	// (POSIX OR-quirk, see `matches`) — that's the only case an out-of-range day makes the whole
	// expression unsatisfiable. otherwise day-of-week is a fallback that can always match.
	if (domIsWildcard || !dowIsWildcard) return;

	const maxDay = Math.max(...[...months].map(daysInMonth));
	if ([...daysOfMonth].every((day) => day > maxDay)) {
		throw new CronExpressionError(
			source,
			"no day-of-month value is valid in any allowed month (and day-of-week is unrestricted), " +
				"so this schedule can never match",
		);
	}
}

/**
 * parse a 5-field cron expression (minute hour day-of-month month day-of-week), a 6-field one
 * (second minute hour day-of-month month day-of-week), or one of the
 * `@hourly`/`@daily`/`@weekly`/`@monthly`/`@yearly`/`@midnight`/`@annually`/`@reboot` aliases.
 * month and day-of-week fields accept both numbers and names (`JAN`–`DEC`, `SUN`–`SAT`,
 * case-insensitive). exported as a pure function so schedules are unit-testable on their own,
 * without a running scheduler — `next`/`matches` take an optional IANA `tz` (default `"UTC""),
 * resolved per-instant via `Intl`, so the same parsed schedule works across zones.
 */
export function parseCron(expression: string): CronSchedule {
	const trimmed = expression.trim();

	if (trimmed.toLowerCase() === REBOOT_ALIAS) {
		return {
			expression: trimmed,
			hasSeconds: false,
			isReboot: true,
			next: () => {
				throw new CronExpressionError(expression, "@reboot has no periodic next run");
			},
			matches: () => false,
		};
	}

	const normalized = ALIASES[trimmed.toLowerCase()] ?? trimmed;
	const fields = normalized.split(/\s+/);

	if (fields.length !== 5 && fields.length !== 6) {
		throw new CronExpressionError(
			expression,
			"expected 5 fields (minute hour day-of-month month day-of-week), 6 with a leading " +
				"seconds field, or an @alias",
		);
	}

	const hasSeconds = fields.length === 6;
	const [secondField, minuteField, hourField, domField, monthField, dowField] = hasSeconds
		? (fields as [string, string, string, string, string, string])
		: (["0", ...fields] as [string, string, string, string, string, string]);

	const secondsSet = hasSeconds ? parseField(expression, secondField, 0, 59) : new Set([0]);
	const minutes = parseField(expression, minuteField, 0, 59);
	const hours = parseField(expression, hourField, 0, 23);
	const daysOfMonth = parseField(expression, domField, 1, 31);
	const months = parseField(expression, monthField, 1, 12, MONTH_NAMES);
	const daysOfWeek = parseField(expression, dowField, 0, 7, DOW_NAMES);
	const domIsWildcard = domField === "*";
	const dowIsWildcard = dowField === "*";

	validateSatisfiable(expression, daysOfMonth, months, domIsWildcard, dowIsWildcard);

	const secondsAscending = [...secondsSet].sort((a, b) => a - b);
	const monthsAscending = [...months].sort((a, b) => a - b);

	function dayOk(fields: ZonedFields): boolean {
		const domMatch = daysOfMonth.has(fields.day);
		const dowMatch = daysOfWeek.has(fields.weekday) || (fields.weekday === 0 && daysOfWeek.has(7));

		// POSIX cron quirk: when both day-of-month and day-of-week are restricted, either one
		// matching is enough. when only one is restricted, that one alone decides.
		if (domIsWildcard && dowIsWildcard) return true;
		if (domIsWildcard) return dowMatch;
		if (dowIsWildcard) return domMatch;
		return domMatch || dowMatch;
	}

	function matches(date: Date, tz = "UTC"): boolean {
		// the offset between UTC and any IANA zone is always a whole number of minutes, so the
		// *seconds* component of wall-clock time never shifts with `tz` — no zone lookup needed.
		if (hasSeconds && !secondsSet.has(date.getUTCSeconds())) return false;
		const fields = zonedFields(date, tz);
		return (
			months.has(fields.month) &&
			dayOk(fields) &&
			hours.has(fields.hour) &&
			minutes.has(fields.minute)
		);
	}

	/** smallest value in `sorted` strictly greater than `current`, or `sorted[0]` (wrapped) if
	 * `current` is at or past every value — used to jump ahead by field instead of by minute. */
	function nextInCycle(sorted: number[], current: number): { value: number; wrapped: boolean } {
		for (const value of sorted) {
			if (value > current) return { value, wrapped: false };
		}
		return { value: sorted[0] as number, wrapped: true };
	}

	function next(from: Date, tz = "UTC"): Date {
		let minute = new Date(from.getTime());
		minute.setUTCSeconds(0, 0);
		// smallest second, in `minute`, that lands strictly after `from` — always ≥1 on the first
		// minute (so a `!hasSeconds` schedule, whose only candidate second is 0, correctly rolls
		// over to the next minute), and 0 on every minute after that.
		let minSecond = Math.floor((from.getTime() - minute.getTime()) / 1000) + 1;

		for (let i = 0; i < MAX_MINUTE_ITERATIONS; i++) {
			const fields = zonedFields(minute, tz);
			let jumpTo: Date | undefined;

			// jump ahead to the next month/day/hour boundary that could plausibly match, instead
			// of stepping minute-by-minute — the difference between microseconds and multiple
			// seconds of blocking for a rare schedule (e.g. Feb 29th) searched in a non-UTC zone,
			// where every step needs an `Intl` lookup. `zonedTimeToUtc` is an approximation near a
			// DST transition, so every jump is re-verified from scratch on the next iteration —
			// correctness never depends on the jump landing exactly on a boundary, only on it
			// landing strictly forward.
			if (!months.has(fields.month)) {
				const { value: month, wrapped } = nextInCycle(monthsAscending, fields.month);
				jumpTo = zonedTimeToUtc(fields.year + (wrapped ? 1 : 0), month, 1, 0, 0, 0, tz);
			} else if (!dayOk(fields)) {
				jumpTo = zonedTimeToUtc(fields.year, fields.month, fields.day + 1, 0, 0, 0, tz);
			} else if (!hours.has(fields.hour)) {
				jumpTo = zonedTimeToUtc(fields.year, fields.month, fields.day, fields.hour + 1, 0, 0, tz);
			} else if (minutes.has(fields.minute)) {
				for (const second of secondsAscending) {
					if (second >= minSecond) return new Date(minute.getTime() + second * 1000);
				}
			}

			minute =
				jumpTo && jumpTo.getTime() > minute.getTime()
					? jumpTo
					: new Date(minute.getTime() + 60_000);
			minSecond = 0;
		}

		throw new CronExpressionError(expression, "no matching run found within 4 years");
	}

	return { expression: trimmed, hasSeconds, isReboot: false, next, matches };
}

function parseField(
	source: string,
	field: string,
	min: number,
	max: number,
	names?: Record<string, number>,
): Set<number> {
	const values = new Set<number>();

	for (const part of field.split(",")) {
		const [rangePart, stepPart] = part.split("/");
		if (!rangePart) throw new CronExpressionError(source, `invalid field "${field}"`);

		const step = stepPart !== undefined ? toInt(source, stepPart, undefined) : 1;
		if (step <= 0) throw new CronExpressionError(source, `invalid step in "${part}"`);

		let start = min;
		let end = max;

		if (rangePart !== "*") {
			const dash = rangePart.indexOf("-");
			if (dash === -1) {
				start = toInt(source, rangePart, names);
				end = stepPart !== undefined ? max : start;
			} else {
				start = toInt(source, rangePart.slice(0, dash), names);
				end = toInt(source, rangePart.slice(dash + 1), names);
			}
		}

		if (start < min || end > max || start > end) {
			throw new CronExpressionError(source, `"${part}" is out of range ${min}-${max}`);
		}

		for (let value = start; value <= end; value += step) values.add(value);
	}

	return values;
}

function toInt(source: string, raw: string, names: Record<string, number> | undefined): number {
	const named = names?.[raw.toUpperCase()];
	if (named !== undefined) return named;
	if (!/^\d+$/.test(raw)) throw new CronExpressionError(source, `invalid value "${raw}"`);
	return Number(raw);
}
