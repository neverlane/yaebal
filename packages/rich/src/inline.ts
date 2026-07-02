import type { User } from "@yaebal/core";
import { escapeAttr, escapeMarkdownUrl } from "./escape.js";
import { type Dialect, makeNode, type RichNode } from "./node.js";
import { escapeFor, type Insertable, render } from "./render.js";

// every builder here returns a dialect-agnostic `RichNode` — the html/markdown
// choice happens once, at the `html`/`md`/`document()` boundary. children render
// lazily, so a node built from user input is safe in either dialect.

function children(items: Insertable[], dialect: Dialect): string {
	return items.map((item) => render(item, dialect)).join("");
}

// a wrapper mark: same shape in both dialects, differing only in the surrounding tokens.
function wrap(md: (inner: string) => string, html: (inner: string) => string) {
	return (...items: Insertable[]): RichNode =>
		makeNode("inline", (d) => (d === "markdown" ? md : html)(children(items, d)));
}

// --- inline marks — confirmed tags (same dialect as classic parse_mode html) ---

/** `RichTextBold` — `<b>` / `**x**`. */
export const bold = wrap(
	(x) => `**${x}**`,
	(x) => `<b>${x}</b>`,
);
/** `RichTextItalic` — `<i>` / `*x*`. */
export const italic = wrap(
	(x) => `*${x}*`,
	(x) => `<i>${x}</i>`,
);
/** `RichTextUnderline` — `<u>`; no markdown token, the raw tag is embedded there too. */
export const underline = wrap(
	(x) => `<u>${x}</u>`,
	(x) => `<u>${x}</u>`,
);
/** `RichTextStrikethrough` — `<s>` / `~~x~~`. */
export const strikethrough = wrap(
	(x) => `~~${x}~~`,
	(x) => `<s>${x}</s>`,
);
/** `RichTextSpoiler` — `<tg-spoiler>` / `||x||`. */
export const spoiler = wrap(
	(x) => `||${x}||`,
	(x) => `<tg-spoiler>${x}</tg-spoiler>`,
);
/** `RichTextCode` — `<code>` / `` `x` ``. */
export const code = wrap(
	(x) => `\`${x}\``,
	(x) => `<code>${x}</code>`,
);

/** line break — hard newline in markdown, `<br/>` in html. */
export function br(): RichNode {
	return makeNode("inline", (d) => (d === "markdown" ? "\n" : "<br/>"));
}

/**
 * `RichTextCustomEmoji` — `<tg-emoji emoji-id="…">`, the same custom tag classic
 * `parse_mode: "HTML"` uses (telegram documents it as reused verbatim here);
 * best-effort `![fallback](tg://emoji?id=…)` in markdown. `fallback` is the
 * plain emoji shown where custom emoji can't render.
 */
export function customEmoji(emojiId: string, fallback: string): RichNode {
	return makeNode("inline", (d) =>
		d === "markdown"
			? `![${escapeFor(fallback, d)}](${escapeMarkdownUrl(`tg://emoji?id=${emojiId}`)})`
			: `<tg-emoji emoji-id="${escapeAttr(emojiId)}">${escapeFor(fallback, d)}</tg-emoji>`,
	);
}

// a markdown link destination: `[text](url)` is terminated by `)` or whitespace,
// so the url must be escaped to keep an attacker-controlled value inside the link.
function mdLink(text: string, url: string): string {
	return `[${text}](${escapeMarkdownUrl(url)})`;
}

/** `RichTextUrl`, an explicit link. for a bare auto-linked url, just write it as plain text. */
export function link(url: string, ...items: Insertable[]): RichNode {
	return makeNode("inline", (d) =>
		d === "markdown"
			? mdLink(children(items, d), url)
			: `<a href="${escapeAttr(url)}">${children(items, d)}</a>`,
	);
}

/**
 * `RichTextTextMention`, a mention of a user who may have no `@username` — the
 * same `tg://user?id=…` link telegram's classic dialects use for `text_mention`.
 * for `@username` mentions (`RichTextMention`), just write `@username` as plain
 * text — the schema lists it as auto-detected (see `noEntityDetection`).
 */
