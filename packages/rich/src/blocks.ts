import { escapeAttr, escapeText } from "./escape.js";
import { type Insertable, type RichNode, toHtml } from "./inline.js";

function join(children: Insertable[]): string {
	return children.map(toHtml).join("");
}

/** a caption + optional credit for a media/collage/slideshow/map block (`RichBlockCaption`). */
export interface Caption {
	caption?: Insertable;
	/** `RichBlockCaption.credit`, confirmed `<cite>`. */
	credit?: Insertable;
}

function figcaption({ caption, credit }: Caption): string {
	if (caption === undefined && credit === undefined) return "";

	const creditHtml = credit === undefined ? "" : `<cite>${toHtml(credit)}</cite>`;
	return `<figcaption>${toHtml(caption)}${creditHtml}</figcaption>`;
}

// --- confirmed tags ---

/** `RichBlockParagraph`, `<p>`. */
export function paragraph(...children: Insertable[]): RichNode {
	return { html: `<p>${join(children)}</p>` };
}

/** `RichBlockSectionHeading`, `<h1>`–`<h6>`. `level` is telegram's `size` (1 largest, 6 smallest). */
export function heading(level: 1 | 2 | 3 | 4 | 5 | 6, ...children: Insertable[]): RichNode {
	return { html: `<h${level}>${join(children)}</h${level}>` };
}

/** `RichBlockPreformatted`, nested `<pre><code>`, matching classic parse_mode html. */
export function preformatted(text: string, language?: string): RichNode {
	const cls = language ? ` class="language-${escapeAttr(language)}"` : "";
	return { html: `<pre><code${cls}>${escapeText(text)}</code></pre>` };
}

/** `RichBlockFooter`, `<footer>`. */
export function footer(...children: Insertable[]): RichNode {
	return { html: `<footer>${join(children)}</footer>` };
}

/** `RichBlockDivider`, `<hr/>`. */
export function divider(): RichNode {
	return { html: "<hr/>" };
}

/** `RichBlockMathematicalExpression`, confirmed `<tg-math-block>` (LaTeX). */
export function mathBlock(expression: string): RichNode {
	return { html: `<tg-math-block>${escapeText(expression)}</tg-math-block>` };
}

/** `RichBlockAnchor`, `<a name="…">` at block level. */
export function anchorBlock(name: string): RichNode {
	return { html: `<a name="${escapeAttr(name)}"></a>` };
}

/** `RichBlockBlockQuotation`, `<blockquote>`, with an optional `<cite>` credit. */
export function blockquote(children: Insertable[], credit?: Insertable): RichNode {
	const creditHtml = credit === undefined ? "" : `<cite>${toHtml(credit)}</cite>`;
	return { html: `<blockquote>${join(children)}${creditHtml}</blockquote>` };
}

/** `RichBlockPullQuotation`, loosely `<aside>` per the schema, with an optional `<cite>` credit. */
export function pullquote(text: Insertable, credit?: Insertable): RichNode {
	const creditHtml = credit === undefined ? "" : `<cite>${toHtml(credit)}</cite>`;
	return { html: `<aside>${toHtml(text)}${creditHtml}</aside>` };
}

/** `RichBlockCollage`, confirmed custom tag `<tg-collage>`. */
export function collage(blocks: Insertable[], caption: Caption = {}): RichNode {
	return { html: `<tg-collage>${join(blocks)}${figcaption(caption)}</tg-collage>` };
}

/** `RichBlockSlideshow`, confirmed custom tag `<tg-slideshow>`. */
export function slideshow(blocks: Insertable[], caption: Caption = {}): RichNode {
	return { html: `<tg-slideshow>${join(blocks)}${figcaption(caption)}</tg-slideshow>` };
}

export interface TableCellOptions {
	header?: boolean;
	colspan?: number;
	rowspan?: number;
	/** default `"left"`, matching `RichBlockTableCell.align`. */
	align?: "left" | "center" | "right";
	/** default `"top"`, matching `RichBlockTableCell.valign`. */
	valign?: "top" | "middle" | "bottom";
}

/** one `<td>`/`<th>` cell; `content` omitted ⇒ an invisible cell (per `RichBlockTableCell`). */
export function cell(content?: Insertable, options: TableCellOptions = {}): RichNode {
	const tag = options.header ? "th" : "td";
	const attrs =
		(options.colspan ? ` colspan="${options.colspan}"` : "") +
		(options.rowspan ? ` rowspan="${options.rowspan}"` : "") +
		// `align`/`valign` are telegram's own field names for this cell — the values
		// (left/center/right, top/middle/bottom) match the classic html attributes exactly.
		(options.align ? ` align="${options.align}"` : "") +
		(options.valign ? ` valign="${options.valign}"` : "");

	return {
		html:
			content === undefined
				? `<${tag}${attrs}></${tag}>`
				: `<${tag}${attrs}>${toHtml(content)}</${tag}>`,
	};
}

export interface TableOptions {
	/** best-effort: rendered as the `border` attribute. */
	bordered?: boolean;
	/** best-effort: no standard html equivalent, rendered as `data-striped`. */
	striped?: boolean;
	caption?: Insertable;
}

