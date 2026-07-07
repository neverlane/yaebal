import { type Context, type Filter, matchOf, messageOf } from "@yaebal/core";

/**
 * text filters. they read the update's own message — text or caption, exactly
 * what `ctx.text` exposes — so a photo caption matches the same way a plain
 * message does. matching commands is `command()`'s job (text only, fresh
 * messages only); matching callback data is `callbackData()`'s.
 */

const textOf = (ctx: Context): string | undefined => {
	const msg = messageOf(ctx.update);
	return msg?.text ?? msg?.caption;
};

export interface TextMatchOptions {
	/** compare case-insensitively. */
	ignoreCase?: boolean;
}

/** message has non-empty text (or caption); narrows `ctx.text`. */
export const text: Filter<Context, { text: string }> = (ctx) => {
	const value = textOf(ctx);
	return typeof value === "string" && value.length > 0;
};

/** text equals `value`. */
export function equals(
	value: string,
	options: TextMatchOptions = {},
): Filter<Context, { text: string }> {
	const wanted = options.ignoreCase ? value.toLowerCase() : value;

	return (ctx) => {
		const t = textOf(ctx);
		if (t === undefined) return false;

		return (options.ignoreCase ? t.toLowerCase() : t) === wanted;
	};
}

/** text contains `value`. */
export function contains(
	value: string,
	options: TextMatchOptions = {},
): Filter<Context, { text: string }> {
	const wanted = options.ignoreCase ? value.toLowerCase() : value;

	return (ctx) => {
		const t = textOf(ctx);
		if (t === undefined) return false;

		return (options.ignoreCase ? t.toLowerCase() : t).includes(wanted);
	};
}

/** text starts with `value`. */
export function startsWith(
	value: string,
	options: TextMatchOptions = {},
): Filter<Context, { text: string }> {
	const wanted = options.ignoreCase ? value.toLowerCase() : value;

	return (ctx) => {
		const t = textOf(ctx);
		if (t === undefined) return false;

		return (options.ignoreCase ? t.toLowerCase() : t).startsWith(wanted);
	};
}

/** text ends with `value`. */
export function endsWith(
	value: string,
	options: TextMatchOptions = {},
): Filter<Context, { text: string }> {
	const wanted = options.ignoreCase ? value.toLowerCase() : value;

	return (ctx) => {
		const t = textOf(ctx);
		if (t === undefined) return false;

		return (options.ignoreCase ? t.toLowerCase() : t).endsWith(wanted);
	};
}

/** text matches `re`; stages `ctx.match`. safe with shared `g`/`y` regexes. */
export function regex(re: RegExp): Filter<Context, { text: string; match: RegExpMatchArray }> {
	return (ctx, bag) => {
		const t = textOf(ctx);
		if (t === undefined) return false;

		const m = matchOf(t, re);
		if (!m) return false;

		bag.match = m;
		return true;
	};
}
