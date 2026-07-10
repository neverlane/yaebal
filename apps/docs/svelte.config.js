import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";
import adapter from "@sveltejs/adapter-static";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const packagesRoot = join(repoRoot, "packages");

// each package gets a base alias (bare specifier → src/index.ts, so the playground
// gets live source types) and a `/*` wildcard for subpath entries like
// `@yaebal/core/node`. subpaths resolve to the built `lib/*` (not `src/*`): they
// are often node-only and would otherwise be type-checked against the docs app's
// browser lib. the `/*` sibling is also what makes sveltekit emit an anchored base
// alias instead of a plain-string one — a plain-string base alias prefix-matches,
// mangling `@yaebal/core/node` into `.../src/index.ts/node`.
const workspaceAliases = Object.fromEntries(
	readdirSync(packagesRoot, { withFileTypes: true }).flatMap((entry) => {
		if (!entry.isDirectory()) return [];

		const packageDir = join(packagesRoot, entry.name);
		const packageJsonPath = join(packageDir, "package.json");
		if (!existsSync(packageJsonPath)) return [];

		const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
		if (typeof packageJson.name !== "string") return [];

		return [
			[packageJson.name, join(packageDir, "src", "index.ts")],
			[`${packageJson.name}/*`, `${join(packageDir, "lib")}/*`],
		];
	}),
);

/** @type {import('@sveltejs/kit').Config} */
export default {
	preprocess: vitePreprocess(),
	kit: {
		adapter: adapter({ fallback: "404.html" }),
		alias: { $lib: "src/lib", ...workspaceAliases },
	},
};
