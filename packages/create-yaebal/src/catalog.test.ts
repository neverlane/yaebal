/**
 * catalog-drift guard: every published, bot-installable `@yaebal/*` package
 * must be offered by the scaffolder. this is what caught `@yaebal/panel`
 * missing from `PLUGINS` — it existed for a long time before this test did.
 */

import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { PLUGIN_IDS } from "./catalog.js";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const packagesDir = join(repoRoot, "packages");

/**
 * not "plugins" in the `.install()`/context-extension sense, so they're not
 * expected in the catalog:
 * - core/types/contexts/test are the framework itself, not a plugin
 * - sklad is a storage contract other plugins (session, feature-flags) build on
 * - create-yaebal/yaebal are the scaffolder and the meta package, not `@yaebal/*` plugins
 * - preview is a standalone `renderChat()` svg renderer — no `Plugin<...>`, nothing to `.install()`
 */
const EXCLUDED = new Set(["core", "types", "contexts", "test", "sklad", "preview"]);

function publishedYaebalPackages(): string[] {
	const names: string[] = [];

	for (const entry of readdirSync(packagesDir, { withFileTypes: true })) {
		if (!entry.isDirectory()) continue;

		const pkgPath = join(packagesDir, entry.name, "package.json");
		let name: string;
		try {
			name = JSON.parse(readFileSync(pkgPath, "utf8")).name;
		} catch {
			continue;
		}

		if (typeof name === "string" && name.startsWith("@yaebal/")) {
			names.push(name.slice("@yaebal/".length));
		}
	}

	return names;
}

test("every bot-installable @yaebal package is offered by the scaffolder", () => {
	const missing = publishedYaebalPackages().filter(
		(id) => !EXCLUDED.has(id) && !PLUGIN_IDS.includes(id),
	);

	assert.deepEqual(
		missing,
		[],
		`packages/* has published plugins the catalog doesn't offer: ${missing.join(", ")} — ` +
			"add them to PLUGINS in catalog.ts, or to EXCLUDED here if they're not bot-installable",
	);
});

test("PLUGIN_IDS has no stale entries for packages that no longer exist", () => {
	const published = new Set(publishedYaebalPackages());
	const stale = PLUGIN_IDS.filter((id) => !published.has(id));

	assert.deepEqual(
		stale,
		[],
		`catalog offers plugins with no matching package: ${stale.join(", ")}`,
	);
});
