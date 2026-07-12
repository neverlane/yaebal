/**
 * dependency-free IANA time zone support, built on `Intl.DateTimeFormat`. a cron schedule steps
 * through absolute instants (UTC milliseconds) regardless of zone — every IANA zone's current
 * offset is a whole number of minutes, so a UTC-minute (or UTC-second) boundary is always also a
 * zone-minute (or zone-second) boundary. what changes per zone is only which *wall-clock* fields
 * a given instant reads as, and `Intl.DateTimeFormat` resolves that DST-correctly for the exact
 * instant — no zoneinfo database bundled, no drift.
 */

export interface ZonedFields {
	year: number;
	/** 1–12 */
	month: number;
	/** 1–31 */
	day: number;
	/** 0–23 */
	hour: number;
	/** 0–59 */
	minute: number;
	/** 0–59 */
	second: number;
	/** 0 (Sunday) – 6 (Saturday), matching `Date#getUTCDay`. */
	weekday: number;
}

const WEEKDAY_INDEX: Record<string, number> = {
	Sun: 0,
	Mon: 1,
	Tue: 2,
	Wed: 3,
	Thu: 4,
	Fri: 5,
	Sat: 6,
};

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function formatterFor(tz: string): Intl.DateTimeFormat {
	let formatter = formatterCache.get(tz);
	if (formatter) return formatter;

	// throws RangeError for an unrecognized zone — this is the only validation we need.
	formatter = new Intl.DateTimeFormat("en-US", {
		timeZone: tz,
		hourCycle: "h23", // avoids the "24:00" some engines emit for midnight under h24
		year: "numeric",
		month: "numeric",
		day: "numeric",
		hour: "numeric",
		minute: "numeric",
		second: "numeric",
		weekday: "short",
	});
	formatterCache.set(tz, formatter);
	return formatter;
}

/** throws `RangeError` if `tz` isn't a recognized IANA zone name. cheap after the first call —
 * the underlying formatter is cached. call eagerly (job registration, not first fire) so a typo
 * surfaces immediately instead of on the schedule's first tick. */
export function validateTimeZone(tz: string): void {
	formatterFor(tz);
}

/** wall-clock fields for a UTC instant, as observed in `tz`. `"UTC"` takes a fast path that
 * skips `Intl` entirely. DST-correct: the formatter resolves the offset for that exact instant,
 * so a spring-forward gap or fall-back repeat is handled the same way a real clock in that zone
 * would show it. */
export function zonedFields(date: Date, tz: string): ZonedFields {
	if (tz === "UTC") {
		return {
			year: date.getUTCFullYear(),
			month: date.getUTCMonth() + 1,
			day: date.getUTCDate(),
			hour: date.getUTCHours(),
			minute: date.getUTCMinutes(),
			second: date.getUTCSeconds(),
			weekday: date.getUTCDay(),
		};
	}

	const values: Partial<Record<Intl.DateTimeFormatPartTypes, string>> = {};
	for (const part of formatterFor(tz).formatToParts(date)) {
		if (part.type !== "literal") values[part.type] = part.value;
	}

	return {
		year: Number(values.year),
		month: Number(values.month),
		day: Number(values.day),
		hour: Number(values.hour),
		minute: Number(values.minute),
		second: Number(values.second),
		weekday: WEEKDAY_INDEX[values.weekday ?? ""] ?? 0,
	};
}

/**
 * inverse of {@link zonedFields}: the UTC instant whose wall-clock reading in `tz` is the given
 * fields (month is 1-based; day/hour/minute/second overflow the normal way — day 32 rolls into
 * next month, same as `Date.UTC`). uses the standard guess-and-correct approach: treat the fields
 * as if they were already UTC, read the zone's offset at that guess, and correct by it.
 *
 * near a DST transition this can land up to one DST delta off the "true" instant (a skipped
 * wall-clock hour has no true instant to begin with; a repeated one is ambiguous) — fine for its
 * one caller, `parseCron`'s search, which always re-verifies the result against the real
 * schedule before returning it. never call this expecting an exact answer across a DST boundary.
 */
export function zonedTimeToUtc(
	year: number,
	month: number,
	day: number,
	hour: number,
	minute: number,
	second: number,
	tz: string,
): Date {
	const naiveUtc = Date.UTC(year, month - 1, day, hour, minute, second);
	if (tz === "UTC") return new Date(naiveUtc);

	const observed = zonedFields(new Date(naiveUtc), tz);
	const asIfUtc = Date.UTC(
		observed.year,
		observed.month - 1,
		observed.day,
		observed.hour,
		observed.minute,
		observed.second,
	);
	const offsetMs = asIfUtc - naiveUtc;
	return new Date(naiveUtc - offsetMs);
}
