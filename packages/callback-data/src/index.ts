/**
 * typed `callback_data`. declare a prefix + a field schema, then `pack`/`unpack`
 * with full type inference and a compact wire format built for Telegram's 64-byte cap.
 *
 * ```ts
 * const user = callbackData("user", {
 *   id: Number,                                  // required scalar (shorthand)
 *   action: field.enum(["ban", "kick", "mute"]), // union type, 1-char on the wire
 *   note: field.string().optional(),             // may be absent
 *   page: field.number().default(1),             // absent → filled with 1
 * });
 *
 * user.pack({ id: 42, action: "ban" });          // "user:16:0:1"  (base36 id, enum idx, bitmask)
 * user.unpack("user:16:0:1");                    // { id: 42, action: "ban", page: 1 }
 * ```
 *
 * ## wire format
 *
 * `prefix:req…:bitmask:opt…` — required fields first, then (only when the schema has
 * optional fields) a base36 bitmask of which optionals are present, then those present
 * optional values. numbers use base36, booleans `1`/`0`, enums their index, uuids 22
 * base64url chars (down from 36), bigints base36 — so a payload is a fraction of the
 * size of a naive JSON/query-string encoding.
 *
 * ## totality
 *
 * `unpack` never throws: hostile or outdated input (bad prefix, wrong arity, a number
 * that isn't a number, an enum index out of range, a malformed bitmask) returns
 * `undefined`. Telegram itself warns a callback query may arrive with data that no
 * longer matches any live button — so this is a real code path, not a theoretical one.
 *
 * ## schema evolution
 *
 * appending an **optional** field is backward-compatible: buttons packed before the field
 * existed still `unpack` (the missing value reads as its default, or is simply absent).
 * adding a **required** field, reordering, or changing a field's type breaks old buttons.
 */

/** Telegram's hard limit on `callback_data`, in UTF-8 bytes. */
export const CALLBACK_DATA_LIMIT = 64;

const SEP = ":";
const ESC = "\\";

const encoder = new TextEncoder();
const byteLength = (s: string): number => encoder.encode(s).length;

// ── field descriptors ──────────────────────────────────────────────────────

type ScalarType = "string" | "number" | "boolean" | "enum" | "uuid" | "bigint";

/** runtime description of one field — what `pack`/`unpack` consult. */
interface FieldSpec {
	readonly type: ScalarType;
	readonly optional: boolean;
	readonly hasDefault: boolean;
	readonly default?: unknown;
	readonly enumValues?: readonly (string | number)[];
}

/**
 * a schema field with its inferred type carried in the type parameters. build one with
 * the {@link field} helpers; chain `.optional()` / `.default()` to refine it. the runtime
 * shape lives on {@link Field.spec}; `Out`/`Optional`/`HasDefault` exist only at the type
 * level to drive inference.
 */
export class Field<
	Out = unknown,
	Optional extends boolean = boolean,
	HasDefault extends boolean = boolean,
> {
	/** phantom — carries the type params for inference; never present at runtime. */
	declare readonly __field?: { out: Out; optional: Optional; hasDefault: HasDefault };

	constructor(readonly spec: FieldSpec) {}

	/** mark the field optional: absent from `pack` input, `T | undefined` on `unpack`. */
	optional(): Field<Out, true, HasDefault> {
		return new Field({ ...this.spec, optional: true });
	}

	/** give the field a default: optional in `pack` input, always present on `unpack`. */
	default<const D extends Out>(value: D): Field<Out, true, true> {
		return new Field({ ...this.spec, optional: true, hasDefault: true, default: value as Out });
	}
}

/** the structural supertype of every {@link Field} — lets {@link Codec} avoid `any`. */
export interface FieldBase {
	readonly spec: FieldSpec;
}

