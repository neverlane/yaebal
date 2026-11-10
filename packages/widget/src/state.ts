import { assertData, type DataField } from "./limits.js";

/**
 * typed `public_data` / `chat_data`. telegram stores both as opaque text of at most 1024 bytes;
 * a codec turns a value into that text and back, enforcing the limit on the way out and
 * validating on the way in.
 *
 * with `revision: true` every encoded value carries a strictly increasing revision. telegram's
 * docs ask for exactly this for shared widgets — polls can deliver an older state after a newer
 * one, and the widget should drop anything older than what it already drew. the client
 * ({@link widgetClient}) does that automatically.
 */
export interface WidgetState<T> {
	/** serialize `value` into widget data (≤1024 bytes, throws `INPUT_MEDIA_WIDGET_DATA_TOO_LARGE`). */
	encode(value: T): string;
	/** parse widget data, or `undefined` when it is absent, malformed, or fails `validate`. */
	decode(raw: string | null | undefined): T | undefined;
	/** the revision `raw` carries (`undefined` when the codec has no revisions, or `raw` is bad). */
	revisionOf(raw: string | null | undefined): number | undefined;
	/** whether encoded values carry a revision. */
	readonly revisioned: boolean;
}

export interface WidgetStateOptions<T> {
	/** reject decoded values that don't have the expected shape (state can be stale or foreign). */
	validate?: (value: unknown) => value is T;
	/** add a strictly increasing revision to every encoded value (shared widgets want this). */
	revision?: boolean;
	/** used in the size error message. default `"public_data"`. */
	field?: DataField;
}

/** the json envelope a revisioned codec writes — `{"r": revision, "v": value}`. */
export interface RevisionedEnvelope<T> {
	r: number;
	v: T;
}

let lastRevision = 0;

/** a revision strictly greater than every one this process handed out before (ms-based). */
export function nextRevision(): number {
	lastRevision = Math.max(Date.now(), lastRevision + 1);
	return lastRevision;
}

function isEnvelope(value: unknown): value is RevisionedEnvelope<unknown> {
	return (
		typeof value === "object" &&
		value !== null &&
		"r" in value &&
		"v" in value &&
		typeof value.r === "number" &&
		Number.isFinite(value.r)
	);
}

function parse(raw: string | null | undefined): { ok: true; value: unknown } | { ok: false } {
	if (raw === null || raw === undefined || raw === "") return { ok: false };
	try {
		return { ok: true, value: JSON.parse(raw) };
	} catch {
		return { ok: false };
	}
}

/**
 * a JSON codec for widget state.
 *
 * ```ts
 * const votes = widgetState<{ yes: number; no: number }>({ revision: true });
 * await ctx.widget.setPublicData(votes.encode({ yes: 3, no: 1 }));
 * ```
 */
export function widgetState<T>(options: WidgetStateOptions<T> = {}): WidgetState<T> {
	const revisioned = options.revision === true;
	const field = options.field ?? "public_data";
	const valid = (value: unknown): value is T => options.validate?.(value) ?? true;

	return {
		revisioned,
		encode(value) {
			const body = revisioned ? { r: nextRevision(), v: value } : value;
			return assertData(JSON.stringify(body) ?? "null", field);
		},
		decode(raw) {
			const parsed = parse(raw);
			if (!parsed.ok) return undefined;

			if (!revisioned) return valid(parsed.value) ? parsed.value : undefined;
			if (!isEnvelope(parsed.value)) return undefined;
			return valid(parsed.value.v) ? parsed.value.v : undefined;
		},
		revisionOf(raw) {
			if (!revisioned) return undefined;
			const parsed = parse(raw);
			return parsed.ok && isEnvelope(parsed.value) ? parsed.value.r : undefined;
		},
	};
}
