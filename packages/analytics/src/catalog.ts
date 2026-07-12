import type { EventDef, EventsCatalog, PropsSchema } from "./types.js";

/** a single typed field inside a `p.object({...})` schema. `Optional` is a literal `true`/`false`
 * type parameter (not just `boolean`) so {@link InferObject} can key-remap required vs. optional
 * properties — build one via {@link p}, not by hand. */
export interface PropsField<T, Optional extends boolean = boolean> {
	readonly optional: Optional;
	/** throws a `TypeError` if `value` doesn't match; returns it (possibly `undefined`, for an
	 * optional field) otherwise. */
	parse(value: unknown, key: string): T;
}

type Infer<F> = F extends PropsField<infer T, boolean> ? T : never;

type InferObject<S extends Record<string, PropsField<unknown, boolean>>> = {
	[K in keyof S as S[K] extends PropsField<unknown, true> ? never : K]: Infer<S[K]>;
} & {
	[K in keyof S as S[K] extends PropsField<unknown, true> ? K : never]?: Infer<S[K]>;
};

function field<T>(kind: string, check: (value: unknown) => boolean): PropsField<T, false> {
	return {
		optional: false,
		parse(value, key) {
			if (!check(value)) {
				throw new TypeError(
					`analytics: expected property "${key}" to be ${kind}, got ${typeof value}`,
				);
			}
			return value as T;
		},
	};
}

/**
 * a tiny zero-dependency runtime validator for event properties — not a general-purpose schema
 * library, just enough to give `ctx.track` compile-time property checking (via {@link
 * PropsSchema}'s phantom type) and a runtime guard against a misshapen call. compose fields with
 * `p.object({...})`; reach for `zod`/`valibot` and a hand-written {@link PropsSchema} if you need
 * more than string/number/boolean/optional.
 */
export const p = {
	string: (): PropsField<string, false> => field("a string", (v) => typeof v === "string"),
	number: (): PropsField<number, false> =>
		field("a finite number", (v) => typeof v === "number" && Number.isFinite(v)),
	boolean: (): PropsField<boolean, false> => field("a boolean", (v) => typeof v === "boolean"),
	/** allow this field to be absent (or explicitly `undefined`); present values still validate. */
	optional<T>(inner: PropsField<T, boolean>): PropsField<T | undefined, true> {
		return {
			optional: true,
			parse: (value, key) => (value === undefined ? undefined : inner.parse(value, key)),
		};
	},
	/** an event's properties schema — every field's own `optional()` decides whether it's required
	 * on the resulting `PropsSchema`'s inferred type. */
	object<S extends Record<string, PropsField<unknown, boolean>>>(
		shape: S,
	): PropsSchema<InferObject<S>> {
		const keys = Object.keys(shape);

		return {
			parse(value) {
				const out: Record<string, unknown> = {};
				for (const key of keys) {
					const shapeField = shape[key] as PropsField<unknown, boolean>;
					const raw = value[key];
					if (raw === undefined && !shapeField.optional) {
						throw new TypeError(`analytics: missing required property "${key}"`);
					}
					const parsed = shapeField.parse(raw, key);
					if (parsed !== undefined) out[key] = parsed;
				}
				return out as InferObject<S>;
			},
		};
	},
};

const EVENT_NAME_RE = /^[a-z][a-z0-9_.]*$/;

/**
 * validate an event catalog up front (thrown at `analytics()`/`createAnalytics()` construction
 * time, not on first `track()` call) — an invalid event name or an out-of-range `sample` is a
 * configuration bug, not a runtime condition to silently accept.
 */
export function validateCatalog(events: EventsCatalog): void {
	for (const key of Object.keys(events)) {
		if (!EVENT_NAME_RE.test(key)) {
			throw new Error(
				`analytics: event ${JSON.stringify(key)} is not a valid event name — expected lowercase ` +
					'letters, digits, "." and "_" only, starting with a letter (e.g. "purchase_completed")',
			);
		}

		const def = events[key];
		if (def === true || def === undefined) continue;

		if (def.sample !== undefined && (def.sample < 0 || def.sample > 1)) {
			throw new Error(
				`analytics: event ${JSON.stringify(key)} has sample ${def.sample}, expected a value in [0, 1]`,
			);
		}
	}
}

/** the catalog entry for `name`, or `undefined` for a `true`/undeclared entry — either way,
 * "no schema, no per-event overrides" for the caller. */
export function resolveEventDef(
	events: EventsCatalog | undefined,
	name: string,
): EventDef | undefined {
	const def = events?.[name];
	return def === true || def === undefined ? undefined : def;
}
