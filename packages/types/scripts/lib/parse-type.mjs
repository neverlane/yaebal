// parses a Bot API docs "Type" cell (raw HTML, e.g. `Array of <a href="#messageentity">MessageEntity</a>`,
// `Integer or String`, `<a href="#inlinekeyboardmarkup">InlineKeyboardMarkup</a> or <a href="#replykeyboardmarkup">ReplyKeyboardMarkup</a>`)
// into the field-type shape `packages/types/scripts/generate.mjs` already understands:
// { type: "integer" | "float" | "string" | "bool" | "reference" | "array" | "any_of", ... }

import { stripTags } from "./html.mjs";

const SCALAR = {
	integer: "integer",
	int: "integer",
	"float number": "float",
	float: "float",
	string: "string",
	boolean: "bool",
	true: "bool",
	false: "bool",
};

/** split on top-level " or " — safe here since docs never nest " or " inside an `<a>` tag/attr. */
function splitUnion(html) {
	// avoid splitting inside a tag's attributes (hrefs never contain literal " or ") — plain split is fine
	const parts = html.split(/\s+or\s+/i);
	if (parts.length > 1) return parts;

	// Oxford-list unions (e.g. sendMediaGroup's `media`: "Array of A, B, C and D") — only split
	// this way when every resulting piece is itself a bare link, so a link's own comma-free inner
	// text never gets mistaken for a list.
	if (/\s+and\s+/i.test(html) && html.includes(",")) {
		const listParts = html.split(/\s*,\s*|\s+and\s+/i).filter((p) => p.trim().length > 0);
		if (listParts.length > 1 && listParts.every((p) => /^<a\s+[^>]*href="#[^"]*"[^>]*>.*<\/a>$/is.test(p.trim()))) {
			return listParts;
		}
	}

	return null;
}

export function parseTypeCell(rawHtml) {
	const html = rawHtml.trim();

	const arrayMatch = html.match(/^Array of\s+(.+)$/is);
	if (arrayMatch) {
		return { type: "array", array: parseTypeCell(arrayMatch[1]) };
	}

	const unionParts = splitUnion(html);
	if (unionParts) {
		return { type: "any_of", any_of: unionParts.map((p) => parseTypeCell(p)) };
	}

	const linkMatch = html.match(/^<a\s+[^>]*href="#([^"]*)"[^>]*>(.*?)<\/a>$/is);
	if (linkMatch) {
		return { type: "reference", reference: stripTags(linkMatch[2]) };
	}

	const plain = stripTags(html).toLowerCase();
	if (plain in SCALAR) {
		return { type: SCALAR[plain] };
	}

	// bare type name with no link (rare, e.g. a scalar the docs didn't hyperlink) — treat as a
	// reference so codegen still emits *something* nameable rather than silently going `unknown`.
	const bare = stripTags(html);
	if (/^[A-Z][A-Za-z0-9]*$/.test(bare)) {
		return { type: "reference", reference: bare };
	}

	return { type: "unknown", raw: bare };
}
