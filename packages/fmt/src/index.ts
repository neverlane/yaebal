import type { FormatResult } from "@yaebal/core";

/**
 * @yaebal/fmt — `html` and `md` tagged template literals that PARSE Telegram's
 * markup subset into proper `MessageEntity` objects (same shape as core's
 * entity-based `format`). Interpolations are auto-escaped: a `${string}` is
 * inserted as literal text (its `*`, `<`, `` ` `` etc. are never re-parsed), and a
 * `${FormatResult}` (e.g. from core's `bold()`/`link()`) is merged with its
 * offsets shifted. There is nothing to escape and no `parse_mode` to set.
 */

type Entity = FormatResult["entities"][number];
type Doc = { text: string; entities: Entity[] };
type Insertable = FormatResult | string | number | bigint | boolean | null | undefined;

const ent = (type: string, offset: number, length: number, extra: object = {}): Entity =>
	({ type, offset, length, ...extra }) as Entity;

const isFormatResult = (v: unknown): v is FormatResult =>
	typeof v === "object" &&
	v !== null &&
	"text" in v &&
	"entities" in v &&
	Array.isArray((v as FormatResult).entities);

// Private-use char per interpolation slot — a single UTF-16 unit, so it occupies
// exactly one offset and survives parsing as ordinary text.
const ph = (i: number): string => String.fromCharCode(0xe000 + i);

/** Insert a sub's text (and any entities) where its placeholder sits, fixing offsets. */
function splice(doc: Doc, placeholder: string, insertText: string, insert: Entity[]): Doc {
	const at = doc.text.indexOf(placeholder);
	if (at < 0) return doc;
	const delta = insertText.length - 1;
	const text = doc.text.slice(0, at) + insertText + doc.text.slice(at + 1);
	const entities: Entity[] = [];
	for (const e of doc.entities) {
		let { offset, length } = e;
		if (offset > at) offset += delta;
		else if (offset + length > at) length += delta; // entity spans the placeholder
		entities.push({ ...e, offset, length });
	}
	for (const e of insert) entities.push({ ...e, offset: e.offset + at });
	return { text, entities };
}

function stitch(
	strings: TemplateStringsArray,
	subs: Insertable[],
	parse: (raw: string) => Doc,
): FormatResult {
	let raw = "";
	for (let i = 0; i < strings.length; i++) {
		raw += strings[i] ?? "";
		if (i < subs.length) raw += ph(i);
	}
	let doc = parse(raw);
	for (let i = 0; i < subs.length; i++) {
		const sub = subs[i];
		if (isFormatResult(sub)) doc = splice(doc, ph(i), sub.text, sub.entities);
		else doc = splice(doc, ph(i), sub == null ? "" : String(sub), []);
	}
	const entities = doc.entities
		.filter((e) => e.length > 0)
		.sort((a, b) => a.offset - b.offset || b.length - a.length);
	return { text: doc.text, entities };
}

// ---------------------------------------------------------------- HTML

const NAMED: Record<string, string> = {
	amp: "&",
	lt: "<",
	gt: ">",
	quot: '"',
	apos: "'",
	nbsp: " ",
};

function decodeEntities(s: string): string {
	return s.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (m, body: string) => {
		if (body[0] === "#") {
			const code =
				body[1] === "x" || body[1] === "X"
					? Number.parseInt(body.slice(2), 16)
					: Number.parseInt(body.slice(1), 10);
			return Number.isFinite(code) ? String.fromCodePoint(code) : m;
		}
		return NAMED[body] ?? m;
	});
}

