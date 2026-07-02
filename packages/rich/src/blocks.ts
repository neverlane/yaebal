import { escapeAttr, escapeMarkdownUrl } from "./escape.js";
import { type Dialect, isRichNode, makeNode, type RichNode } from "./node.js";
import { escapeFor, type Insertable, render } from "./render.js";

// every builder here returns a dialect-agnostic block `RichNode`; the
// html/markdown choice happens at the `html`/`md`/`document()` boundary.
// where telegram's rich-markdown dialect has no native token for a block
// (footer, pull-quote, collage/slideshow, map, details, thinking), the raw html
// tag is embedded as-is — telegram's markdown parser accepts embedded html
// blocks as long as they are blank-line-separated from surrounding content.

function children(items: Insertable[], dialect: Dialect): string {
	return items.map((item) => render(item, dialect)).join("");
}

/** a caption + optional credit for a media/collage/slideshow/map block (`RichBlockCaption`). */
export interface Caption {
	caption?: Insertable;
	/** `RichBlockCaption.credit`, confirmed `<cite>`. */
	credit?: Insertable;
}

function figcaption({ caption, credit }: Caption, dialect: Dialect): string {
	if (caption === undefined && credit === undefined) return "";

	const creditHtml = credit === undefined ? "" : `<cite>${render(credit, dialect)}</cite>`;
	return `<figcaption>${render(caption, dialect)}${creditHtml}</figcaption>`;
}

// --- confirmed tags ---

/** `RichBlockParagraph` — `<p>` in html, bare text in markdown (blocks are blank-line-joined). */
export function paragraph(...items: Insertable[]): RichNode {
	return makeNode("block", (d) =>
		d === "markdown" ? children(items, d) : `<p>${children(items, d)}</p>`,
	);
}

/** `RichBlockSectionHeading` — `<h1>`–`<h6>` / `#`–`######`. `level` is telegram's `size` (1 largest). */
export function heading(level: 1 | 2 | 3 | 4 | 5 | 6, ...items: Insertable[]): RichNode {
	return makeNode("block", (d) =>
		d === "markdown"
			? `${"#".repeat(level)} ${children(items, d)}`
			: `<h${level}>${children(items, d)}</h${level}>`,
	);
}

/** `heading(1, …)`. */
export const h1 = (...items: Insertable[]): RichNode => heading(1, ...items);
/** `heading(2, …)`. */
export const h2 = (...items: Insertable[]): RichNode => heading(2, ...items);
/** `heading(3, …)`. */
export const h3 = (...items: Insertable[]): RichNode => heading(3, ...items);
/** `heading(4, …)`. */
export const h4 = (...items: Insertable[]): RichNode => heading(4, ...items);
/** `heading(5, …)`. */
export const h5 = (...items: Insertable[]): RichNode => heading(5, ...items);
/** `heading(6, …)`. */
export const h6 = (...items: Insertable[]): RichNode => heading(6, ...items);

/**
 * `RichBlockPreformatted` — nested `<pre><code>` (matching classic parse_mode
 * html) / a fenced code block. `text` is raw code: html-escaped in the html
 * dialect, emitted verbatim inside the markdown fence.
 */
export function preformatted(text: string, language?: string): RichNode {
	return makeNode("block", (d) => {
		if (d === "markdown") return `\`\`\`${language ?? ""}\n${text}\n\`\`\``;

		const cls = language ? ` class="language-${escapeAttr(language)}"` : "";
		return `<pre><code${cls}>${escapeFor(text, "html")}</code></pre>`;
	});
}

/** `RichBlockFooter` — `<footer>`; no markdown token, raw tag embedded there too. */
export function footer(...items: Insertable[]): RichNode {
	return makeNode("block", (d) => `<footer>${children(items, d)}</footer>`);
}

/** `RichBlockDivider` — `<hr/>` / `---`. */
export function divider(): RichNode {
	return makeNode("block", (d) => (d === "markdown" ? "---" : "<hr/>"));
}

/** `RichBlockMathematicalExpression` — confirmed `<tg-math-block>` / `$$…$$` (raw LaTeX, unescaped in markdown). */
export function mathBlock(expression: string): RichNode {
	return makeNode("block", (d) =>
		d === "markdown"
			? `$$${expression}$$`
			: `<tg-math-block>${escapeFor(expression, "html")}</tg-math-block>`,
	);
}

