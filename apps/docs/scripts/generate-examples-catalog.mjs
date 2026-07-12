// generates apps/docs/src/lib/examples-catalog.ts from examples/README.md — the single
// source of truth for the runnable example bots. the README stays the canonical, hand-edited
// list (maintainers add a bot there); this script keeps the docs site's examples/recipes
// pages from drifting off it instead of hand-duplicating the table a second time.
//
// run: node scripts/generate-examples-catalog.mjs  (from apps/docs/)

import { readFileSync, writeFileSync } from "node:fs";

const repoRoot = new URL("../../../", import.meta.url);
const docsRoot = new URL("../", import.meta.url);

const readme = readFileSync(new URL("examples/README.md", repoRoot), "utf8");

/** returns the data rows (header + separator stripped) of the first markdown table under `## heading`. */
function tableRows(markdown, heading) {
	const headingRe = new RegExp(`^## ${heading}$`, "m");
	const start = markdown.search(headingRe);
	if (start === -1) {
		throw new Error(`generate-examples-catalog: no "## ${heading}" section in examples/README.md`);
	}

	const rest = markdown.slice(start);
	const nextHeading = rest.slice(1).search(/^## /m);
	const section = nextHeading === -1 ? rest : rest.slice(0, nextHeading + 1);

	const rows = section.split("\n").filter((line) => line.trim().startsWith("|"));
	// row 0 is the header, row 1 is the `|:--|:--|` separator.
	return rows.slice(2);
}

function cells(line) {
	return line
		.split("|")
		.slice(1, -1)
		.map((c) => c.trim().replace(/`/g, ""));
}

const botsRows = tableRows(readme, "bots");
const EXAMPLES_CATALOG = botsRows.map((line) => {
	const raw = line.split("|").slice(1, -1);
	if (raw.length !== 4) throw new Error(`generate-examples-catalog: unexpected bots row: ${line}`);

	const nameMatch = raw[0].match(/\[([^\]]+)\]/);
	if (!nameMatch) throw new Error(`generate-examples-catalog: couldn't parse example name from: ${raw[0]}`);

	const [, packageCell, focusCell, runCell] = cells(line);
	return { name: nameMatch[1], package: packageCell, focus: focusCell, run: runCell };
});

const patternRows = tableRows(readme, "patterns to copy");
const PATTERN_CATALOG = patternRows.map((line) => {
	const [pattern, copyFrom] = cells(line);
	if (pattern === undefined || copyFrom === undefined) {
		throw new Error(`generate-examples-catalog: unexpected pattern row: ${line}`);
	}
	return { pattern, copyFrom };
});

const banner = `// GENERATED FILE — do not edit by hand.
// source of truth: examples/README.md ("## bots" and "## patterns to copy" tables).
// regenerate with: node apps/docs/scripts/generate-examples-catalog.mjs
`;

const out = `${banner}
export interface ExampleCatalogEntry {
	name: string;
	package: string;
	focus: string;
	run: string;
}

export const EXAMPLES_CATALOG: readonly ExampleCatalogEntry[] = ${JSON.stringify(EXAMPLES_CATALOG, null, "\t")};

export interface PatternCatalogEntry {
	pattern: string;
	copyFrom: string;
}

export const PATTERN_CATALOG: readonly PatternCatalogEntry[] = ${JSON.stringify(PATTERN_CATALOG, null, "\t")};
`;

writeFileSync(new URL("src/lib/examples-catalog.ts", docsRoot), out);
console.log(
	`generate-examples-catalog: wrote ${EXAMPLES_CATALOG.length} examples, ${PATTERN_CATALOG.length} patterns to src/lib/examples-catalog.ts`,
);
