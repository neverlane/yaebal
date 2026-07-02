import type { User } from "@yaebal/core";
import { escapeAttr, escapeText } from "./escape.js";

/**
 * a fragment of the extended html telegram parses into a `RichMessage` (see
 * `InputRichMessage.html`). unlike `@yaebal/fmt`'s `FormatResult` (a flat
 * `{ text, entities }` pair), rich messages are a block tree parsed server-side —
 * there is nothing to build client-side except this html string.
 */
export interface RichNode {
	readonly html: string;
}

export type Insertable = RichNode | string | number | bigint | boolean | null | undefined;

export function isRichNode(value: unknown): value is RichNode {
	return (
		typeof value === "object" && value !== null && typeof (value as RichNode).html === "string"
	);
}

/** render one interpolation: a `RichNode` is spliced raw, anything else is escaped text. */
export function toHtml(value: Insertable): string {
	if (isRichNode(value)) return value.html;
	return value == null ? "" : escapeText(String(value));
}

function join(children: Insertable[]): string {
	return children.map(toHtml).join("");
}

function wrap(tag: string) {
	return (...children: Insertable[]): RichNode => ({ html: `<${tag}>${join(children)}</${tag}>` });
}

/**
 * an extended-html template: interpolations are auto-escaped (never re-parsed as
 * markup), and a nested `RichNode` (from these builders, or another `html`
 * template) is spliced in raw. mirrors `@yaebal/fmt`'s `html` tag, but for the
 * rich-message dialect instead of the classic entity one.
 */
export function html(strings: TemplateStringsArray, ...subs: Insertable[]): RichNode {
	let out = "";

	for (let i = 0; i < strings.length; i++) {
		out += strings[i] ?? "";
		if (i < subs.length) out += toHtml(subs[i]);
	}

	return { html: out };
}

// --- inline marks — confirmed tags (same dialect as classic parse_mode html) ---

/** `RichTextBold`, `<b>`. */
export const bold = wrap("b");
/** `RichTextItalic`, `<i>`. */
export const italic = wrap("i");
/** `RichTextUnderline`, `<u>`. */
export const underline = wrap("u");
/** `RichTextStrikethrough`, `<s>`. */
export const strikethrough = wrap("s");
/** `RichTextSpoiler`, `<tg-spoiler>`. */
export const spoiler = wrap("tg-spoiler");
/** `RichTextCode`, `<code>`. */
export const code = wrap("code");

/**
 * `RichTextCustomEmoji`, `<tg-emoji emoji-id="…">`. same custom tag classic
 * `parse_mode: "HTML"` uses for custom emoji — telegram documents it as reused
 * verbatim here. `fallback` is the plain emoji shown where custom emoji can't render.
 */
export function customEmoji(emojiId: string, fallback: string): RichNode {
	return { html: `<tg-emoji emoji-id="${escapeAttr(emojiId)}">${escapeText(fallback)}</tg-emoji>` };
}

/**
 * `RichTextTextMention`, a mention of a user who may have no `@username` — same
 * `tg://user?id=…` link telegram's classic html dialect uses for `text_mention`.
 * for `@username` mentions (`RichTextMention`), just write `@username` as plain
 * text — the schema lists it as auto-detected (see `skipEntityDetection`).
 */
export function textMention(user: Pick<User, "id">, ...children: Insertable[]): RichNode {
	return { html: `<a href="tg://user?id=${user.id}">${join(children)}</a>` };
}

/** `RichTextUrl`, an explicit link. for a bare auto-linked url, just write it as plain text. */
export function link(url: string, ...children: Insertable[]): RichNode {
	return { html: `<a href="${escapeAttr(url)}">${join(children)}</a>` };
}

/** `RichTextAnchor` (inline form) — a named jump target, `<a name="…">`. */
export function anchor(name: string): RichNode {
	return { html: `<a name="${escapeAttr(name)}"></a>` };
}

/**
 * `RichTextAnchorLink`, a link to an `anchor()` elsewhere in the message —
 * `<a href="#name">`. an empty `name` jumps back to the top (per the schema).
 */
export function anchorLink(name: string, ...children: Insertable[]): RichNode {
	return { html: `<a href="#${escapeAttr(name)}">${join(children)}</a>` };
}

// --- inline marks — best-effort tags ---
//
// telegram's schema names these types and their fields, but (as scraped) does not
// state an explicit "corresponding to the html tag …" for them the way it does for
// bold/italic/code/etc above. the guesses below follow telegram's own pattern of
// reusing standard html5 semantics (sub/sup/mark/time) or its `tg-*` custom-tag
// convention — verify against the live "rich message formatting options" docs
// before depending on the exact tag/attribute spelling in production.

/** `RichTextMarked`, best-effort `<mark>` (standard html5 highlight). */
export const marked = wrap("mark");
/** `RichTextSubscript`, best-effort `<sub>`. */
export const subscript = wrap("sub");
/** `RichTextSuperscript`, best-effort `<sup>`. */
export const superscript = wrap("sup");

/**
 * `RichTextMathematicalExpression` (inline), best-effort `<tg-math>` (the block
 * form is confirmed as `<tg-math-block>` — see `mathBlock` in blocks.ts).
 */
export function math(expression: string): RichNode {
	return { html: `<tg-math>${escapeText(expression)}</tg-math>` };
}

/**
 * `RichTextDateTime`, best-effort `<time>`. `format` is telegram's date-time
 * entity format string; attribute name is a guess (`data-format`).
 */
export function dateTime(unixTime: number, format: string, ...children: Insertable[]): RichNode {
	return {
		html: `<time datetime="${unixTime}" data-format="${escapeAttr(format)}">${join(children)}</time>`,
	};
}

/**
 * `RichTextReference`, a footnote definition. no tag is documented anywhere in
 * the scraped schema — this is a from-scratch `tg-*`-style guess.
 */
export function reference(name: string, ...children: Insertable[]): RichNode {
	return { html: `<tg-reference name="${escapeAttr(name)}">${join(children)}</tg-reference>` };
}

/** `RichTextReferenceLink`, a link to a `reference()`. same caveat as `reference`. */
export function referenceLink(name: string, ...children: Insertable[]): RichNode {
	return {
		html: `<tg-reference-link name="${escapeAttr(name)}">${join(children)}</tg-reference-link>`,
	};
}