/** `RichBlockAnchor` — `<a name="…">` at block level, in both dialects. */
export function anchorBlock(name: string): RichNode {
	return makeNode("block", () => `<a name="${escapeAttr(name)}"></a>`);
}

/**
 * `RichBlockBlockQuotation` — `<blockquote>` with an optional `<cite>` credit;
 * `>`-prefixed lines in markdown (each array item becomes its own line, the
 * credit a trailing `> — credit` line).
 */
export function blockquote(items: Insertable[], credit?: Insertable): RichNode {
	return makeNode("block", (d) => {
		if (d === "markdown") {
			const body = items
				.map((item) =>
					render(item, d)
						.split("\n")
						.map((line) => `>${line}`)
						.join("\n"),
				)
				.join("\n");
			const creditLine = credit === undefined ? "" : `\n> — ${render(credit, d)}`;

			return `${body}${creditLine}`;
		}

		const creditHtml = credit === undefined ? "" : `<cite>${render(credit, d)}</cite>`;
		return `<blockquote>${children(items, d)}${creditHtml}</blockquote>`;
	});
}

/** `RichBlockPullQuotation` — loosely `<aside>` per the schema, with an optional `<cite>` credit. */
export function pullquote(text: Insertable, credit?: Insertable): RichNode {
	return makeNode("block", (d) => {
		const creditHtml = credit === undefined ? "" : `<cite>${render(credit, d)}</cite>`;
		return `<aside>${render(text, d)}${creditHtml}</aside>`;
	});
}

// media inside an embedded html block must be blank-line-separated for
// telegram's markdown parser to pick it up.
function mediaGroup(tag: string, blocks: Insertable[], caption: Caption): RichNode {
	return makeNode("block", (d) => {
		const cap = figcaption(caption, d);

		if (d === "markdown") {
			return `<${tag}>\n\n${blocks.map((b) => render(b, d)).join("\n\n")}\n\n${cap}</${tag}>`;
		}

		return `<${tag}>${children(blocks, d)}${cap}</${tag}>`;
	});
}

/** `RichBlockCollage` — confirmed custom tag `<tg-collage>` (raw in markdown too). */
export function collage(blocks: Insertable[], caption: Caption = {}): RichNode {
	return mediaGroup("tg-collage", blocks, caption);
}

/** `RichBlockSlideshow` — confirmed custom tag `<tg-slideshow>` (raw in markdown too). */
export function slideshow(blocks: Insertable[], caption: Caption = {}): RichNode {
	return mediaGroup("tg-slideshow", blocks, caption);
}

// --- tables ---

const TABLE_CELL = Symbol.for("yaebal.rich.table-cell");

export interface TableCellOptions {
	/** `<th>` instead of `<td>`. html-only — gfm's header is structural (see `table`). */
	header?: boolean;
	/** html-only — gfm has no cell spans. */
	colspan?: number;
	/** html-only — gfm has no cell spans. */
	rowspan?: number;
	/** default `"left"`, matching `RichBlockTableCell.align`. feeds gfm's column alignment row. */
	align?: "left" | "center" | "right";
	/** default `"top"`, matching `RichBlockTableCell.valign`. html-only. */
	valign?: "top" | "middle" | "bottom";
}

/** one table cell — a `RichNode` carrying its options so `table()` can read the gfm alignment. */
export interface TableCell extends RichNode {
	readonly [TABLE_CELL]: true;
	readonly align?: "left" | "center" | "right";
}

function isTableCell(value: unknown): value is TableCell {
	return (
		typeof value === "object" &&
		value !== null &&
		(value as Record<symbol, unknown>)[TABLE_CELL] === true
	);
}

/** one `<td>`/`<th>` cell; `content` omitted ⇒ an invisible cell (per `RichBlockTableCell`). */
export function cell(content?: Insertable, options: TableCellOptions = {}): TableCell {
	const tag = options.header ? "th" : "td";
	const attrs =
		(options.colspan ? ` colspan="${options.colspan}"` : "") +
		(options.rowspan ? ` rowspan="${options.rowspan}"` : "") +
		// `align`/`valign` are telegram's own field names for this cell — the values
		// (left/center/right, top/middle/bottom) match the classic html attributes exactly.
		(options.align ? ` align="${options.align}"` : "") +
		(options.valign ? ` valign="${options.valign}"` : "");

	const node = makeNode("inline", (d) => {
		// markdown: bare cell text — `table()` owns the `|` framing and the alignment
		// row; colspan/rowspan/valign/header have no gfm equivalent and are dropped.
		if (d === "markdown") return content === undefined ? "" : render(content, d);

		return `<${tag}${attrs}>${content === undefined ? "" : render(content, d)}</${tag}>`;
	});

	return Object.assign(node, { [TABLE_CELL]: true as const, align: options.align });
}

