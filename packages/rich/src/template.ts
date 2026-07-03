import { RichDocument } from "./document.js";
import type { Dialect } from "./node.js";
import { type Insertable, render } from "./render.js";

// strip the common leading indentation shared by the literal skeleton, then trim blank edges.
function dedent(skeleton: string): string {
	const rawLines = skeleton.split("\n");
	let min = Number.POSITIVE_INFINITY;

	for (const line of rawLines) {
		if (line.trim() === "") continue;
		const indent = /^[ \t]*/.exec(line)?.[0].length ?? 0;
		min = Math.min(min, indent);
	}

	if (!Number.isFinite(min)) min = 0;

	return rawLines
		.map((line) => line.slice(min))
		.join("\n")
		.replace(/^\n+/, "")
		.trimEnd();
}

export interface RichTemplate {
	/** plain-function form: passed through as-is, no escaping/dedent (already-formatted content). */
	(source: string): RichDocument;
	/** block-array form: each entry rendered; blocks blank-line-joined in markdown. */
	(blocks: readonly Insertable[]): RichDocument;
	/** tagged-template form: dedented, `${}` interpolation escaped/rendered per-item. */
	(strings: TemplateStringsArray, ...subs: Insertable[]): RichDocument;
}

// top-level blocks need a blank line between them in markdown; in html the tags
// carry the structure and separators are just cosmetic whitespace.
function joinBlocks(blocks: readonly Insertable[], dialect: Dialect): string {
	const separator = dialect === "markdown" ? "\n\n" : "";
	return blocks.map((block) => render(block, dialect)).join(separator);
}

function makeTemplate(dialect: Dialect): RichTemplate {
	return ((
		first: string | TemplateStringsArray | readonly Insertable[],
		...subs: Insertable[]
	): RichDocument => {
		if (typeof first === "string") return new RichDocument(dialect, first);

		// a plain array (no `.raw` template marker) composes top-level blocks.
		if (!("raw" in first)) {
			return new RichDocument(dialect, joinBlocks(first as readonly Insertable[], dialect));
		}

		// dedent the literal skeleton only (\x00 marks interpolation seams so values aren't dedented).
		const seam = String.fromCharCode(0);
		const dedented = dedent((first as TemplateStringsArray).join(seam)).split(seam);

		let out = "";
		for (let i = 0; i < dedented.length; i++) {
			out += dedented[i] ?? "";
			if (i < subs.length) out += render(subs[i] as Insertable, dialect);
		}

		return new RichDocument(dialect, out);
	}) as RichTemplate;
}

/**
 * the html authoring entry point — a tagged template whose interpolations are
 * auto-escaped (never re-parsed as markup); builder nodes render themselves,
 * a nested `RichDocument` is spliced in raw (dialect-checked). also accepts a
 * block array (`html([heading(1, t), table(rows)])`) or a plain pre-formatted
 * string. returns a `RichDocument` — pass it straight to `sendRichMessage`.
 */
export const html: RichTemplate = makeTemplate("html");

/**
 * the markdown authoring entry point — same three forms as `html`, emitting
 * `InputRichMessage.markdown` instead. the *same* builders work under both tags:
 * every `RichNode` renders itself into whichever dialect the template asks for.
 *
 * @example
 * md`
 *   # ${title}
 *
 *   ${bold("status:")} ${status}
 * `
 */
export const md: RichTemplate = makeTemplate("markdown");

export interface DocumentOptions {
	/** target dialect. defaults to `"html"` (the fully documented one). */
	dialect?: Dialect;
	/** `InputRichMessage.is_rtl` — show the message right-to-left. */
	rtl?: boolean;
	/** `InputRichMessage.skip_entity_detection` — see `RichDocument.noEntityDetection`. */
	skipEntityDetection?: boolean;
}

/**
 * assemble top-level blocks into a `RichDocument` in one call — the options-object
 * counterpart of `html([...])`/`md([...])` + the fluent flag setters.
 */
export function document(
	blocks: readonly Insertable[] | Insertable,
	options: DocumentOptions = {},
): RichDocument {
	const dialect = options.dialect ?? "html";
	const entries: readonly Insertable[] = Array.isArray(blocks) ? blocks : [blocks];
	const doc = new RichDocument(dialect, joinBlocks(entries, dialect));

	if (options.rtl !== undefined) doc.rtl(options.rtl);
	if (options.skipEntityDetection !== undefined) doc.noEntityDetection(options.skipEntityDetection);

	return doc;
}
