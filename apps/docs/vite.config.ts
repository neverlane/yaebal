import { createReadStream, existsSync, readdirSync, readFileSync } from "node:fs";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { type Plugin, defineConfig } from "vite";
import { sveltekit } from "@sveltejs/kit/vite";

interface PackageJson {
	name?: unknown;
}

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const packagesRoot = join(repoRoot, "packages");

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// vite string aliases match by prefix, so a bare `@yaebal/core` alias would also
// swallow `@yaebal/core/node` and produce `.../src/index.ts/node`. emit an anchored
// exact alias for the bare specifier (→ `src/index.ts`, source) plus a `/*` wildcard
// for subpath entries (→ built `lib/*`), so `@yaebal/core/node` resolves to
// `lib/node.js`. subpaths use `lib` rather than `src` because they are often
// node-only and shouldn't be type-checked against the docs app's browser lib.
const workspaceAliases = readdirSync(packagesRoot, { withFileTypes: true }).flatMap((entry) => {
	if (!entry.isDirectory()) return [];

	const packageDir = join(packagesRoot, entry.name);
	const packageJsonPath = join(packageDir, "package.json");
	if (!existsSync(packageJsonPath)) return [];

	const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8")) as PackageJson;
	if (typeof packageJson.name !== "string") return [];

	const name = packageJson.name;
	return [
		{
			find: new RegExp(`^${escapeRegExp(name)}$`),
			replacement: join(packageDir, "src", "index.ts"),
		},
		{
			find: new RegExp(`^${escapeRegExp(name)}\\/(.+)$`),
			replacement: `${join(packageDir, "lib")}/$1`,
		},
	];
});

// pagefind only exists after `pagefind --site build` writes it into `build/pagefind`.
// `vite dev` never produces it, so search would be dead in dev. this middleware serves
// that already-built index at `/pagefind/*` during dev — so after one `pnpm build`,
// search works in `pnpm dev` too. no build yet ⇒ falls through to a normal 404 and the
// search component stays inert.
const pagefindDev = (): Plugin => ({
	name: "pagefind-dev",
	apply: "serve",
	configureServer(server) {
		const types: Record<string, string> = {
			".js": "text/javascript",
			".json": "application/json",
			".css": "text/css",
			".wasm": "application/wasm",
		};
		server.middlewares.use("/pagefind", (req, res, next) => {
			const rel = (req.url ?? "/").split("?")[0] ?? "/";
			const file = join(process.cwd(), "build", "pagefind", rel);

			if (!file.startsWith(join(process.cwd(), "build", "pagefind")) || !existsSync(file))
				return next();
			
			res.setHeader("content-type", types[extname(file)] ?? "application/octet-stream");
			createReadStream(file).pipe(res);
		});
	},
});

export default defineConfig({
	resolve: {
		alias: workspaceAliases,
	},
	plugins: [sveltekit(), pagefindDev()],
});
