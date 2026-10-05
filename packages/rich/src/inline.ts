import type { User } from "@yaebal/core";
import { escapeAttr, escapeMarkdownUrl } from "./escape.js";
import { type Dialect, makeNode, RichError, type RichNode } from "./node.js";
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
 * `![fallback](tg://emoji?id=…)` in markdown. `fallback` is the
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

// --- inline marks and nodes from the "rich html style" / "rich markdown style" docs ---

/** `RichTextMarked`, highlighted text — `<mark>` / `==x==`. */
export const marked = wrap(
	(x) => `==${x}==`,
	(x) => `<mark>${x}</mark>`,
);
/** `RichTextSubscript` — `<sub>`; no markdown token, the raw tag is embedded there too. */
export const subscript = wrap(
	(x) => `<sub>${x}</sub>`,
	(x) => `<sub>${x}</sub>`,
);
/** `RichTextSuperscript` — `<sup>`; no markdown token, the raw tag is embedded there too. */
export const superscript = wrap(
	(x) => `<sup>${x}</sup>`,
	(x) => `<sup>${x}</sup>`,
);

/**
 * `RichTextMathematicalExpression` (inline) — `<tg-math>` / `$x$`
 * (the block form is confirmed as `<tg-math-block>` — see `mathBlock` in
 * blocks.ts). `expression` is raw LaTeX — not markdown-escaped.
 */
export function math(expression: string): RichNode {
	return makeNode("inline", (d) =>
		d === "markdown" ? `$${expression}$` : `<tg-math>${escapeFor(expression, "html")}</tg-math>`,
	);
}

/**
 * `RichTextDateTime`, auto-formatted date-time — `<tg-time unix format>` /
 * `![label](tg://time?unix=…&format=…)`.
 * `format` is telegram's date-time entity format string.
 */
export function dateTime(unixTime: number, format: string, ...items: Insertable[]): RichNode {
	const query = `tg://time?unix=${unixTime}${format ? `&format=${format}` : ""}`;

	return makeNode("inline", (d) =>
		d === "markdown"
			? `![${children(items, d)}](${escapeMarkdownUrl(query)})`
			: `<tg-time unix="${unixTime}"${format ? ` format="${escapeAttr(format)}"` : ""}>${children(items, d)}</tg-time>`,
	);
}

/**
 * `RichTextReference`, a footnote definition — `<tg-reference name>` /
 * `[^name]: …`, the markdown footnote line (place it at line start).
 */
export function reference(name: string, ...items: Insertable[]): RichNode {
	return makeNode("inline", (d) =>
		d === "markdown"
			? `[^${name}]: ${children(items, d)}`
			: `<tg-reference name="${escapeAttr(name)}">${children(items, d)}</tg-reference>`,
	);
}

/** `RichTextReferenceLink`, a link to a `reference()` — `<a href="#name">` / `[^name]`. */
export function referenceLink(name: string, ...items: Insertable[]): RichNode {
	return makeNode("inline", (d) =>
		d === "markdown" ? `[^${name}]` : `<a href="#${escapeAttr(name)}">${children(items, d)}</a>`,
	);
}

// --- buttons (bot api 10.3) ---

/** `RichMessageButton.style`; `"link"` (a borderless link-like button) is for callback buttons only. */
export type ButtonStyle = "danger" | "success" | "primary" | "link";

/** what a `button()` does — exactly one `RichMessageButton` type, as in `<tg-button type="…">`. */
export type ButtonAction =
	| { callbackData: string }
	| { url: string }
	| { webApp: string }
	| { loginUrl: string; forwardText?: string; requestWriteAccess?: boolean }
	| { switchInlineQuery: string }
	| { switchInlineQueryCurrentChat: string }
	| {
			switchInlineQueryChosenChat: string;
			allowUserChats?: boolean;
			allowBotChats?: boolean;
			allowGroupChats?: boolean;
			allowChannelChats?: boolean;
	  }
	| { copyText: string }
	| { disabled: true };

export interface ButtonOptions {
	style?: ButtonStyle;
}

const flag = (name: string, on: boolean | undefined) => (on ? ` ${name}` : "");

function buttonAttrs(action: ButtonAction): string {
	if ("callbackData" in action) {
		if (new TextEncoder().encode(action.callbackData).length > 64)
			throw new RichError("button(): callbackData must be 1-64 bytes");
		return `type="callback_data" data="${escapeAttr(action.callbackData)}"`;
	}
	if ("url" in action) return `type="url" url="${escapeAttr(action.url)}"`;
	if ("webApp" in action) return `type="web_app" url="${escapeAttr(action.webApp)}"`;
	if ("loginUrl" in action) {
		const forward =
			action.forwardText === undefined ? "" : ` forward-text="${escapeAttr(action.forwardText)}"`;
		return `type="login_url" url="${escapeAttr(action.loginUrl)}"${forward}${flag("request-write-access", action.requestWriteAccess)}`;
	}
	if ("switchInlineQuery" in action)
		return `type="switch_inline_query" query="${escapeAttr(action.switchInlineQuery)}"`;
	if ("switchInlineQueryCurrentChat" in action)
		return `type="switch_inline_query_current_chat" query="${escapeAttr(action.switchInlineQueryCurrentChat)}"`;
	if ("switchInlineQueryChosenChat" in action)
		return (
			`type="switch_inline_query_chosen_chat" query="${escapeAttr(action.switchInlineQueryChosenChat)}"` +
			flag("allow-user-chats", action.allowUserChats) +
			flag("allow-bot-chats", action.allowBotChats) +
			flag("allow-group-chats", action.allowGroupChats) +
			flag("allow-channel-chats", action.allowChannelChats)
		);
	if ("copyText" in action) return `type="copy_text" text="${escapeAttr(action.copyText)}"`;
	return `type="disabled"`;
}

/**
 * `RichTextButton` (bot api 10.3), confirmed custom tag `<tg-button>` — a button
 * placed right in the text; group several into a row with `buttons()` (blocks.ts).
 * the label may hold only plain text, `customEmoji()` and `dateTime()`. markdown has
 * no token for it, so the raw html tag is embedded in both dialects.
 *
 * @example
 * paragraph("ready? ", button("start", { callbackData: "start" }, { style: "success" }));
 */
export function button(
	label: Insertable,
	action: ButtonAction,
	options: ButtonOptions = {},
): RichNode {
	if (options.style === "link" && !("callbackData" in action))
		throw new RichError('button(): style "link" is allowed only for callback buttons');
	const attrs = buttonAttrs(action);
	const style = options.style === undefined ? "" : ` style="${options.style}"`;

	// telegram parses the label as html in both dialects (it sits inside an html tag).
	return makeNode(
		"inline",
		() => `<tg-button ${attrs}${style}>${render(label, "html")}</tg-button>`,
	);
}