/** builders for schema fields beyond the bare `Number`/`String`/`Boolean` shorthands. */
export const field = {
	/** a `string` field. */
	string(): Field<string, false, false> {
		return new Field({ type: "string", optional: false, hasDefault: false });
	},
	/** a `number` field — integers pack as base36, non-integers fall back to decimal. */
	number(): Field<number, false, false> {
		return new Field({ type: "number", optional: false, hasDefault: false });
	},
	/** a `boolean` field — one byte on the wire (`1`/`0`). */
	boolean(): Field<boolean, false, false> {
		return new Field({ type: "boolean", optional: false, hasDefault: false });
	},
	/**
	 * an `enum` field — the value's index is stored (base36), so the type is a union and
	 * the wire cost is one char. Appending new members is backward-compatible; reordering
	 * or removing members is not.
	 */
	enum<const V extends readonly [string | number, ...(string | number)[]]>(
		values: V,
	): Field<V[number], false, false> {
		return new Field({ type: "enum", optional: false, hasDefault: false, enumValues: values });
	},
	/**
	 * a `uuid` field — the canonical 36-char string is repacked into 16 raw bytes and
	 * base64url'd, so it costs 22 bytes on the wire instead of 36. decodes back to the
	 * lowercase canonical form.
	 */
	uuid(): Field<string, false, false> {
		return new Field({ type: "uuid", optional: false, hasDefault: false });
	},
	/**
	 * a `bigint` field — lossless for 64-bit ids (snowflakes, bigserial keys) that
	 * `field.number()` refuses beyond `Number.MAX_SAFE_INTEGER`. base36 on the wire.
	 */
	bigint(): Field<bigint, false, false> {
		return new Field({ type: "bigint", optional: false, hasDefault: false });
	},
};

// ── schema + inference ──────────────────────────────────────────────────────

/** a shorthand constructor or a {@link Field} descriptor. */
export type Codec = FieldBase | NumberConstructor | StringConstructor | BooleanConstructor;

/** a `callbackData` schema: field name → codec. */
export type Schema = Record<string, Codec>;

type Prettify<T> = { [K in keyof T]: T[K] } & {};

type OutOf<C> = C extends NumberConstructor
	? number
	: C extends StringConstructor
		? string
		: C extends BooleanConstructor
			? boolean
			: C extends Field<infer O, boolean, boolean>
				? O
				: never;

type IsOptional<C> = C extends Field<unknown, infer Opt, boolean> ? Opt : false;
type HasDefault<C> = C extends Field<unknown, boolean, infer D> ? D : false;

type RequiredKeys<S extends Schema> = {
	[K in keyof S]: IsOptional<S[K]> extends true ? never : K;
}[keyof S];
type OptionalKeys<S extends Schema> = {
	[K in keyof S]: IsOptional<S[K]> extends true ? K : never;
}[keyof S];

/** the object `pack` accepts — optional/defaulted fields are optional. */
export type InferInput<S extends Schema> = Prettify<
	{ [K in RequiredKeys<S>]: OutOf<S[K]> } & { [K in OptionalKeys<S>]?: OutOf<S[K]> }
>;

// fields that are always present on unpack: required, or optional-with-default.
type PresentKeys<S extends Schema> = {
	[K in keyof S]: IsOptional<S[K]> extends true ? (HasDefault<S[K]> extends true ? K : never) : K;
}[keyof S];
// optional fields with no default: may be missing on unpack.
type AbsentKeys<S extends Schema> = {
	[K in keyof S]: IsOptional<S[K]> extends true
		? HasDefault<S[K]> extends true
			? never
			: K
		: never;
}[keyof S];

/** the object `unpack` returns — defaulted fields are present, bare-optional ones may be absent. */
export type InferOutput<S extends Schema> = Prettify<
	{ [K in PresentKeys<S>]: OutOf<S[K]> } & { [K in AbsentKeys<S>]?: OutOf<S[K]> }
>;

