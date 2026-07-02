/**
 * builder instances (e.g. `InlineKeyboard`/`Keyboard` from `@yaebal/keyboard`) expose a
 * `toJSON()` the same way `Date`/`Map`-like classes do. unwrap them so recorded calls and
 * assertions see plain JSON, never a class instance — no `@yaebal/keyboard` dependency needed,
 * this is just duck typing on the standard `toJSON` convention.
 */
export function toPlain<T = unknown>(value: unknown): T {
	if (value && typeof (value as { toJSON?: unknown }).toJSON === "function") {
		return (value as { toJSON(): T }).toJSON();
	}

	return value as T;
}

/** shallow-clone `params`, normalizing `reply_markup` (and, for `answerInlineQuery`, each `results[].reply_markup`) via {@link toPlain}. */
export function normalizeParams(
	params: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
	if (!params) return params;

	const out = { ...params };

	if ("reply_markup" in out) out.reply_markup = toPlain(out.reply_markup);

	if (Array.isArray(out.results)) {
		out.results = out.results.map((item) =>
			item && typeof item === "object" && "reply_markup" in item
				? { ...item, reply_markup: toPlain((item as Record<string, unknown>).reply_markup) }
				: item,
		);
	}

	return out;
}