export interface TableOptions {
	/** best-effort: rendered as the `border` attribute. html-only. */
	bordered?: boolean;
	/** best-effort: no standard html equivalent, rendered as `data-striped`. html-only. */
	striped?: boolean;
	/** `<caption>` in html; a leading caption line in markdown. */
	caption?: Insertable;
}

const ALIGN_MARKER: Record<"left" | "center" | "right", string> = {
	left: ":--",
	center: ":-:",
	right: "--:",
};

/**
 * `RichBlockTable`, confirmed `<table>` / a gfm table. build cells with `cell()`
 * (a bare value is wrapped in a plain `cell()` automatically). gfm structurally
 * requires a header row, so in markdown `rows[0]` always renders as the header
 * line and `colspan`/`rowspan`/`valign`/`header`/`bordered`/`striped` are
 * dropped; in html the header is per-cell opt-in (`cell(x, { header: true })`).
 */
export function table(rows: Insertable[][], options: TableOptions = {}): RichNode {
	const cells = rows.map((row) => row.map((c) => (isTableCell(c) ? c : cell(c))));

	return makeNode("block", (d) => {
		if (d === "markdown") {
			// cell content is markdown-escaped by render(), so `|` inside a cell is pipe-safe.
			const line = (row: TableCell[]) => `| ${row.map((c) => c.render(d)).join(" | ")} |`;
			const head = cells[0] ?? [];
			const separator = `| ${head.map((c) => ALIGN_MARKER[c.align ?? "left"]).join(" | ")} |`;
			const captionLine = options.caption === undefined ? "" : `${render(options.caption, d)}\n\n`;

			return `${captionLine}${[line(head), separator, ...cells.slice(1).map(line)].join("\n")}`;
		}

		const attrs = (options.bordered ? " border" : "") + (options.striped ? " data-striped" : "");
		const captionHtml =
			options.caption === undefined ? "" : `<caption>${render(options.caption, d)}</caption>`;
		const body = cells.map((row) => `<tr>${row.map((c) => c.render(d)).join("")}</tr>`).join("");

		return `<table${attrs}>${captionHtml}${body}</table>`;
	});
}

export interface DetailsOptions {
	/** `RichBlockDetails.is_open` — content visible by default. defaults to `false`. */
	open?: boolean;
}

/**
 * `RichBlockDetails`, confirmed `<details>`/`<summary>` (an html-only tag, legal
 * inside markdown too — there the body must be blank-line-separated or telegram
 * renders it as literal text).
 */
export function details(
	summary: Insertable,
	blocks: Insertable[],
	options: DetailsOptions = {},
): RichNode {
	return makeNode("block", (d) => {
		const head = `<details${options.open ? " open" : ""}><summary>${render(summary, d)}</summary>`;

		return d === "markdown"
			? `${head}\n\n${blocks.map((b) => render(b, d)).join("\n\n")}\n\n</details>`
			: `${head}${children(blocks, d)}</details>`;
	});
}

// --- lists ---

const LIST_ITEM = Symbol.for("yaebal.rich.list-item");

export interface ListItemOptions {
	/** an unchecked/checked checkbox prefix (`RichBlockListItem.has_checkbox`/`is_checked`). */
	checkbox?: boolean;
	checked?: boolean;
	/** ordered-list numeric override (`RichBlockListItem.value`) — standard `<li value>`; restarts gfm numbering. */
	value?: number;
	/** ordered-list label style override (`RichBlockListItem.type`) — standard `<li type>`. html-only. */
	type?: "a" | "A" | "i" | "I";
}

/** one list item — a `RichNode` carrying its options so `list()` can number/prefix it. */
export interface ListItem extends RichNode {
	readonly [LIST_ITEM]: true;
	readonly value?: number;
}

function isListItem(value: unknown): value is ListItem {
	return (
		typeof value === "object" &&
		value !== null &&
		(value as Record<symbol, unknown>)[LIST_ITEM] === true
	);
}

