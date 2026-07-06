import { type FormatResult, type Insertable, isFormatResult } from "@yaebal/core";

/**
 * @yaebal/fmt — `html` and `md` tagged template literals that PARSE telegram's
 * markup subset into proper `MessageEntity` objects (same shape as core's
 * entity-based `format`). interpolations are auto-escaped: a `${string}` is
 * inserted as literal text (its `*`, `<`, `` ` `` etc. are never re-parsed), a
 * `${FormatResult}` (e.g. from core's `bold()`/`link()`) is merged with its
 * offsets shifted, and `${}` inside an attribute (`href="${url}"`) is
 * substituted textually. there is nothing to escape and no `parse_mode` to set.
 *
 * scope, honestly: these are TEMPLATE dialects for authoring bot messages, not
 * document converters. they cover telegram's own entity vocabulary (bold …
 * blockquote, pre with language, custom emoji) and nothing beyond it — no
 * headings, lists, tables or paragraph reflow. to render an arbitrary
 * markdown/html document (say, LLM output), use a real markdown parser and map
 * its AST onto entities.
 */

type Entity = FormatResult["entities"][number];
type Doc = { text: string; entities: Entity[] };

const ent = (type: string, offset: number, length: number, extra: object = {}): Entity =>
	({ type, offset, length, ...extra }) as Entity;

/** drop zero-length entities and order deterministically (outermost first at equal offsets). */
const finalize = (text: string, entities: Entity[]): FormatResult => ({
	text,
	entities: entities
		.filter((e) => e.length > 0)
		.sort((a, b) => a.offset - b.offset || b.length - a.length),
});

const subToText = (sub: Insertable): string => {
	if (isFormatResult(sub)) return sub.text;
	if (sub == null || typeof sub === "boolean") return "";
	return String(sub);
};

// interpolation slots are encoded as private-use chars — a single UTF-16 unit, so
// a slot occupies exactly one offset and survives parsing as ordinary text. the
// base is chosen per call to dodge any private-use chars already present in the
// template's static parts, so a literal U+E000 in the template can't collide.
const PUA_START = 0xe000;
const PUA_END = 0xf8ff;

function pickBase(strings: TemplateStringsArray, count: number): number {
	if (count === 0) return PUA_START;

	const used = new Set<number>();
	for (const s of strings) {
		for (const ch of s) {
			const c = ch.codePointAt(0) ?? 0;
			if (c >= PUA_START && c <= PUA_END) used.add(c);
		}
	}
	if (used.size === 0) return PUA_START;

	for (let base = PUA_START; base + count <= PUA_END + 1; base++) {
		let free = true;
		for (let i = 0; i < count; i++) {
			if (used.has(base + i)) {
				free = false;
				break;
			}
		}
		if (free) return base;
	}

	return PUA_START; // pathological: the template exhausts the private-use plane
}

