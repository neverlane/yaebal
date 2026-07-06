import type { MessageEntity, User } from "./telegram-types.js";

/**
 * formatting without `parse_mode`: tagged template literals that build proper
 * `MessageEntity` objects, so there is nothing to escape (the GramIO idea).
 */
export interface FormatResult {
	text: string;
	entities: MessageEntity[];
}

/** a piece of text that carries its own entities, used inside `format`. */
export class Stringable implements FormatResult {
	constructor(
		readonly text: string,
		readonly entities: MessageEntity[] = [],
	) {}
}

/**
 * anything a `format` interpolation (or a helper argument) accepts. `null`,
 * `undefined` and booleans render as empty text, so `${cond && bold("on")}`
 * just works; numbers and bigints render via `String()`.
 */
export type Insertable = FormatResult | string | number | bigint | boolean | null | undefined;

export function isFormatResult(value: unknown): value is FormatResult {
	return (
		typeof value === "object" &&
		value !== null &&
		"text" in value &&
		"entities" in value &&
		Array.isArray((value as FormatResult).entities)
	);
}

/** normalize any {@link Insertable} to a `{ text, entities }` pair. */
function toResult(value: Insertable): FormatResult {
	if (isFormatResult(value)) return value;
	if (value == null || typeof value === "boolean") return { text: "", entities: [] };
	return { text: String(value), entities: [] };
}

const isTemplateStrings = (value: unknown): value is TemplateStringsArray =>
	Array.isArray(value) && "raw" in value;

/** stitches the literal parts and interpolations into one `{ text, entities }`. */
export function format(strings: TemplateStringsArray, ...subs: Insertable[]): FormatResult {
	let text = "";
	const entities: MessageEntity[] = [];

	for (let i = 0; i < strings.length; i++) {
		text += strings[i] ?? "";

		if (i < subs.length) {
			const sub = toResult(subs[i]);
			const offset = text.length;

			text += sub.text;
			for (const entity of sub.entities) {
				entities.push({ ...entity, offset: entity.offset + offset });
			}
		}
	}

	return { text, entities };
}

/** wrap a value in an entity, keeping the value's own entities — this is what makes nesting work. */
function apply(
	type: MessageEntity["type"],
	value: Insertable,
	extra: Partial<MessageEntity> = {},
): Stringable {
	const inner = toResult(value);

	return new Stringable(inner.text, [
		{ type, offset: 0, length: inner.text.length, ...extra } as MessageEntity,
		...inner.entities,
	]);
}

/** an entity helper callable both as `bold("hi")` (nestable) and as a tag: `` bold`hi ${italic("!")}` ``. */
export interface Formatter {
	(value: Insertable): Stringable;
	(strings: TemplateStringsArray, ...subs: Insertable[]): Stringable;
}

function wrap(type: MessageEntity["type"]): Formatter {
	return ((first: Insertable | TemplateStringsArray, ...rest: Insertable[]) =>
		apply(type, isTemplateStrings(first) ? format(first, ...rest) : first)) as Formatter;
}

export const bold = wrap("bold");
export const italic = wrap("italic");
export const underline = wrap("underline");
export const strikethrough = wrap("strikethrough");
export const spoiler = wrap("spoiler");
export const code = wrap("code");
export const blockquote = wrap("blockquote");
export const expandableBlockquote = wrap("expandable_blockquote");

/** a `pre` block; pass the language telegram should highlight: `pre(src, "ts")`. */
export function pre(value: Insertable, language?: string): Stringable {
	return apply("pre", value, language === undefined ? {} : { language });
}

export function link(text: Insertable, url: string): Stringable {
	return apply("text_link", text, { url });
}

export function mention(text: Insertable, user: User | { id: number }): Stringable {
	return apply("text_mention", text, { user: user as never });
}

/** an inline custom emoji; `fallback` is the plain emoji shown to clients that can't render it. */
export function customEmoji(fallback: Insertable, customEmojiId: string): Stringable {
	return apply("custom_emoji", fallback, { custom_emoji_id: customEmojiId });
}

/**
 * a date/time entity — telegram renders the timestamp in the reader's locale and
 * timezone. `dateTimeFormat` follows the Bot API `date_time` format string
 * (`"r"` relative, `"d"`/`"D"` short/long date, `"t"`/`"T"` short/long time, `"w"`
 * weekday — combinable like `"wDt"`); empty/omitted shows `text` as-is.
 */
export function dateTime(text: Insertable, unixTime: number, dateTimeFormat?: string): Stringable {
	return apply("date_time", text, {
		unix_time: unixTime,
		...(dateTimeFormat === undefined ? {} : { date_time_format: dateTimeFormat }),
	});
}

/**
 * join formatted pieces with a separator, keeping entities — `[].join()` would
 * stringify them away. items that render to empty text (`null`, `undefined`,
 * booleans, `""`) are skipped, so `join(items.map((x) => cond && bold(x)))`
 * never leaves a dangling separator.
 */
export function join(items: Insertable[], separator?: Insertable): FormatResult;
export function join<T>(
	items: T[],
	iterator: (item: T, index: number) => Insertable,
	separator?: Insertable,
): FormatResult;
export function join<T>(
	items: (T | Insertable)[],
	iteratorOrSeparator?: ((item: T, index: number) => Insertable) | Insertable,
	maybeSeparator?: Insertable,
): FormatResult {
	const iterator = typeof iteratorOrSeparator === "function" ? iteratorOrSeparator : undefined;
	const separator = toResult(
		(iterator ? maybeSeparator : (iteratorOrSeparator as Insertable)) ?? ", ",
	);

	let text = "";
	const entities: MessageEntity[] = [];

	const append = (piece: FormatResult) => {
		const offset = text.length;
		text += piece.text;
		for (const entity of piece.entities) {
			entities.push({ ...entity, offset: entity.offset + offset });
		}
	};

	let first = true;
	for (let i = 0; i < items.length; i++) {
		const piece = toResult(iterator ? iterator(items[i] as T, i) : (items[i] as Insertable));
		if (piece.text.length === 0) continue;

		if (!first) append(separator);
		append(piece);
		first = false;
	}

	return { text, entities };
}