/** one `<li>` for `list()` — only needed when a plain value isn't enough (checkbox, value, type). */
export function item(blocks: Insertable[], options: ListItemOptions = {}): ListItem {
	const node = makeNode("inline", (d) => {
		if (d === "markdown") {
			// `- ` / `1. ` markers belong to list(); the item contributes the checkbox + content.
			const checkbox = options.checkbox === undefined ? "" : `[${options.checked ? "x" : " "}] `;
			return `${checkbox}${blocks.map((b) => render(b, d)).join("")}`;
		}

		const attrs =
			(options.value !== undefined ? ` value="${options.value}"` : "") +
			(options.type ? ` type="${options.type}"` : "");
		const checkboxHtml =
			options.checkbox === undefined
				? ""
				: `<input type="checkbox"${options.checked ? " checked" : ""}/> `;

		return `<li${attrs}>${checkboxHtml}${children(blocks, d)}</li>`;
	});

	return Object.assign(node, { [LIST_ITEM]: true as const, value: options.value });
}

export interface ListOptions {
	/** `<ol>` instead of `<ul>`. defaults to `false`. */
	ordered?: boolean;
	/** first number of an ordered list — standard `<ol start>` / the first gfm marker. */
	start?: number;
}

/**
 * `RichBlockList` — `<ul>`/`<ol>` / `- `/`1. ` lines. entries may be plain
 * values (wrapped in a default `item()` automatically) or explicit `item()`s
 * for checkboxes and numbering overrides.
 */
export function list(entries: Insertable[], options: ListOptions = {}): RichNode {
	const items = entries.map((entry) => (isListItem(entry) ? entry : item([entry])));

	return makeNode("block", (d) => {
		if (d === "markdown") {
			let counter = options.start ?? 1;

			return items
				.map((it) => {
					if (it.value !== undefined) counter = it.value;
					const marker = options.ordered ? `${counter++}.` : "-";

					return `${marker} ${it.render(d)}`;
				})
				.join("\n");
		}

		const tag = options.ordered ? "ol" : "ul";
		const start = options.ordered && options.start !== undefined ? ` start="${options.start}"` : "";

		return `<${tag}${start}>${items.map((it) => it.render(d)).join("")}</${tag}>`;
	});
}

// --- media ---

export interface MapOptions {
	/** 13–20, per `RichBlockMap.zoom`. */
	zoom: number;
	width: number;
	height: number;
}

/**
 * `RichBlockMap`, confirmed custom tag `<tg-map>` (raw in markdown too) —
 * attribute names/encoding are a best-effort guess (lat/long/zoom/width/height
 * are telegram's own field names).
 */
export function map(
	location: { latitude: number; longitude: number },
	options: MapOptions,
	caption: Caption = {},
): RichNode {
	const attrs =
		` latitude="${location.latitude}" longitude="${location.longitude}"` +
		` zoom="${options.zoom}" width="${options.width}" height="${options.height}"`;

	return makeNode("block", (d) => `<tg-map${attrs}>${figcaption(caption, d)}</tg-map>`);
}

export interface MediaOptions extends Caption {
	/** cover the media with a spoiler animation until tapped. */
	spoiler?: boolean;
}

function figure(tag: string, src: string, options: MediaOptions): RichNode {
	return makeNode("block", (d) => {
		if (d === "markdown") {
			// best-effort `![](url "caption")`; `credit`/`spoiler` have no markdown form and are dropped.
			const title =
				options.caption === undefined
					? ""
					: ` "${render(options.caption, d).replace(/"/g, "&#34;")}"`;

			return `![](${escapeMarkdownUrl(src)}${title})`;
		}

		const spoilerAttr = options.spoiler ? " data-media-spoiler" : "";
		const media = `<${tag} src="${escapeAttr(src)}"${spoilerAttr}></${tag}>`;
		const cap = figcaption(options, d);

		return cap ? `<figure>${media}${cap}</figure>` : media;
	});
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
export function thinking(...items: Insertable[]): RichNode {
	return makeNode("block", (d) => `<tg-thinking>${children(items, d)}</tg-thinking>`);
}

// --- composition ---

/**
 * join content with a separator. if any entry is a block, the result is a block
 * and entries are blank-line-joined (markdown) / concatenated (html) — the
 * separator only applies to all-inline joins.
 */
export function join(entries: Insertable[], separator: Insertable = ""): RichNode {
	const block = entries.some((entry) => isRichNode(entry) && entry.level === "block");

	return makeNode(block ? "block" : "inline", (d) => {
		const sep = block ? (d === "markdown" ? "\n\n" : "") : render(separator, d);

		return entries.map((entry) => render(entry, d)).join(sep);
	});
}
