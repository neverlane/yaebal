import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";
import adapter from "@sveltejs/adapter-static";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const packagesRoot = join(repoRoot, "packages");

const workspaceAliases = Object.fromEntries(
	readdirSync(packagesRoot, { withFileTypes: true }).flatMap((entry) => {
		if (!entry.isDirectory()) return [];

		const packageJsonPath = join(packagesRoot, entry.name, "package.json");
		if (!existsSync(packageJsonPath)) return [];

		const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
		if (typeof packageJson.name !== "string") return [];

		return [[packageJson.name, join(packagesRoot, entry.name, "src", "index.ts")]];
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
