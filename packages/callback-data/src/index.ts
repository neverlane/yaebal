/**
 * Typed `callback_data`. Define a prefix + a field→codec schema, then `pack`/`unpack`
 * with full type inference. Values are URL-encoded so the `:` separator is safe inside
 * them. Telegram caps callback_data at 64 bytes — keeping it short is the caller's job.
 *
 * Codecs are not validated: `Number` must be finite (garbage decodes to `NaN`), and
 * `Boolean` parses by exact `"true"` (anything else → `false`). Safe for round-tripping
 * data you packed yourself, which is all callback_data ever is.
 */

type Codec = NumberConstructor | StringConstructor | BooleanConstructor;

type Infer<S extends Record<string, Codec>> = {
	[K in keyof S]: S[K] extends NumberConstructor
		? number
		: S[K] extends BooleanConstructor
			? boolean
			: string;
};

export interface CallbackData<S extends Record<string, Codec>> {
	/** Serialize a payload into a callback_data string. */
	pack(data: Infer<S>): string;
	/** Parse a callback_data string, or `undefined` if the prefix/arity doesn't match. */
	unpack(raw: string): Infer<S> | undefined;
	/** True if `raw` belongs to this callback_data namespace. */
	filter(raw: string | undefined): boolean;
	/** RegExp anchored to the prefix — pass to `bot.callbackQuery(cd.pattern, …)`. */
	readonly pattern: RegExp;
}

export function callbackData<S extends Record<string, Codec>>(
	prefix: string,
	schema: S,
): CallbackData<S> {
	if (prefix.includes(":")) {
		throw new Error(`callbackData: prefix "${prefix}" must not contain ":" (the field separator)`);
	}

	const keys = Object.keys(schema) as (keyof S & string)[];
	const pattern = new RegExp(`^${escapeRegExp(prefix)}(?::|$)`);

	return {
		pattern,

		pack(data) {
			const parts = keys.map((k) => encodeURIComponent(String(data[k])));
			return [prefix, ...parts].join(":");
		},

		unpack(raw) {
			const segs = raw.split(":");
			if (segs[0] !== prefix) return undefined;
			
			const values = segs.slice(1);
			if (values.length !== keys.length) return undefined;

			const out = {} as Record<string, unknown>;

			keys.forEach((k, i) => {
				const dec = decodeURIComponent(values[i] ?? "");
				const codec = schema[k];

				out[k] = codec === Number ? Number(dec) : codec === Boolean ? dec === "true" : dec;
			});

			return out as Infer<S>;
		},

		filter(raw) {
			return raw !== undefined && pattern.test(raw);
		},
	};
}

function escapeRegExp(s: string): string {
	return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
