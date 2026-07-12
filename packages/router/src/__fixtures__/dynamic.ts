/**
 * test-only helper: writes route files into a throwaway temp directory at test-run time, so
 * `load.test.ts`/`watch.test.ts` can build arbitrary directory trees (nested dirs, guards,
 * numeric prefixes, deliberately-invalid routes) per test case without a combinatorial pile of
 * committed fixture files. generated files are plain `.mjs` (no tsc/type-stripping involved —
 * they're written and imported entirely at runtime) and import the router package's own build
 * output via an absolute `file:` URL, so they work regardless of the temp dir's location.
 */
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

/** absolute `file:` URL to this package's own built entry point (`lib/index.js`) — resolved from
 * this module's own compiled location (`lib/__fixtures__/dynamic.js`), one level up. */
const ROUTER_ENTRY = pathToFileURL(fileURLToPath(new URL("../index.js", import.meta.url))).href;

export interface TempRoutes {
	dir: string;
	/** write one route file. `relPath` is relative to `dir` (e.g. `"commands/admin/ban.mjs"`);
	 * intermediate directories are created as needed. `body` is the file's own source — it can
	 * reference the already-imported `router` namespace (`defineCommand`, `defineOn`, …). */
	write(relPath: string, body: string): Promise<void>;
	cleanup(): Promise<void>;
}

export async function createTempRoutes(): Promise<TempRoutes> {
	const dir = await mkdtemp(join(tmpdir(), "yaebal-router-"));

	return {
		dir,
		async write(relPath, body) {
			const file = join(dir, relPath);
			await mkdir(dirname(file), { recursive: true });
			await writeFile(file, `import * as router from ${JSON.stringify(ROUTER_ENTRY)};\n${body}\n`);
		},
		cleanup: () => rm(dir, { recursive: true, force: true }),
	};
}
