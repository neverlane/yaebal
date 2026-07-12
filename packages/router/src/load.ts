import type { Dirent } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { type Context, type Middleware, updateNames } from "@yaebal/core";
import { applyCommandsBridge } from "./commands-bridge.js";
import type {
	CommandApiLike,
	CommandRouteDef,
	GuardRouteDef,
	LoadOptions,
	LoadResult,
	RegisteredRoute,
	RouterWarning,
	RouteTarget,
} from "./types.js";
import { ROUTE_DEF, type RouteDef, type RouteKind } from "./types.js";
import {
	checkCommandName,
	checkFilenameMatch,
	checkOnQuery,
	DuplicateTracker,
} from "./validate.js";

export const DEFAULT_EXTENSIONS = [".js", ".mjs", ".cjs", ".ts"];

const KIND_DIRS: Record<RouteKind, string> = {
	use: "use",
	command: "commands",
	hears: "hears",
	on: "on",
};
/** registration order — fixed and documented, since middleware order is semantics. */
const KIND_ORDER: RouteKind[] = ["use", "command", "hears", "on"];

function isEnoent(error: unknown): boolean {
	return (
		error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT"
	);
}

function isRouteDef(value: unknown): value is RouteDef {
	return typeof value === "object" && value !== null && ROUTE_DEF in value;
}

/**
 * `cacheBust` (only ever set by `watchRoutes`) is appended as a query string, so a reimport after
 * an edit bypasses node's ESM module cache instead of returning the stale, already-evaluated
 * module — the standard trick, since the cache key is the full specifier including the query.
 */
async function importModule(file: string, cacheBust?: string): Promise<{ default?: unknown }> {
	const url = pathToFileURL(file).href;
	try {
		return (await import(cacheBust ? `${url}?${cacheBust}` : url)) as { default?: unknown };
	} catch (cause) {
		throw new Error(`@yaebal/router: failed to load ${file}`, { cause });
	}
}