/** `RichBlockTable`, confirmed `<table>`. build rows with `cell()`. */
export function table(rows: Insertable[][], options: TableOptions = {}): RichNode {
	const attrs = (options.bordered ? " border" : "") + (options.striped ? " data-striped" : "");
	const body = rows.map((row) => `<tr>${join(row)}</tr>`).join("");
	const captionHtml =
		options.caption === undefined ? "" : `<caption>${toHtml(options.caption)}</caption>`;

	return { html: `<table${attrs}>${captionHtml}${body}</table>` };
}

export interface DetailsOptions {
	/** `RichBlockDetails.is_open` — content visible by default. defaults to `false`. */
	open?: boolean;
}

/** `RichBlockDetails`, confirmed `<details>`/`<summary>`. */
export function details(
	summary: Insertable,
	blocks: Insertable[],
	options: DetailsOptions = {},
): RichNode {
	return {
		html: `<details${options.open ? " open" : ""}><summary>${toHtml(summary)}</summary>${join(blocks)}</details>`,
	};
}

export interface ListItemOptions {
	/** an unchecked/checked checkbox prefix (`RichBlockListItem.has_checkbox`/`is_checked`). */
	checkbox?: boolean;
	checked?: boolean;
	/** ordered-list numeric override (`RichBlockListItem.value`) — standard `<li value>`. */
	value?: number;
	/** ordered-list label style override (`RichBlockListItem.type`) — standard `<li type>`. */
	type?: "a" | "A" | "i" | "I";
}

/** one `<li>` for `list()`. */
export function item(blocks: Insertable[], options: ListItemOptions = {}): RichNode {
	const attrs =
		(options.value !== undefined ? ` value="${options.value}"` : "") +
		(options.type ? ` type="${options.type}"` : "");

	const checkboxHtml =
		options.checkbox === undefined
			? ""
			: `<input type="checkbox"${options.checked ? " checked" : ""}/> `;

	return { html: `<li${attrs}>${checkboxHtml}${join(blocks)}</li>` };
}

export interface ListOptions {
	/** `<ol>` instead of `<ul>`. defaults to `false`. */
	ordered?: boolean;
}

/** `RichBlockList`, `<ul>`/`<ol>` of `item()`s. */
export function list(items: Insertable[], options: ListOptions = {}): RichNode {
	const tag = options.ordered ? "ol" : "ul";
	return { html: `<${tag}>${join(items)}</${tag}>` };
}

export interface MapOptions {
	/** 13–20, per `RichBlockMap.zoom`. */
	zoom: number;
	width: number;
	height: number;
}

/**
 * `RichBlockMap`, confirmed custom tag `<tg-map>` — attribute names/encoding are a
 * best-effort guess (lat/long/zoom/width/height are telegram's own field names).
 */
export function map(
	location: { latitude: number; longitude: number },
	options: MapOptions,
	caption: Caption = {},
): RichNode {
	const attrs =
		` latitude="${location.latitude}" longitude="${location.longitude}"` +
		` zoom="${options.zoom}" width="${options.width}" height="${options.height}"`;

	return { html: `<tg-map${attrs}>${figcaption(caption)}</tg-map>` };
}

export interface MediaOptions extends Caption {
	/** cover the media with a spoiler animation until tapped. */
	spoiler?: boolean;
}

function figure(tag: string, src: string, options: MediaOptions): RichNode {
	const spoilerAttr = options.spoiler ? " data-media-spoiler" : "";
	const media = `<${tag} src="${escapeAttr(src)}"${spoilerAttr}></${tag}>`;
	const cap = figcaption(options);

	return { html: cap ? `<figure>${media}${cap}</figure>` : media };
}

/**
 * `RichBlockPhoto`, confirmed `<img>`. media is referenced by url — `sendRichMessage`
 * has no multipart/`attach://` upload path (unlike `sendPhoto`), so there is no
 * `MediaSource` overload here; host the file and pass its url.
 */
export function image(src: string, options: MediaOptions = {}): RichNode {
	return figure("img", src, options);
}

/**
 * `RichBlockVideo` **and** `RichBlockAnimation` both map to `<video>` per the
 * schema (telegram tells the two apart server-side, e.g. by looping/silence —
 * not by tag). there is no separate `animation()` builder for that reason.
 */
export function video(src: string, options: MediaOptions = {}): RichNode {
	return figure("video", src, options);
}

/**
 * `RichBlockAudio` **and** `RichBlockVoiceNote` both map to `<audio>` per the
 * schema (again disambiguated server-side, not by tag) — there is no separate
 * `voiceNote()` builder for that reason.
 */
export function audio(src: string, options: MediaOptions = {}): RichNode {
	return figure("audio", src, options);
}

/**
 * `RichBlockThinking`, confirmed custom tag `<tg-thinking>`. **draft-only** — the
 * schema states it can be used in `sendRichMessageDraft` payloads but is never
 * received back on a real message. see `RichMessageDraft` in draft.ts.
 */
export function thinking(...children: Insertable[]): RichNode {
	return { html: `<tg-thinking>${join(children)}</tg-thinking>` };
}