function attr(attrs: string, name: string): string | undefined {
	const m = new RegExp(`${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, "i").exec(attrs);
	if (!m) return undefined;
	return decodeEntities(m[2] ?? m[3] ?? "");
}

/** Map an open HTML tag to an entity type. `null` type = recognized but no entity; `false` = unknown. */
function mapTag(name: string, attrs: string): { type: string | null; extra?: object } | false {
	switch (name) {
		case "b":
		case "strong":
			return { type: "bold" };
		case "i":
		case "em":
			return { type: "italic" };
		case "u":
		case "ins":
			return { type: "underline" };
		case "s":
		case "strike":
		case "del":
			return { type: "strikethrough" };
		case "code":
			return { type: "code" };
		case "pre":
			return { type: "pre" };
		case "blockquote":
			return { type: "blockquote" };
		case "a": {
			const url = attr(attrs, "href");
			return url ? { type: "text_link", extra: { url } } : { type: null };
		}
		case "tg-spoiler":
			return { type: "spoiler" };
		case "span":
			return (attr(attrs, "class") ?? "").includes("tg-spoiler")
				? { type: "spoiler" }
				: { type: null };
		default:
			return false;
	}
}

const OPEN = /^<([a-zA-Z][\w-]*)((?:\s+[\w-]+(?:\s*=\s*(?:"[^"]*"|'[^']*'))?)*)\s*>/;
const CLOSE = /^<\/([a-zA-Z][\w-]*)\s*>/;

export function htmlToEntities(raw: string): FormatResult {
	let text = "";
	const entities: Entity[] = [];
	const stack: { tag: string; type: string | null; offset: number; extra: object }[] = [];
	let i = 0;
	while (i < raw.length) {
		const c = raw[i];
		if (c === "<") {
			const rest = raw.slice(i);
			const close = CLOSE.exec(rest);
			if (close) {
				const name = (close[1] ?? "").toLowerCase();
				for (let s = stack.length - 1; s >= 0; s--) {
					if (stack[s]?.tag === name) {
						const popped = stack.splice(s, 1)[0];
						if (popped?.type)
							entities.push(
								ent(popped.type, popped.offset, text.length - popped.offset, popped.extra),
							);
						break;
					}
				}
				i += close[0].length;
				continue;
			}
			const open = OPEN.exec(rest);
			if (open) {
				const tag = (open[1] ?? "").toLowerCase();
				const mapped = mapTag(tag, open[2] ?? "");
				if (mapped) {
					stack.push({ tag, type: mapped.type, offset: text.length, extra: mapped.extra ?? {} });
					i += open[0].length;
					continue;
				}
			}
			text += "<";
			i += 1;
			continue;
		}
		if (c === "&") {
			const m = /^&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/.exec(raw.slice(i));
			if (m) {
				text += decodeEntities(m[0]);
				i += m[0].length;
				continue;
			}
		}
		text += c;
		i += 1;
	}
	return { text, entities };
}

// ---------------------------------------------------------------- Markdown

export function mdToEntities(input: string): FormatResult {
	let text = "";
	const entities: Entity[] = [];

	const wrap = (inner: FormatResult, type: string, extra: object = {}) => {
		const off = text.length;
		text += inner.text;
		entities.push(ent(type, off, inner.text.length, extra));
		for (const e of inner.entities) entities.push({ ...e, offset: e.offset + off });
	};

	let i = 0;
	while (i < input.length) {
		if (input[i] === "\\" && i + 1 < input.length) {
			text += input[i + 1];
			i += 2;
			continue;
		}
		const rest = input.slice(i);

		const fence = /^```([a-zA-Z0-9+#-]*)\r?\n?([\s\S]*?)```/.exec(rest);
		if (fence) {
			const lang = fence[1] ?? "";
			const body = fence[2] ?? "";
			entities.push(ent("pre", text.length, body.length, lang ? { language: lang } : {}));
			text += body;
			i += fence[0].length;
			continue;
		}
		const inline = /^`([^`]+)`/.exec(rest);
		if (inline) {
			const body = inline[1] ?? "";
			entities.push(ent("code", text.length, body.length));
			text += body;
			i += inline[0].length;
			continue;
		}
		const delim: [RegExp, string][] = [
			[/^\*\*([\s\S]+?)\*\*/, "bold"],
			[/^__([\s\S]+?)__/, "italic"],
			[/^~~([\s\S]+?)~~/, "strikethrough"],
			[/^\|\|([\s\S]+?)\|\|/, "spoiler"],
		];
		let matched = false;
		for (const [re, type] of delim) {
			const m = re.exec(rest);
			if (m) {
				wrap(mdToEntities(m[1] ?? ""), type);
				i += m[0].length;
				matched = true;
				break;
			}
		}
		if (matched) continue;

		const linkM = /^\[([\s\S]+?)\]\(([^)\s]+)\)/.exec(rest);
		if (linkM) {
			wrap(mdToEntities(linkM[1] ?? ""), "text_link", { url: linkM[2] ?? "" });
			i += linkM[0].length;
			continue;
		}

		text += input[i];
		i += 1;
	}
	return { text, entities };
}

// ---------------------------------------------------------------- tagged templates

/** Parse an HTML-subset template into entities; `${}` interpolations are auto-escaped. */
export function html(strings: TemplateStringsArray, ...subs: Insertable[]): FormatResult {
	return stitch(strings, subs, htmlToEntities);
}

/** Parse a Markdown template into entities; `${}` interpolations are auto-escaped. */
export function md(strings: TemplateStringsArray, ...subs: Insertable[]): FormatResult {
	return stitch(strings, subs, mdToEntities);
}
