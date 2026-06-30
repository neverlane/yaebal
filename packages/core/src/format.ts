import type { MessageEntity } from "./telegram-types.js";

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

type Insertable = Stringable | FormatResult | string | number | bigint;

function isFormatResult(value: unknown): value is FormatResult {
	return (
		typeof value === "object" &&
		value !== null &&
		"text" in value &&
		"entities" in value &&
		Array.isArray((value as FormatResult).entities)
	);
}

/** stitches the literal parts and interpolations into one `{ text, entities }`. */
export function format(strings: TemplateStringsArray, ...subs: Insertable[]): FormatResult {
	let text = "";
	const entities: MessageEntity[] = [];

	for (let i = 0; i < strings.length; i++) {
		text += strings[i] ?? "";

		if (i < subs.length) {
			const sub = subs[i] as Insertable;
			const offset = text.length;

			if (isFormatResult(sub)) {
				text += sub.text;

				for (const entity of sub.entities) {
					entities.push({ ...entity, offset: entity.offset + offset });
				}
			} else {
				text += String(sub);
			}
		}
	}

	return { text, entities };
}

function wrap(type: string, extra: Partial<MessageEntity> = {}) {
	return (value: string): Stringable =>
		new Stringable(value, [{ type, offset: 0, length: value.length, ...extra }]);
}

export const bold = wrap("bold");
export const italic = wrap("italic");
export const underline = wrap("underline");
export const strikethrough = wrap("strikethrough");
export const spoiler = wrap("spoiler");
export const code = wrap("code");
export const pre = wrap("pre");

export function link(text: string, url: string): Stringable {
	return new Stringable(text, [{ type: "text_link", offset: 0, length: text.length, url }]);
}

export function mention(text: string, user: { id: number }): Stringable {
	return new Stringable(text, [
		{ type: "text_mention", offset: 0, length: text.length, user: user as never },
	]);
}
