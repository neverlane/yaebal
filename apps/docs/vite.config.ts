import { createReadStream, existsSync } from "node:fs";
import { extname, join } from "node:path";
import { sveltekit } from "@sveltejs/kit/vite";
import { type Plugin, defineConfig } from "vite";

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
	plugins: [sveltekit(), pagefindDev()],
});
