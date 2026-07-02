import { RichDocument } from "./document.js";
import { escapeMarkdown, escapeText } from "./escape.js";
import { type Dialect, isRichNode, RichError, type RichNode } from "./node.js";

/**
 * anything a builder or template accepts as content:
 *
 * - `string` / `number` / `bigint` — escaped for the target dialect, renders literally;
 * - a `RichNode` (builder result) — rendered into the target dialect;
 * - a `RichDocument` — inlined as-is (its dialect must match, else `RichError`);
 * - `null` / `undefined` / `false` — empty string, so `cond && bold(…)` composes;
 * - an array — each item rendered and concatenated.
 */
export type Insertable =
	| RichNode
	| RichDocument
	| string
	| number
	| bigint
	| null
	| undefined
	| false
	| readonly Insertable[];

/** escape plain text for a dialect so it can never be re-parsed as markup. */
export function escapeFor(text: string, dialect: Dialect): string {
	return dialect === "html" ? escapeText(text) : escapeMarkdown(text);
}

/** resolve one piece of content into a dialect string (text escaped, nodes rendered). */
export function render(value: Insertable, dialect: Dialect): string {
	if (value === null || value === undefined || value === false) return "";

	if (typeof value === "string") return escapeFor(value, dialect);
	if (typeof value === "number" || typeof value === "bigint") {
		return escapeFor(String(value), dialect);
	}

	if (Array.isArray(value)) {
		return value.map((item) => render(item as Insertable, dialect)).join("");
	}

	if (value instanceof RichDocument) {
		if (value.dialect !== dialect) {
			throw new RichError(`cannot inline a ${value.dialect} document into a ${dialect} template`);
		}

		return value.content;
	}

	if (isRichNode(value)) return value.render(dialect);

	throw new RichError(`unsupported rich content: ${typeof value}`);
}