type HasRequired<S extends Schema> = RequiredKeys<S> extends never ? false : true;
type PackArgs<S extends Schema> =
	HasRequired<S> extends true ? [data: InferInput<S>] : [data?: InferInput<S>];

// ── the namespace object ─────────────────────────────────────────────────────

export interface CallbackData<S extends Schema> {
	/** the namespace prefix, verbatim. */
	readonly prefix: string;
	/** RegExp anchored to the prefix — pass to `bot.callbackQuery(cd.pattern, …)` for cheap routing. */
	readonly pattern: RegExp;
	/** serialize a payload into a `callback_data` string; throws if it exceeds the byte limit. */
	pack(...args: PackArgs<S>): string;
	/** parse a `callback_data` string, or `undefined` if it isn't valid data for this namespace. */
	unpack(raw: string): InferOutput<S> | undefined;
	/** true if `raw` carries this namespace's prefix (cheap; does not fully validate). */
	filter(raw: string | undefined): boolean;
	/** derive a new namespace with extra fields appended (immutable — the original is untouched). */
	extend<E extends Schema>(extra: E): CallbackData<Prettify<Omit<S, keyof E> & E>>;
}

/** options for {@link callbackData}. */
export interface CallbackDataOptions {
	/**
	 * byte budget enforced by `pack` (default {@link CALLBACK_DATA_LIMIT}). Set `Infinity`
	 * to disable — e.g. if you route this data somewhere other than a Telegram button.
	 */
	maxBytes?: number;
}

interface NormalizedField {
	readonly key: string;
	readonly spec: FieldSpec;
}

function toSpec(codec: Codec, key: string): FieldSpec {
	if (codec instanceof Field) return codec.spec;
	if (codec === Number) return { type: "number", optional: false, hasDefault: false };
	if (codec === String) return { type: "string", optional: false, hasDefault: false };
	if (codec === Boolean) return { type: "boolean", optional: false, hasDefault: false };
	throw new TypeError(`callbackData: field "${key}" has an unsupported codec`);
}

export function callbackData<const S extends Schema>(
	prefix: string,
	schema: S,
	options: CallbackDataOptions = {},
): CallbackData<S> {
	if (prefix.length === 0) {
		throw new Error("callbackData: prefix must not be empty (telegram requires 1-64 bytes)");
	}
	if (prefix.includes(SEP) || prefix.includes(ESC)) {
		throw new Error(
			`callbackData: prefix "${prefix}" must not contain ":" or "\\" (reserved by the wire format)`,
		);
	}

	const maxBytes = options.maxBytes ?? CALLBACK_DATA_LIMIT;

	const required: NormalizedField[] = [];
	const optional: NormalizedField[] = [];
	for (const [key, codec] of Object.entries(schema)) {
		const spec = toSpec(codec, key);
		(spec.optional ? optional : required).push({ key, spec });
	}
	if (optional.length > 31) {
		throw new Error(`callbackData("${prefix}"): at most 31 optional fields are supported`);
	}

	const pattern = new RegExp(`^${escapeRegExp(prefix)}(?::|$)`);

	function pack(...args: PackArgs<S>): string {
		const data = (args[0] ?? {}) as Record<string, unknown>;
		const parts: string[] = [prefix];

		for (const f of required) {
			if (data[f.key] === undefined) {
				throw new TypeError(`callbackData("${prefix}"): required field "${f.key}" is missing`);
			}
			parts.push(encode(f.spec, data[f.key], f.key, prefix));
		}

		if (optional.length > 0) {
			let bitmask = 0;
			const optionalParts: string[] = [];
			for (let i = 0; i < optional.length; i++) {
				const f = optional[i] as NormalizedField;
				const value = data[f.key];
				if (value !== undefined) {
					bitmask |= 1 << i;
					optionalParts.push(encode(f.spec, value, f.key, prefix));
				}
			}
			parts.push(bitmask.toString(36), ...optionalParts);
		}

		const out = parts.join(SEP);
		const size = byteLength(out);
		if (size > maxBytes) {
			throw new RangeError(
				`callbackData("${prefix}"): packed ${size} bytes exceeds the ${maxBytes}-byte limit — shorten the payload`,
			);
		}
		return out;
	}

	function unpack(raw: string): InferOutput<S> | undefined {
		try {
			const tokens = splitTokens(raw);
			if (tokens[0] !== prefix) return undefined;

			let ptr = 1;
			const out: Record<string, unknown> = {};

			for (const f of required) {
				if (ptr >= tokens.length) return undefined;
				const value = decode(f.spec, tokens[ptr++] as string);
				if (value === FAIL) return undefined;
				out[f.key] = value;
			}

			if (optional.length > 0) {
				let bitmask = 0;
				if (ptr < tokens.length) {
					bitmask = Number.parseInt(tokens[ptr++] as string, 36);
					if (!Number.isInteger(bitmask) || bitmask < 0) return undefined;
				}
				for (let i = 0; i < optional.length; i++) {
					const f = optional[i] as NormalizedField;
					if (bitmask & (1 << i)) {
						if (ptr >= tokens.length) return undefined;
						const value = decode(f.spec, tokens[ptr++] as string);
						if (value === FAIL) return undefined;
						out[f.key] = value;
					} else if (f.spec.hasDefault) {
						out[f.key] = f.spec.default;
					}
				}
			}

			// leftover tokens mean the data isn't shaped like this namespace
			if (ptr !== tokens.length) return undefined;

			return out as InferOutput<S>;
		} catch {
			return undefined;
		}
	}

	return {
		prefix,
		pattern,
		pack,
		unpack,
		filter(raw) {
			return raw !== undefined && pattern.test(raw);
		},
		extend<E extends Schema>(extra: E) {
			return callbackData(prefix, { ...schema, ...extra } as Prettify<Omit<S, keyof E> & E>, {
				maxBytes,
			});
		},
	};
}