/** insert a sub's text (and any entities) at a known slot position, fixing offsets. */
function spliceAt(doc: Doc, at: number, insertText: string, insert: Entity[]): Doc {
	const delta = insertText.length - 1;
	const text = doc.text.slice(0, at) + insertText + doc.text.slice(at + 1);
	const entities: Entity[] = [];

	for (const e of doc.entities) {
		let { offset, length } = e;

		if (offset > at) offset += delta;
		else if (offset + length > at) length += delta; // entity spans the slot

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
	const base = pickBase(strings, subs.length);

	let raw = "";
	for (let i = 0; i < strings.length; i++) {
		raw += strings[i] ?? "";
		if (i < subs.length) raw += String.fromCharCode(base + i);
	}

	let doc = parse(raw);

	// a slot char can also end up inside an entity's string field (href="${url}",
	// emoji-id="${id}", [text](${url})) — substitute those textually.
	const substitute = (s: string): string =>
		s.replace(/[\uE000-\uF8FF]/g, (ch) => {
			const idx = ch.charCodeAt(0) - base;
			return idx >= 0 && idx < subs.length ? subToText(subs[idx]) : ch;
		});

	doc = {
		text: doc.text,
		entities: doc.entities.map((e) => {
			let out = e;
			for (const [key, value] of Object.entries(e)) {
				if (typeof value !== "string" || key === "type") continue;
				const next = substitute(value);
				if (next !== value) out = { ...out, [key]: next };
			}
			return out;
		}),
	};

	// locate every slot BEFORE splicing — an inserted sub's text could itself
	// contain private-use chars that look like a later slot — then splice
	// right-to-left so earlier positions stay valid.
	const slots: { at: number; index: number }[] = [];
	for (let at = 0; at < doc.text.length; at++) {
		const idx = doc.text.charCodeAt(at) - base;
		if (idx >= 0 && idx < subs.length) slots.push({ at, index: idx });
	}

	for (let s = slots.length - 1; s >= 0; s--) {
		const slot = slots[s];
		if (!slot) continue;

		const sub = subs[slot.index];
		if (isFormatResult(sub)) doc = spliceAt(doc, slot.at, sub.text, sub.entities);
		else doc = spliceAt(doc, slot.at, subToText(sub), []);
	}

	return finalize(doc.text, doc.entities);
}

const NAMED: Record<string, string> = {
	amp: "&",
	lt: "<",
	gt: ">",
	quot: '"',
	apos: "'",
	nbsp: " ",
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

/** the `language-x` class on a `<code>` tag (telegram's canonical `<pre><code class="language-x">`). */
function languageOf(attrs: string): string | undefined {
	const cls = attr(attrs, "class") ?? "";
	const m = /(?:^|\s)language-([\w+#.-]+)/.exec(cls);
	return m?.[1];
}

/** map an open HTML tag to an entity type. `null` type = recognized but no entity; `false` = unknown. */
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
		case "code": {
			const language = languageOf(attrs);
			return { type: "code", extra: language ? { language } : {} };
		}
		case "pre":
			return { type: "pre" };
		case "blockquote":
			return /(?:^|\s)expandable(?:\s|=|$)/i.test(attrs)
				? { type: "expandable_blockquote" }
				: { type: "blockquote" };
		case "a": {
			const url = attr(attrs, "href");
			return url ? { type: "text_link", extra: { url } } : { type: null };
		}
		case "tg-spoiler":
			return { type: "spoiler" };
		case "tg-emoji": {
			const id = attr(attrs, "emoji-id");
			return id ? { type: "custom_emoji", extra: { custom_emoji_id: id } } : { type: null };
		}
		case "span":
			return (attr(attrs, "class") ?? "").includes("tg-spoiler")
				? { type: "spoiler" }
				: { type: null };
		default:
			return false;
	}
}

const OPEN = /^<([a-zA-Z][\w-]*)((?:\s+[\w-]+(?:\s*=\s*(?:"[^"]*"|'[^']*'))?)*)\s*(\/?)>/;
const CLOSE = /^<\/([a-zA-Z][\w-]*)\s*>/;

/**
 * parse telegram's HTML subset into `{ text, entities }`. covers the full
 * official vocabulary: `b/strong`, `i/em`, `u/ins`, `s/strike/del`, `code`
 * (with `class="language-x"`), `pre` (a `<pre><code class="language-x">` pair
 * collapses into one `pre` entity carrying the language), `blockquote`
 * (+ `expandable`), `a href`, `tg-spoiler` / `span.tg-spoiler`, `tg-emoji
 * emoji-id`. beyond it: `<br>` becomes a newline, tags left unclosed at the end
 * of input are auto-closed, unmatched closing tags are dropped, and anything
 * unrecognized stays literal text.
 */
export function htmlToEntities(raw: string): FormatResult {
	let text = "";

	const entities: Entity[] = [];
	const stack: { tag: string; type: string | null; offset: number; extra: object }[] = [];

	const closeEntry = (entry: (typeof stack)[number]) => {
		if (!entry.type) return;

		const length = text.length - entry.offset;

		// telegram's canonical `<pre><code class="language-x">` — collapse the inner
		// code entity into a single pre entity carrying the language.
		if (entry.type === "pre") {
			const inner = entities.findIndex(
				(e) => e.type === "code" && e.offset === entry.offset && e.length === length,
			);

			if (inner !== -1) {
				const code = entities.splice(inner, 1)[0] as Entity & { language?: string };
				entities.push(
					ent(
						"pre",
						entry.offset,
						length,
						code.language ? { language: code.language } : entry.extra,
					),
				);
				return;
			}
		}

		entities.push(ent(entry.type, entry.offset, length, entry.extra));
	};

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
						if (popped) closeEntry(popped);
						break;
					}
				}

				i += close[0].length;
				continue;
			}

			const open = OPEN.exec(rest);

			if (open) {
				const tag = (open[1] ?? "").toLowerCase();
				const selfClosed = open[3] === "/";

				if (tag === "br") {
					text += "\n";

					i += open[0].length;
					continue;
				}

				const mapped = mapTag(tag, open[2] ?? "");

				if (mapped) {
					// a self-closed known tag can't span text — skip it (zero-length anyway)
					if (!selfClosed) {
						stack.push({ tag, type: mapped.type, offset: text.length, extra: mapped.extra ?? {} });
					}

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

	// auto-close whatever is still open, innermost first, so `<b>hi` still bolds
	for (let s = stack.length - 1; s >= 0; s--) {
		const entry = stack[s];
		if (entry) closeEntry(entry);
	}

	return finalize(text, entities);
}

const atLineStart = (input: string, i: number): boolean => i === 0 || input[i - 1] === "\n";

const isWordChar = (ch: string | undefined): boolean => ch !== undefined && /[\w\d]/.test(ch);

/**
 * parse the `md` template dialect into `{ text, entities }`:
 * `**bold**`, `*italic*` / `_italic_`, `__underline__`, `~~strikethrough~~`,
 * `||spoiler||`, `` `code` ``, ```` ```lang\n…``` ```` fences,
 * `[text](url)` links, and `> ` line-prefixed blockquotes. a backslash escapes
 * the next character. single `*`/`_` don't trigger mid-word (`snake_case` is
 * safe) and their content can't start or end with whitespace.
 */
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

		// > blockquote: consecutive `>`-prefixed lines form one blockquote entity
		if (atLineStart(input, i) && rest[0] === ">") {
			const m = /^>[^\n]*(?:\n>[^\n]*)*/.exec(rest);

			if (m) {
				const inner = m[0]
					.split("\n")
					.map((line) => line.replace(/^> ?/, ""))
					.join("\n");

				wrap(mdToEntities(inner), "blockquote");

				i += m[0].length;
				continue;
			}
		}

		const fence = /^```([a-zA-Z0-9+#-]*)\r?\n?([\s\S]*?)```/.exec(rest);

		if (fence) {
			const lang = fence[1] ?? "";
			const body = (fence[2] ?? "").replace(/\r?\n$/, "");

			entities.push(ent("pre", text.length, body.length, lang ? { language: lang } : {}));
			text += body;

			i += fence[0].length;
			continue;
		}

		const inline = /^`([^`\n]+)`/.exec(rest);

		if (inline) {
			const body = inline[1] ?? "";

			entities.push(ent("code", text.length, body.length));
			text += body;

			i += inline[0].length;
			continue;
		}

		// content is escape-aware: a `\*` inside `**…**` stays literal instead of
		// terminating the run early
		const doubles: [RegExp, string][] = [
			[/^\*\*((?:\\[\s\S]|[\s\S])+?)\*\*/, "bold"],
			[/^__((?:\\[\s\S]|[\s\S])+?)__/, "underline"],
			[/^~~((?:\\[\s\S]|[\s\S])+?)~~/, "strikethrough"],
			[/^\|\|((?:\\[\s\S]|[\s\S])+?)\|\|/, "spoiler"],
		];

		let matched = false;
		for (const [re, type] of doubles) {
			const m = re.exec(rest);

			if (m) {
				wrap(mdToEntities(m[1] ?? ""), type);

				i += m[0].length;
				matched = true;

				break;
			}
		}

		if (matched) continue;

		// single-delimiter italics: not mid-word, content not whitespace-flanked,
		// and an unescaped delimiter can't appear inside the run
		if ((rest[0] === "*" || rest[0] === "_") && !isWordChar(input[i - 1])) {
			const re =
				rest[0] === "*"
					? /^\*((?:\\[\s\S]|[^*\s])(?:(?:\\[\s\S]|[^*])*?(?:\\[\s\S]|[^*\s]))?)\*/
					: /^_((?:\\[\s\S]|[^_\s])(?:(?:\\[\s\S]|[^_])*?(?:\\[\s\S]|[^_\s]))?)_/;
			const m = re.exec(rest);

			if (m) {
				wrap(mdToEntities(m[1] ?? ""), "italic");

				i += m[0].length;
				continue;
			}
		}

		const linkM = /^\[([\s\S]+?)\]\(([^)\s]+)\)/.exec(rest);

		if (linkM) {
			wrap(mdToEntities(linkM[1] ?? ""), "text_link", { url: linkM[2] ?? "" });

			i += linkM[0].length;
			continue;
		}

		text += input[i];
		i += 1;
	}

	return finalize(text, entities);
}

/** parse an HTML-subset template into entities; `${}` interpolations are auto-escaped. */
export function html(strings: TemplateStringsArray, ...subs: Insertable[]): FormatResult {
	return stitch(strings, subs, htmlToEntities);
}

/** parse a markdown template into entities; `${}` interpolations are auto-escaped. */
export function md(strings: TemplateStringsArray, ...subs: Insertable[]): FormatResult {
	return stitch(strings, subs, mdToEntities);
}
