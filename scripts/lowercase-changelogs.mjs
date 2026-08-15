// normalize the boilerplate changesets writes into every CHANGELOG.md to lowercase, so
// changelogs read like the rest of the repo's prose (docs pages and package readmes are
// lowercase; code identifiers, package names and versions stay exact).
//
// changesets emits exactly two capitalized strings — the `### Patch Changes` section headings
// (from changesets core, which no changelog plugin can override) and the
// `- Updated dependencies [hash]` bullets. everything else in a changelog is authored changeset
// text, so this touches those two shapes and nothing else: never a blanket toLowerCase(), which
// would flatten `@yaebal/core`, `MordaError` and every backticked identifier.
//
// chained after `changeset version` in the `version-packages` script, so a release can't
// reintroduce the uppercase form. idempotent — re-running is a no-op.
//
//   node scripts/lowercase-changelogs.mjs           rewrite in place
//   node scripts/lowercase-changelogs.mjs --check    report drift, exit 1 (for ci)

import { readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
// the pnpm workspace globs — every package that changesets can version.
const WORKSPACES = ["packages", "examples", "apps"];

const RULES = [
	// ### Patch Changes → ### patch changes
	[
		/^(#{1,4} )(Major|Minor|Patch) Changes$/gm,
		(_m, hashes, kind) => `${hashes}${kind.toLowerCase()} changes`,
	],
	// - Updated dependencies [7bcd7f8] → - updated dependencies [7bcd7f8]
	[/^(\s*[-*] )Updated dependencies\b/gm, (_m, bullet) => `${bullet}updated dependencies`],
];

const normalize = (text) =>
	RULES.reduce((acc, [pattern, replace]) => acc.replace(pattern, replace), text);

async function changelogs() {
	const found = [];
	for (const workspace of WORKSPACES) {
		let entries;
		try {
			entries = await readdir(join(ROOT, workspace), { withFileTypes: true });
		} catch {
			continue; // an optional workspace glob that this checkout doesn't have
		}
		for (const entry of entries) {
			if (entry.isDirectory()) found.push(join(ROOT, workspace, entry.name, "CHANGELOG.md"));
		}
	}
	found.push(join(ROOT, "CHANGELOG.md"));
	return found;
}

async function main() {
	const check = process.argv.includes("--check");
	const changed = [];

	for (const path of await changelogs()) {
		let before;
		try {
			before = await readFile(path, "utf8");
		} catch {
			continue; // no changelog yet — this package has never been released
		}
		const after = normalize(before);
		if (after === before) continue;
		changed.push(relative(ROOT, path));
		if (!check) await writeFile(path, after);
	}

	if (check && changed.length > 0) {
		console.error(
			`changelog casing drift in ${changed.length} file(s):\n  ${changed.join("\n  ")}\n` +
				"run `node scripts/lowercase-changelogs.mjs` to fix.",
		);
		process.exit(1);
	}

	console.log(
		check
			? "changelog casing ok"
			: changed.length === 0
				? "changelog casing already normalized"
				: `lowercased changelog boilerplate in ${changed.length} file(s)`,
	);
}

await main();
