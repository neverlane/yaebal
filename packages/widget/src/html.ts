/**
 * building a widget's html: an escaping `html` tag, safe json embedding, and a conservative
 * minifier. widgets are small (4096 bytes compressed), so the minifier only does what can never
 * change rendering — it doesn't rename, reorder or touch script code.
 */

/** markup that is trusted as-is — interpolating it into {@link html} inserts it unescaped. */
export class RawHtml {
	constructor(readonly value: string) {}

	toString(): string {
		return this.value;
	}
}

/** anything a widget definition accepts as its html. */
export type HtmlSource = string | RawHtml;

/** the string behind an {@link HtmlSource}. */
export function htmlString(source: HtmlSource): string {
	return typeof source === "string" ? source : source.value;
}

/** mark `value` as trusted markup (no escaping) for interpolation into {@link html}. */
export function raw(value: string): RawHtml {
	return new RawHtml(value);
}

const ESCAPES: Record<string, string> = {
	"&": "&amp;",
	"<": "&lt;",
	">": "&gt;",
	'"': "&quot;",
	"'": "&#39;",
};

/** escape text for an html text node or a quoted attribute value. */
export function escapeHtml(value: string): string {
	return value.replace(/[&<>"']/g, (ch) => ESCAPES[ch] as string);
}

/** a value {@link html} can interpolate. */
export type HtmlValue =
	| string
	| number
	| bigint
	| boolean
	| null
	| undefined
	| RawHtml
	| readonly HtmlValue[];

function interpolate(value: HtmlValue): string {
	if (value === null || value === undefined || value === false) return "";
	if (value instanceof RawHtml) return value.value;
	if (Array.isArray(value)) return value.map(interpolate).join("");
	return escapeHtml(String(value));
}

/**
 * tagged template for widget markup: interpolated values are html-escaped, {@link RawHtml}
 * (from {@link raw}, {@link json} or a nested `html`) goes in verbatim, arrays are joined, and
 * `null` / `undefined` / `false` render nothing — so `${cond && html`…`}` works.
 *
 * ```ts
 * const card = html`<h1>${title}</h1>${items.map((i) => html`<li>${i}</li>`)}`;
 * ```
 */
export function html(strings: TemplateStringsArray, ...values: HtmlValue[]): RawHtml {
	let out = strings[0] as string;
	for (let i = 0; i < values.length; i++) {
		out += interpolate(values[i] as HtmlValue) + (strings[i + 1] as string);
	}
	return new RawHtml(out);
}

/**
 * `JSON.stringify` that is safe inside an inline `<script>`: `<`, `>`, `&`, U+2028 and U+2029 are
 * unicode-escaped, so the payload can never close the script tag or break the parse.
 */
export function json(value: unknown): RawHtml {
	const text = JSON.stringify(value) ?? "null";
	return new RawHtml(
		text
			.replace(/</g, "\\u003c")
			.replace(/>/g, "\\u003e")
			.replace(/&/g, "\\u0026")
			.replace(/\u2028/g, "\\u2028")
			.replace(/\u2029/g, "\\u2029"),
	);
}

/** elements whose content is left byte-for-byte alone by {@link minifyHtml}. */
const VERBATIM = /<(script|pre|textarea)\b[^>]*>[\s\S]*?<\/\1\s*>/gi;
const STYLE = /(<style\b[^>]*>)([\s\S]*?)(<\/style\s*>)/gi;

function minifyCss(css: string): string {
	return css
		.replace(/\/\*[\s\S]*?\*\//g, "")
		.replace(/\s+/g, " ")
		.replace(/\s*([{};,])\s*/g, "$1")
		.replace(/;}/g, "}")
		.trim();
}

/**
 * shrink widget html without changing what it renders: drops html comments, minifies `<style>`
 * blocks (comments, whitespace, the last `;` in a rule), and collapses whitespace runs that
 * contain a line break to a single newline — whitespace stays whitespace, so inline layout is
 * unchanged. `<script>`, `<pre>` and `<textarea>` contents are kept byte-for-byte.
 */
export function minifyHtml(source: HtmlSource): string {
	const input = htmlString(source);
	const kept: string[] = [];
	const placeholder = (match: string): string => {
		kept.push(match);
		return `\0${kept.length - 1}\0`;
	};

	const out = input
		.replace(VERBATIM, placeholder)
		.replace(STYLE, (_, open: string, css: string, close: string) =>
			placeholder(`${open}${minifyCss(css)}${close}`),
		)
		.replace(/<!--[\s\S]*?-->/g, "")
		.replace(/[ \t]*\n\s*/g, "\n")
		.trim();

	return out.replace(/\0(\d+)\0/g, (_, index: string) => kept[Number(index)] as string);
}
