/**
 * lets `bundleTgcloud` import a `.ts` bot entry. node strips types for the
 * file it was started with, not for modules loaded later, and the bot's own
 * package rarely has a compiled `lib/`.
 *
 * a `.ts` file imports its siblings as `.js` (the repo's module resolution).
 * the loader rewrites those itself, or `import("./db.js")` looks for a file
 * that was never emitted.
 *
 * types are stripped with esbuild, not `node:module.stripTypeScriptTypes` —
 * that export does not exist on node 20, which this package still supports.
 */
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { transformSync } from "esbuild";
import { fileURLToPath } from "node:url";

export function resolve(specifier, context, next) {
	const parent = context.parentURL;
	if (
		typeof parent === "string" &&
		parent.startsWith("file:") &&
		parent.endsWith(".ts") &&
		(specifier.startsWith("./") || specifier.startsWith("../")) &&
		specifier.endsWith(".js")
	) {
		const tsUrl = new URL(`${specifier.slice(0, -3)}.ts`, parent);
		const jsUrl = new URL(specifier, parent);
		if (existsSync(fileURLToPath(tsUrl)) && !existsSync(fileURLToPath(jsUrl))) {
			return { url: tsUrl.href, shortCircuit: true, format: "module" };
		}
	}
	return next(specifier, context);
}

export async function load(url, context, next) {
	if (!url.startsWith("file:") || !url.endsWith(".ts")) return next(url, context);
	const source = await readFile(new URL(url), "utf8");
	const stripped = transformSync(source, { loader: "ts", format: "esm", sourcefile: url });
	return {
		format: "module",
		shortCircuit: true,
		source: stripped.code,
	};
}