// ── codecs ───────────────────────────────────────────────────────────────────

const FAIL = Symbol("callback-data:fail");

function encode(spec: FieldSpec, value: unknown, key: string, prefix: string): string {
	switch (spec.type) {
		case "string":
			if (typeof value !== "string") {
				throw new TypeError(`callbackData("${prefix}"): field "${key}" must be a string`);
			}
			return escapeValue(value);
		case "number":
			if (typeof value !== "number" || !Number.isFinite(value)) {
				throw new TypeError(`callbackData("${prefix}"): field "${key}" must be a finite number`);
			}
			if (Number.isSafeInteger(value)) return value.toString(36);
			return decimalToken(value, key, prefix);
		case "boolean":
			return value ? "1" : "0";
		case "enum": {
			const values = spec.enumValues as readonly (string | number)[];
			const index = values.indexOf(value as string | number);
			if (index === -1) {
				throw new TypeError(
					`callbackData("${prefix}"): field "${key}" — ${JSON.stringify(value)} is not one of ${JSON.stringify(values)}`,
				);
			}
			return index.toString(36);
		}
		case "uuid": {
			if (typeof value !== "string" || !UUID_RE.test(value)) {
				throw new TypeError(`callbackData("${prefix}"): field "${key}" must be a canonical uuid`);
			}
			return uuidToToken(value);
		}
		case "bigint":
			if (typeof value !== "bigint") {
				throw new TypeError(`callbackData("${prefix}"): field "${key}" must be a bigint`);
			}
			return value.toString(36);
	}
}

/**
 * non-safe-integer fallback: floats and huge exponentials stringify with `.` / `e+` and
 * are unambiguous, but an unsafe integer below 1e21 stringifies as plain digits — which
 * decode would misread as base36. refuse those instead of corrupting them silently
 * (the value has already lost integer precision in JS anyway).
 */
