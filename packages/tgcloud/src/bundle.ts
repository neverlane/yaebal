import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { register } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { type Bot, type Context, updateNames } from "@yaebal/core";
import * as esbuild from "esbuild";
import { handlerTypes } from "./handlers.js";

export interface BundleTgcloudOptions {
	/** project that exports the bot. a path, or `{ path, export? }` (default export `bot`). */
	input: string | { path: string; export?: string };
	/** bot project root. `tgcloud/` is created here. defaults to cwd. */
	root?: string;
	/** also emit these handler types, on top of what the bot registers. */
	handlers?: readonly string[];
	/** handler types to never emit, even if registered. */
	ignore?: readonly string[];
	/** esbuild `define`, e.g. `{ "process.env.NODE_ENV": '"production"' }`. */
	define?: Record<string, string>;
	/** keep `console.*`. off by default — tgcloud captures logs, but they cost cold start. */
	keepLogs?: boolean;
}

export interface BundleTgcloudResult {
	/** absolute path of the written `tgcloud/` directory. */
	dir: string;
	/** handler files written, relative to `tgcloud/` (`handlers/message.js`, …). */
	handlers: string[];
	/** handler files removed because the bot no longer registers them. */
	removed: string[];
}

/**
 * compile a yaebal bot into a telegram serverless project.
 *
 * one self-contained bundle per update type lands in `tgcloud/handlers/`,
 * because the platform imports each handler on its own and forbids npm. bot
 * api calls are rewritten onto `sdk` — the bundle imports `sdk` and nothing
 * else. handlers the bot stopped registering are deleted, so the folder
 * mirrors the bot.
 */
export async function bundleTgcloud(options: BundleTgcloudOptions): Promise<BundleTgcloudResult> {
	const input = typeof options.input === "string" ? { path: options.input } : options.input;
	const exportName = input.export ?? "bot";
	const root = resolve(options.root ?? process.cwd());
	const dir = join(root, "tgcloud");
	const handlersDir = join(dir, "handlers");
	const entryPath = fileURLToPath(new URL("./entry.js", import.meta.url));

	const bot = await loadBot(resolve(input.path), exportName);
	const ignore = new Set(options.ignore ?? []);
	const types = handlerTypes(bot, options.handlers).filter((type) => !ignore.has(type));
	if (types.length === 0) {
		throw new Error("@yaebal/tgcloud: the bot registers no update types to bundle");
	}

	await mkdir(handlersDir, { recursive: true });
	const removed = await pruneHandlers(handlersDir, types);
	const template = await readFile(entryPath, "utf8");

	await Promise.all(
		types.map(async (type) => {
			const source = template.replaceAll("__YAEBAL_TGCLOUD_ENTRY__", JSON.stringify(type));
			const result = await esbuild.build({
				absWorkingDir: root,
				stdin: {
					contents: source,
					resolveDir: dirname(entryPath),
					sourcefile: entryPath,
					loader: "js",
				},
				bundle: true,
				format: "esm",
				platform: "neutral",
				target: "es2022",
				write: false,
				define: {
					...options.define,
					__YAEBAL_TGCLOUD_INPUT__: JSON.stringify(resolve(input.path)),
					__YAEBAL_TGCLOUD_EXPORT__: JSON.stringify(exportName),
				},
				plugins: [sdkExternals()],
				drop: options.keepLogs ? [] : ["console", "debugger"],
				legalComments: "none",
				logLevel: "silent",
			});
			const output = result.outputFiles?.[0];
			if (!output) throw new Error(`@yaebal/tgcloud: esbuild produced nothing for ${type}`);
			await writeFile(join(handlersDir, `${type}.js`), output.contents);
		}),
	);

	return {
		dir,
		handlers: types.map((type) => `handlers/${type}.js`),
		removed,
	};
}

/** `sdk` and `sdk/*` stay as bare imports; everything else is inlined. */
function sdkExternals(): esbuild.Plugin {
	return {
		name: "yaebal-tgcloud-sdk",
		setup(build) {
			build.onResolve({ filter: /^sdk$/ }, () => ({ path: "sdk", external: true }));
			build.onResolve({ filter: /^sdk\// }, (args) => ({ path: args.path, external: true }));
		},
	};
}

let hooksRegistered = false;

function registerLoadHooks(): void {
	if (hooksRegistered) return;
	// registered last, so it runs first and can rewrite `.js` imports inside `.ts`.
	// the sdk stand-in is behind it and only answers when nothing else resolves `sdk`.
	register(new URL("./sdk-stub.mjs", import.meta.url));
	register(new URL("./strip-types.mjs", import.meta.url));
	hooksRegistered = true;
}

async function loadBot(path: string, exportName: string): Promise<Bot<Context>> {
	// the entry is usually the bot's own .ts, and it imports `sdk`, which only
	// exists inside tgcloud. node strips types for the file it was started with,
	// not for ones import() pulls in afterwards.
	registerLoadHooks();
	const imported = (await import(pathToFileUrl(path))) as Record<string, unknown>;
	const bot = imported[exportName];
	if (!isBot(bot)) {
		throw new Error(
			`@yaebal/tgcloud: ${path} has no bot export "${exportName}" — expected an object with handleUpdate()`,
		);
	}
	return bot;
}

function isBot(value: unknown): value is Bot<Context> {
	return (
		typeof value === "object" &&
		value !== null &&
		"handleUpdate" in value &&
		typeof value.handleUpdate === "function" &&
		"registeredUpdates" in value &&
		typeof value.registeredUpdates === "function"
	);
}

function pathToFileUrl(path: string): string {
	if (path.startsWith("file:")) return path;
	const absolute = resolve(path);
	return `file://${absolute}`;
}

async function pruneHandlers(dir: string, keep: readonly string[]): Promise<string[]> {
	let names: string[];
	try {
		names = await readdir(dir);
	} catch {
		return [];
	}
	const known = new Set<string>(updateNames);
	const keepFiles = new Set(keep.map((type) => `${type}.js`));
	const removed: string[] = [];
	for (const name of names) {
		if (!name.endsWith(".js") || keepFiles.has(name)) continue;
		if (!known.has(name.slice(0, -3))) continue;
		await rm(join(dir, name));
		removed.push(`handlers/${name}`);
	}
	removed.sort();
	return removed;
}
