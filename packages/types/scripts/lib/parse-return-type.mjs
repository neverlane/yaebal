// heuristic extraction of two things the docs only ever state in free-text prose (there is no
// dedicated table for either): a method's return type, and a string field's set of literal values.

import { stripTags } from "./html.mjs";

/**
 * split raw HTML into "sentences" on `. ` / `.<end>` — a period is only a boundary when
 * followed by whitespace or end-of-string, so periods inside URLs/domains sitting in a
 * `<code>` span (`telegram.org`) or decimals don't cause a false split.
 */
function sentences(html) {
	const parts = html.split(/\.(?=\s|$)/);
	return parts.map((s, i) => (i < parts.length - 1 ? `${s}.` : s)).filter((s) => s.trim().length > 0);
}

/** every sentence whose plain-text form matches `re`, joined back together — `null` if none match. */
function windowsMatching(html, re) {
	const found = sentences(html).filter((s) => re.test(stripTags(s)));
	return found.length > 0 ? found.join(" ") : null;
}

/** a return-type reference is always a single PascalCase link — filters out unrelated prose links. */
function pascalLinks(html) {
	const out = [];

	for (const m of html.matchAll(/(array of\s+)?<a\s+[^>]*href="#[^"]*"[^>]*>(.*?)<\/a>/gis)) {
		const text = stripTags(m[2]);
		if (/^[A-Z][A-Za-z0-9]*$/.test(text)) {
			out.push({ name: text, isArray: !!m[1] });
		}
	}

	return out;
}

/** does a literal (non-hyperlinked) `True` appear in this window, e.g. "otherwise True is returned"? */
function hasLiteralTrue(html) {
	return /\btrue\b/i.test(stripTags(html));
}

const SCALAR_RETURN = { int: "integer", integer: "integer", string: "string", float: "float", boolean: "bool" };

/** scalars (Int/String/Float/Boolean) aren't hyperlinked, unlike object types — e.g. "Returns <em>Int</em> on success". */
function scalarReturns(html) {
	const out = [];

	for (const m of html.matchAll(/<em>(Int|Integer|String|Float|Boolean)<\/em>/gi)) {
		const type = SCALAR_RETURN[m[1].toLowerCase()];
		if (type) out.push(type);
	}

	return out;
}

const RETURN_TRIGGER = /\breturn(?:s|ed)?\b/i;

/**
 * extract a method's return type from its description. telegram's docs always spell this out
 * in prose ("Returns X on success", "the sent Message is returned", "Returns True on success",
 * "On success, ... the edited Message is returned, otherwise True is returned") rather than in
 * a table, so this is unavoidably a sentence-level heuristic — validated against the current
 * (known-correct) schema.json for every method that hasn't changed across Bot API versions.
 */
export function extractReturnType(descriptionHtml) {
	const window = windowsMatching(descriptionHtml, RETURN_TRIGGER) ?? descriptionHtml;

	const refs = [];
	const seen = new Set();

	for (const ref of pascalLinks(window)) {
		if (seen.has(ref.name)) continue;
		seen.add(ref.name);
		refs.push(ref.isArray ? { type: "array", array: { type: "reference", reference: ref.name } } : { type: "reference", reference: ref.name });
	}

	for (const type of scalarReturns(window)) {
		if (seen.has(type)) continue;
		seen.add(type);
		refs.push({ type });
	}

	if (hasLiteralTrue(window)) {
		refs.push({ type: "bool", default: true });
	}

	if (refs.length === 0) return { type: "unknown" };
	if (refs.length === 1) return refs[0];

	return { type: "any_of", any_of: refs };
}

const ENUM_TRIGGER = /\b(can be|choose one|one of|either)\b/i;
const ENUM_SKIP = new Set(["True", "False", "Optional", "None"]);

/**
 * a string field's literal values, when the docs spell them out inside a "one of ..." /
 * "can be ..." / "choose one, depending on ..." style sentence — either as curly-quoted
 * values (the dominant style for object fields, e.g. `Sticker.type`: `one of “regular”,
 * “mask”, “custom_emoji”`) or as `<em>`/`<code>` spans (the dominant style for method
 * parameters, e.g. `sendChatAction`'s `action`). Scoped to the *trigger sentence(s) only* —
 * scanning the whole description would also pick up unrelated `<em>field_name</em>`
 * mentions elsewhere in the same field's text (e.g. `Sticker.type` also mentions the
 * unrelated is_animated / is_video fields in its second sentence). returns `undefined`
 * when nothing enum-shaped is found.
 */
export function extractEnum(descriptionHtml) {
	const window = windowsMatching(descriptionHtml, ENUM_TRIGGER);
	if (!window) return undefined;

	const values = [];
	const seen = new Set();

	const add = (value) => {
		if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(value) || ENUM_SKIP.has(value) || seen.has(value)) return;
		seen.add(value);
		values.push(value);
	};

	for (const m of window.matchAll(/[“]([^”]+)[”]/g)) add(m[1].trim());
	for (const m of window.matchAll(/<(?:em|code)>([^<]+)<\/(?:em|code)>/g)) add(m[1].trim());

	return values.length >= 2 ? values : undefined;
}

/** `"1-4096 characters"` -> { min_len: 1, max_len: 4096 }; `undefined` when no such range is stated. */
export function extractLength(descriptionHtml) {
	const m = stripTags(descriptionHtml).match(/\b(\d+)-(\d+)\s+characters?\b/);
	if (!m) return undefined;

	return { min_len: Number(m[1]), max_len: Number(m[2]) };
}
