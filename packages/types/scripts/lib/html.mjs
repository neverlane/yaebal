// minimal HTML helpers tailored to the very regular markup of core.telegram.org/bots/api —
// not a general-purpose HTML parser. no dependency on any third-party scraper/schema project;
// this is the whole "parsing layer" between the official docs and our schema.json.

const DOC_ROOT = "https://core.telegram.org/bots/api/";

const ENTITIES = {
	amp: "&",
	lt: "<",
	gt: ">",
	quot: '"',
	apos: "'",
	nbsp: " ",
	rsquo: "'",
	lsquo: "'",
	rdquo: '"',
	ldquo: '"',
	ndash: "-",
	mdash: "--",
	hellip: "...",
};

/** decode HTML entities (named + numeric, decimal and hex). */
export function decodeEntities(str) {
	return str
		.replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
		.replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number.parseInt(dec, 10)))
		.replace(/&([a-z]+);/gi, (m, name) => ENTITIES[name.toLowerCase()] ?? m);
}

/** resolve a docs-relative href (`#anchor`) to an absolute URL; leave absolute hrefs untouched. */
function resolveHref(href) {
	return href.startsWith("#") ? `${DOC_ROOT}${href}` : href;
}

/** escape underscores so downstream markdown consumers don't misread them as emphasis. */
const escapeUnderscore = (s) => s.replace(/_/g, "\\_");

/**
 * convert one HTML fragment (a method/object description, a table cell, ...) into the
 * markdown-ish text our schema stores: `[text](url)` links, `*em*` / `**strong**` (underscores
 * escaped inside them, matching how the docs' own emphasis spans read once flattened),
 * `` `code` `` spans, `<br>` -> newline, everything else stripped.
 */
export function htmlToMarkdown(html) {
	let out = html;

	// drop non-content wrappers before inline conversion so their text doesn't leak in
	out = out.replace(/<\/?(?:p|div)[^>]*>/gi, "\n\n");
	out = out.replace(/<br\s*\/?>/gi, "\n");

	out = out.replace(/<a\s+[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gis, (_, href, text) => {
		const inner = decodeEntities(text.replace(/<[^>]+>/g, "")).trim();
		return `[${inner}](${resolveHref(href)})`;
	});

	out = out.replace(/<(em|i)>(.*?)<\/\1>/gis, (_, _tag, text) => `*${escapeUnderscore(text.trim())}*`);
	out = out.replace(
		/<(strong|b)>(.*?)<\/\1>/gis,
		(_, _tag, text) => `**${escapeUnderscore(text.trim())}**`,
	);
	out = out.replace(/<code>(.*?)<\/code>/gis, (_, text) => `\`${text.trim()}\``);

	out = out.replace(/<[^>]+>/g, "");
	out = decodeEntities(out);

	return out
		.split("\n")
		.map((line) => line.trim())
		.join("\n")
		.replace(/\n{3,}/g, "\n\n")
		.trim();
}

/** plain text, no formatting at all — used for structural matching (sentence scanning, etc). */
export function stripTags(html) {
	return decodeEntities(html.replace(/<[^>]+>/g, " "))
		.replace(/\s+/g, " ")
		.trim();
}

/**
 * split a `<table class="table">...</table>` fragment into header cell texts + row cell HTML
 * (cells kept as raw HTML so callers can run the type-cell parser / markdown converter on them).
 */
export function parseTable(html) {
	const tableMatch = html.match(/<table[^>]*>(.*?)<\/table>/is);
	if (!tableMatch) return null;

	const table = tableMatch[1];
	const theadMatch = table.match(/<thead>(.*?)<\/thead>/is);
	const tbodyMatch = table.match(/<tbody>(.*?)<\/tbody>/is);
	if (!theadMatch || !tbodyMatch) return null;

	const header = [...theadMatch[1].matchAll(/<th>(.*?)<\/th>/gis)].map((m) => stripTags(m[1]));

	const rows = [...tbodyMatch[1].matchAll(/<tr>(.*?)<\/tr>/gis)].map((rowMatch) =>
		[...rowMatch[1].matchAll(/<td>(.*?)<\/td>/gis)].map((m) => m[1].trim()),
	);

	return { header, rows };
}

/** text content of a `<li>...</li>` list's items, as raw HTML (for link extraction). */
export function parseListItems(html) {
	const listMatch = html.match(/<ul>(.*?)<\/ul>/is);
	if (!listMatch) return null;

	return [...listMatch[1].matchAll(/<li>(.*?)<\/li>/gis)].map((m) => m[1].trim());
}

/** the single `<a href="#anchor">Text</a>` a list item / simple cell is expected to hold. */
export function extractSingleLink(html) {
	const m = html.match(/<a\s+[^>]*href="#([^"]*)"[^>]*>(.*?)<\/a>/is);
	if (!m) return null;

	return { anchor: m[1], text: stripTags(m[2]) };
}
