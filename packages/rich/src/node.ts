/** the two wire dialects of `InputRichMessage` — `html` and `markdown`. */
export type Dialect = "html" | "markdown";

/** whether a node is an inline mark (bold, link, …) or a top-level block (paragraph, table, …). */
export type Level = "inline" | "block";

// `Symbol.for` so two copies of the package in one node_modules tree still
// recognise each other's nodes (a duck-typed `.html` check would false-positive
// on any object that happens to carry an `html: string` field).
const RICH_NODE = Symbol.for("yaebal.rich.node");

/**
 * one builder result — a dialect-agnostic fragment of a rich message. every
 * builder (`bold`, `paragraph`, `table`, …) returns one of these; nothing is
 * serialized until the node lands in an `html`/`md` template or a `document()`,
 * which picks the dialect and calls `render` once.
 */
export interface RichNode {
	readonly [RICH_NODE]: true;
	readonly level: Level;
	render(dialect: Dialect): string;
}

/** construct a `RichNode` from a level + per-dialect renderer. */
export function makeNode(level: Level, render: (dialect: Dialect) => string): RichNode {
	return { [RICH_NODE]: true as const, level, render };
}

export function isRichNode(value: unknown): value is RichNode {
	return (
		typeof value === "object" &&
		value !== null &&
		(value as Record<symbol, unknown>)[RICH_NODE] === true
	);
}

/** thrown on misuse — a dialect-mismatched interpolation, unsupported content. */
export class RichError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "RichError";
	}
}