function compareNatural(a: string, b: string): number {
	return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

function stripPrefix(name: string): string {
	return name.replace(/^\d+-/, "");
}

interface RouteFile {
	absPath: string;
	/** path segments from the kind root down to the file, prefix-stripped, extension-less. */
	relSegments: string[];
	/** directories from the kind root down to (and including) the file's own directory — the
	 * order `_guard.ts` lookups walk, outermost first. */
	dirChain: string[];
}

/** recursively collects route files under a kind directory, in deterministic (natural-sorted,
 * numeric-prefix-aware) order. `_guard.*` files are organizational and excluded here — see
 * {@link loadGuardFile}. an absent directory yields no files; any other `readdir` failure (e.g. a
 * permissions error, or the path pointing at a plain file) is a real problem and propagates. */
async function walkKindDir(kindRootAbs: string, extensions: string[]): Promise<RouteFile[]> {
	const out: RouteFile[] = [];

	async function walk(dirAbs: string, relParts: string[], dirChain: string[]): Promise<void> {
		let entries: Dirent[];
		try {
			entries = await readdir(dirAbs, { withFileTypes: true });
		} catch (error) {
			if (isEnoent(error)) return;
			throw new Error(`@yaebal/router: failed to read ${dirAbs}`, { cause: error });
		}

		entries.sort((a, b) => compareNatural(a.name, b.name));
		const nextChain = [...dirChain, dirAbs];

		for (const entry of entries) {
			if (entry.name.startsWith("_guard.")) continue;

			if (entry.isDirectory()) {
				await walk(join(dirAbs, entry.name), [...relParts, entry.name], nextChain);
				continue;
			}

			const ext = extname(entry.name);
			if (entry.name.endsWith(".d.ts") || !extensions.includes(ext)) continue;

			const base = stripPrefix(basename(entry.name, ext));
			out.push({
				absPath: join(dirAbs, entry.name),
				relSegments: [...relParts, base],
				dirChain: nextChain,
			});
		}
	}

	await walk(kindRootAbs, [], []);
	return out;
}

/** finds and imports `_guard.<ext>` in `dir` (first matching extension wins), memoized per
 * directory. throws — unconditionally, `strict` does not apply — if a `_guard.*` file exists but
 * fails to import or isn't a `defineGuard(...)` value: see {@link LoadOptions.strict}. */
async function loadGuardFile<C extends Context>(
	dir: string,
	extensions: string[],
	cache: Map<string, GuardRouteDef<C> | null>,
	cacheBust?: string,
): Promise<GuardRouteDef<C> | null> {
	const cached = cache.get(dir);
	if (cached !== undefined) return cached;

	for (const ext of extensions) {
		const candidate = join(dir, `_guard${ext}`);

		try {
			await stat(candidate);
		} catch {
			continue;
		}

		const mod = await importModule(candidate, cacheBust);
		if (!isRouteDef(mod.default) || mod.default.kind !== "guard") {
			throw new Error(`@yaebal/router: ${candidate} must default-export defineGuard(...)`);
		}

		cache.set(dir, mod.default as GuardRouteDef<C>);
		return mod.default as GuardRouteDef<C>;
	}

	cache.set(dir, null);
	return null;
}

interface ResolvedRoute<C extends Context> {
	def: RouteDef<C>;
	file: string;
	label: string;
	guards: Array<(ctx: C) => boolean | Promise<boolean>>;
}

interface BuildCtx<C extends Context> {
	strict: boolean;
	extensions: string[];
	warnings: RouterWarning[];
	guardCache: Map<string, GuardRouteDef<C> | null>;
	dup: Record<"command" | "on" | "hears", DuplicateTracker>;
}

function report<C extends Context>(ctx: BuildCtx<C>, message: string, file: string): void {
	if (ctx.strict) throw new Error(`@yaebal/router: ${message} (in ${file})`);
	ctx.warnings.push({ message, file });
}

async function loadKind<C extends Context>(
	kind: RouteKind,
	routesDir: string,
	ctx: BuildCtx<C>,
	cacheBust?: string,
): Promise<ResolvedRoute<C>[]> {
	const kindRoot = join(routesDir, KIND_DIRS[kind]);
	const files = await walkKindDir(kindRoot, ctx.extensions);
	const resolved: ResolvedRoute<C>[] = [];

	for (const routeFile of files) {
		const relFile = `${KIND_DIRS[kind]}/${routeFile.relSegments.join("/")}`;
		const label = routeFile.relSegments.join("/");
		const mod = await importModule(routeFile.absPath, cacheBust);

		if (!isRouteDef(mod.default)) {
			report(ctx, `must default-export a define*() route (got ${typeof mod.default})`, relFile);
			continue;
		}
		if (mod.default.kind === "guard") {
			report(
				ctx,
				`defineGuard() routes must be named _guard.<ext> — rename or move this file`,
				relFile,
			);
			continue;
		}
		if (mod.default.kind !== kind) {
			report(
				ctx,
				`${KIND_DIRS[kind]}/ expects a define${capitalize(kind)}() route, got kind "${mod.default.kind}"`,
				relFile,
			);
			continue;
		}

		const def = mod.default as RouteDef<C>;
		const basenameSegment = routeFile.relSegments.at(-1) ?? "";

		if (def.kind === "command") {
			let invalid = false;
			for (const name of def.names) {
				const nameError = checkCommandName(name);
				if (nameError) {
					report(ctx, nameError, relFile);
					invalid = true;
				}
			}
			for (const name of def.names) {
				const dupError = ctx.dup.command.check(name, relFile);
				if (dupError) {
					report(ctx, dupError, relFile);
					invalid = true;
				}
			}
			if (invalid) continue;

			const mismatch = checkFilenameMatch(basenameSegment, def.names[0]);
			if (mismatch) ctx.warnings.push({ message: mismatch, file: relFile });
		}

		if (def.kind === "on") {
			const queryError = checkOnQuery(def.query, updateNames);
			if (queryError) {
				report(ctx, queryError, relFile);
				continue;
			}
			const dupError = ctx.dup.on.check(def.query, relFile);
			if (dupError) {
				report(ctx, dupError, relFile);
				continue;
			}

			const mismatch = checkFilenameMatch(basenameSegment.replaceAll(".", ":"), def.query);
			if (mismatch) ctx.warnings.push({ message: mismatch, file: relFile });
		}

		if (def.kind === "hears") {
			const dupError = ctx.dup.hears.check(String(def.trigger), relFile);
			if (dupError) {
				report(ctx, dupError, relFile);
				continue;
			}
		}

		const guards = await resolveGuardChain<C>(routeFile.dirChain, ctx, cacheBust);
		resolved.push({ def, file: relFile, label, guards });
	}

	return resolved;
}

function capitalize(s: string): string {
	return s.length === 0 ? s : `${s[0]?.toUpperCase()}${s.slice(1)}`;
}

async function resolveGuardChain<C extends Context>(
	dirChain: string[],
	ctx: BuildCtx<C>,
	cacheBust?: string,
): Promise<Array<(ctx: C) => boolean | Promise<boolean>>> {
	const predicates: Array<(ctx: C) => boolean | Promise<boolean>> = [];

	for (const dir of dirChain) {
		const guard = await loadGuardFile<C>(dir, ctx.extensions, ctx.guardCache, cacheBust);
		if (guard) predicates.push(guard.predicate);
	}

	return predicates;
}

function guardMiddleware<C extends Context>(
	guards: Array<(ctx: C) => boolean | Promise<boolean>>,
): Middleware<C> {
	return async (ctx, next) => {
		for (const guard of guards) {
			if (!(await guard(ctx))) return;
		}
		return next();
	};
}

function applyRoutes<C extends Context>(
	target: RouteTarget<C>,
	resolved: ResolvedRoute<C>[],
): RegisteredRoute[] {
	const registered: RegisteredRoute[] = [];

	for (const r of resolved) {
		const { def } = r;
		const guardMw = r.guards.length > 0 ? [guardMiddleware<C>(r.guards)] : [];

		switch (def.kind) {
			case "use": {
				target.use(...guardMw, ...def.handlers);
				registered.push({ kind: "use", trigger: r.label, file: r.file });
				break;
			}
			case "command": {
				const [first, ...aliases] = def.names;
				if (def.handlers.length > 0) {
					for (const name of def.names) target.command(name, ...guardMw, ...def.handlers);
				}
				registered.push({
					kind: "command",
					trigger: first,
					...(aliases.length > 0 ? { aliases } : {}),
					file: r.file,
				});
				break;
			}
			case "hears": {
				target.hears(def.trigger, ...guardMw, ...def.handlers);
				registered.push({ kind: "hears", trigger: String(def.trigger), file: r.file });
				break;
			}
			case "on": {
				target.on(def.query, ...guardMw, ...def.handlers);
				registered.push({ kind: "on", trigger: def.query, file: r.file });
				break;
			}
			default:
				break;
		}
	}

	return registered;
}

/**
 * the shared build step behind both `loadRoutes` and `watchRoutes`: scan `dir`, validate, resolve
 * guards — everything except actually registering on a target, so `watchRoutes` can rebuild an
 * off-bot registry on every file change without touching the live bot in between. `cacheBust` is
 * an internal `watchRoutes` detail (see {@link importModule}) — `loadRoutes` never sets it.
 */
async function buildRoutes<C extends Context>(
	dir: string,
	options: LoadOptions<C>,
	cacheBust?: string,
): Promise<{ resolved: ResolvedRoute<C>[]; warnings: RouterWarning[] }> {
	const ctx: BuildCtx<C> = {
		strict: options.strict ?? true,
		extensions: options.extensions ?? DEFAULT_EXTENSIONS,
		warnings: [],
		guardCache: new Map(),
		dup: {
			command: new DuplicateTracker(),
			on: new DuplicateTracker(),
			hears: new DuplicateTracker(),
		},
	};

	const resolved: ResolvedRoute<C>[] = [];
	for (const kind of KIND_ORDER) resolved.push(...(await loadKind<C>(kind, dir, ctx, cacheBust)));

	return { resolved, warnings: ctx.warnings };
}

/**
 * load handlers from a routes directory and register them on `target`:
 *
 * - `<dir>/commands/<name>.ts` → `export default defineCommand(...)`
 * - `<dir>/on/<query>.ts` (dots become `:`) → `export default defineOn(...)`
 * - `<dir>/hears/<label>.ts` → `export default defineHears(...)`
 * - `<dir>/use/<name>.ts` → `export default defineUse(...)`
 * - `<dir>/<kind>/**\/_guard.ts` → `export default defineGuard(...)`, gates its directory
 *
 * registers in a fixed order (`use` → `commands` → `hears` → `on`) regardless of file-system
 * order, then returns what it registered — see {@link LoadResult}.
 */
export async function loadRoutes<C extends Context>(
	target: RouteTarget<C> & { api?: CommandApiLike },
	dir: string,
	options: LoadOptions<C> = {},
): Promise<LoadResult> {
	const { resolved, warnings } = await buildRoutes<C>(dir, options);
	const routes = applyRoutes(target, resolved);

	const commandDefs = resolved
		.map((r) => r.def)
		.filter((d): d is CommandRouteDef<C> => d.kind === "command");
	const { commands } = await applyCommandsBridge(commandDefs, options, target.api);

	return { routes, commands, warnings };
}

export type { ResolvedRoute };
export { applyRoutes, buildRoutes, guardMiddleware };
