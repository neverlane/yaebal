/**
 * lets `bundleTgcloud` import a `.ts` bot entry. node strips types for the
 * file it was started with, not for modules loaded later, and the bot's own
 * package rarely has a compiled `lib/`.
 *
 * a `.ts` file imports its siblings as `.js` (the repo's module resolution).
 * the native stripper rewrites those; a custom loader has to do it itself,
 * or `import("./db.js")` looks for a file that was never emitted.
 */
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
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
	return {
		format: "module",
		shortCircuit: true,
		source: stripTypeScriptTypes(source, { mode: "strip" }),
	};
}