export function textMention(user: Pick<User, "id">, ...items: Insertable[]): RichNode {
	return link(`tg://user?id=${user.id}`, ...items);
}

/** `RichTextAnchor` (inline form) — a named jump target, `<a name="…">` in both dialects. */
export function anchor(name: string): RichNode {
	return makeNode("inline", () => `<a name="${escapeAttr(name)}"></a>`);
}

/**
 * `RichTextAnchorLink`, a link to an `anchor()` elsewhere in the message —
 * `<a href="#name">` / `[text](#name)`. an empty `name` jumps back to the top
 * (per the schema).
 */
export function anchorLink(name: string, ...items: Insertable[]): RichNode {
	return makeNode("inline", (d) =>
		d === "markdown"
			? mdLink(children(items, d), `#${name}`)
			: `<a href="#${escapeAttr(name)}">${children(items, d)}</a>`,
	);
}

// --- inline marks — best-effort tags ---
//
// telegram's schema names these types and their fields, but (as scraped) does not
// state an explicit "corresponding to the html tag …" for them the way it does for
// bold/italic/code/etc above. the guesses below follow telegram's own pattern of
// reusing standard html5 semantics (sub/sup/mark/time) or its `tg-*` custom-tag
// convention — verify against the live "rich message formatting options" docs
// before depending on the exact tag/attribute spelling in production.

/** `RichTextMarked`, highlighted text — best-effort `<mark>` / `==x==`. */
export const marked = wrap(
	(x) => `==${x}==`,
	(x) => `<mark>${x}</mark>`,
);
/** `RichTextSubscript` — best-effort `<sub>`; no markdown token, raw tag embedded there too. */
export const subscript = wrap(
	(x) => `<sub>${x}</sub>`,
	(x) => `<sub>${x}</sub>`,
);
/** `RichTextSuperscript` — best-effort `<sup>`; no markdown token, raw tag embedded there too. */
export const superscript = wrap(
	(x) => `<sup>${x}</sup>`,
	(x) => `<sup>${x}</sup>`,
);

/**
 * `RichTextMathematicalExpression` (inline) — best-effort `<tg-math>` / `$x$`
 * (the block form is confirmed as `<tg-math-block>` — see `mathBlock` in
 * blocks.ts). `expression` is raw LaTeX — not markdown-escaped.
 */
export function math(expression: string): RichNode {
	return makeNode("inline", (d) =>
		d === "markdown" ? `$${expression}$` : `<tg-math>${escapeFor(expression, "html")}</tg-math>`,
	);
}

/**
 * `RichTextDateTime`, auto-formatted date-time — best-effort `<time>` (attribute
 * name `data-format` is a guess) / `![label](tg://time?unix=…&format=…)`.
 * `format` is telegram's date-time entity format string.
 */
export function dateTime(unixTime: number, format: string, ...items: Insertable[]): RichNode {
	const query = `tg://time?unix=${unixTime}${format ? `&format=${format}` : ""}`;

	return makeNode("inline", (d) =>
		d === "markdown"
			? `![${children(items, d)}](${escapeMarkdownUrl(query)})`
			: `<time datetime="${unixTime}" data-format="${escapeAttr(format)}">${children(items, d)}</time>`,
	);
}

/**
 * `RichTextReference`, a footnote definition. no tag is documented anywhere in
 * the scraped schema — `<tg-reference>` is a from-scratch `tg-*`-style guess,
 * `[^name]: …` the standard markdown footnote line (place it at line start).
 */
export function reference(name: string, ...items: Insertable[]): RichNode {
	return makeNode("inline", (d) =>
		d === "markdown"
			? `[^${name}]: ${children(items, d)}`
			: `<tg-reference name="${escapeAttr(name)}">${children(items, d)}</tg-reference>`,
	);
}

/** `RichTextReferenceLink`, a link to a `reference()` — same caveat as `reference`. */
export function referenceLink(name: string, ...items: Insertable[]): RichNode {
	return makeNode("inline", (d) =>
		d === "markdown"
			? `[^${name}]`
			: `<tg-reference-link name="${escapeAttr(name)}">${children(items, d)}</tg-reference-link>`,
	);
}
