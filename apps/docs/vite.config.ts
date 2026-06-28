import { createReadStream, existsSync, readdirSync, readFileSync } from "node:fs";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { sveltekit } from "@sveltejs/kit/vite";
import { type Plugin, defineConfig } from "vite";

interface PackageJson {
	name?: unknown;
}

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const packagesRoot = join(repoRoot, "packages");

const workspaceAliases = readdirSync(packagesRoot, { withFileTypes: true }).flatMap((entry) => {
	if (!entry.isDirectory()) return [];

	const packageJsonPath = join(packagesRoot, entry.name, "package.json");
	if (!existsSync(packageJsonPath)) return [];

	const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8")) as PackageJson;
	if (typeof packageJson.name !== "string") return [];

	return [
		{
			find: packageJson.name,
			replacement: join(packagesRoot, entry.name, "src", "index.ts"),
		},
	];
});

// Pagefind only exists after `pagefind --site build` writes it into `build/pagefind`.
// `vite dev` never produces it, so search would be dead in dev. This middleware serves
// that already-built index at `/pagefind/*` during dev — so after one `pnpm build`,
// search works in `pnpm dev` too. No build yet ⇒ falls through to a normal 404 and the
// Search component stays inert.
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
