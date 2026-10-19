import type * as t from "@yaebal/types";

/**
 * a `format`/`fmt` result — `{ text, entities }` and nothing else. the positional sugar
 * (`send(text, extra)`, `editText(text, extra)`, …) takes one in place of a string; the api
 * client's format hook splits it into the text field and its `*_entities` sibling.
 */
export interface Formatted {
	text: string;
	entities: t.MessageEntity[];
}

/**
 * exactly a format result. an object with any other key is the params-object overload, so
 * `editText({ text, reply_markup })` keeps meaning what it says.
 */
export function isFormatted(value: unknown): value is Formatted {
	return (
		typeof value === "object" &&
		value !== null &&
		typeof (value as Formatted).text === "string" &&
		Array.isArray((value as Formatted).entities) &&
		Object.keys(value).every((key) => key === "text" || key === "entities")
	);
}