function decimalToken(value: number, key: string, prefix: string): string {
	const dec = value.toString();
	if (/^-?[0-9a-z]+$/.test(dec)) {
		throw new TypeError(
			`callbackData("${prefix}"): field "${key}" — ${dec} is outside Number.MAX_SAFE_INTEGER and cannot round-trip exactly; store it as a string`,
		);
	}
	return dec;
}

function decode(spec: FieldSpec, token: string): unknown | typeof FAIL {
	switch (spec.type) {
		case "string":
			return unescapeValue(token);
		case "number": {
			// base36 tokens come only from safe integers (pack refuses unsafe ones),
			// so an over-limit parse means foreign data — reject rather than misread
			if (/^-?[0-9a-z]+$/.test(token)) {
				const n = Number.parseInt(token, 36);
				return Number.isSafeInteger(n) ? n : FAIL;
			}
			const n = Number.parseFloat(token);
			return Number.isFinite(n) ? n : FAIL;
		}
		case "boolean":
			return token === "1" ? true : token === "0" ? false : FAIL;
		case "enum": {
			const values = spec.enumValues as readonly (string | number)[];
			const index = Number.parseInt(token, 36);
			return Number.isInteger(index) && index >= 0 && index < values.length
				? (values[index] as string | number)
				: FAIL;
		}
		case "uuid":
			return tokenToUuid(token);
		case "bigint": {
			if (!/^-?[0-9a-z]+$/.test(token)) return FAIL;
			try {
				return parseBase36BigInt(token);
			} catch {
				return FAIL;
			}
		}
	}
}

// ── uuid: canonical 36-char form ⇄ 22-char base64url (16 raw bytes) ───────────
// btoa/atob keep this Buffer-free, so the codec runs on edge runtimes too.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const B64URL_RE = /^[A-Za-z0-9_-]{22}$/;

function uuidToToken(uuid: string): string {
	const hex = uuid.replace(/-/g, "").toLowerCase();
	let bin = "";
	for (let i = 0; i < 32; i += 2) {
		bin += String.fromCharCode(Number.parseInt(hex.slice(i, i + 2), 16));
	}
	return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function tokenToUuid(token: string): string | typeof FAIL {
	if (!B64URL_RE.test(token)) return FAIL;
	let bin: string;
	try {
		bin = atob(`${token.replace(/-/g, "+").replace(/_/g, "/")}==`);
	} catch {
		return FAIL;
	}
	if (bin.length !== 16) return FAIL;

	let hex = "";
	for (let i = 0; i < 16; i++) {
		hex += bin.charCodeAt(i).toString(16).padStart(2, "0");
	}
	return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

// ── bigint: base36 (BigInt has no radix parser of its own) ─────────────────────

const BIG36 = 36n;

function parseBase36BigInt(token: string): bigint {
	const negative = token.startsWith("-");
	let acc = 0n;
	for (const ch of negative ? token.slice(1) : token) {
		acc = acc * BIG36 + BigInt(Number.parseInt(ch, 36));
	}
	return negative ? -acc : acc;
}

// ── string escaping (only strings can contain the separator) ──────────────────

function escapeValue(s: string): string {
	if (!s.includes(ESC) && !s.includes(SEP)) return s;
	return s.replace(/\\/g, "\\\\").replace(/:/g, "\\:");
}

function unescapeValue(s: string): string {
	return s.replace(/\\(.)/g, "$1");
}

/** split on unescaped separators, keeping escape sequences intact for the decoders. */
function splitTokens(raw: string): string[] {
	const out: string[] = [];
	let cur = "";
	let escaped = false;
	for (const ch of raw) {
		if (escaped) {
			cur += ch;
			escaped = false;
		} else if (ch === ESC) {
			cur += ch;
			escaped = true;
		} else if (ch === SEP) {
			out.push(cur);
			cur = "";
		} else {
			cur += ch;
		}
	}
	out.push(cur);
	return out;
}

function escapeRegExp(s: string): string {
	return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
