import { type Dirent, type FSWatcher, watch as fsWatch } from "node:fs";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { Composer, type Context, type Middleware } from "@yaebal/core";
import { applyCommandsBridge } from "./commands-bridge.js";
import { applyRoutes, buildRoutes } from "./load.js";
import type {
	CommandApiLike,
	CommandRouteDef,
	LoadOptions,
	LoadResult,
	RouteTarget,
} from "./types.js";

export interface WatchOptions<C extends Context = Context> extends LoadOptions<C> {
	/** quiet window after a file-system event before rebuilding, coalescing the burst of events one
	 * editor save often produces. default `150`. */
	debounceMs?: number;
	/** called after every successful (re)build, including the first. */
	onReload?: (result: LoadResult) => void;
	/**
	 * called when a *live* rebuild throws (a broken `_guard.ts`, or a route failing validation
	 * under `strict: true`) — the previously built, last-good route set stays mounted, so one bad
	 * edit doesn't take the bot down. defaults to `console.error`. the *first* build is not covered
	 * by this: it throws out of `watchRoutes()` itself, same as `loadRoutes` would.
	 */
	onError?: (error: unknown) => void;
}

function debounce(fn: () => void, ms: number): () => void {
	let timer: ReturnType<typeof setTimeout> | undefined;
	return () => {
		if (timer) clearTimeout(timer);
		timer = setTimeout(fn, ms);
	};
}

async function collectDirs(root: string): Promise<string[]> {
	const out = [root];
	let entries: Dirent[];

	try {
		entries = await readdir(root, { withFileTypes: true });
	} catch {
		return out;
	}

	for (const entry of entries) {
		if (entry.isDirectory()) out.push(...(await collectDirs(join(root, entry.name))));
	}

	return out;
}

/**
 * watches `dir` for changes and keeps a stable, non-recursive `fs.watch` per subdirectory in
 * sync — node's single recursive `fs.watch` is macOS/Windows-only; this is the portable fallback,
 * used unconditionally so behavior doesn't differ by platform. re-scanned after every trigger so a
 * newly created subdirectory picks up its own watcher on the next change.
 */
async function watchTree(root: string, onChange: () => void): Promise<() => void> {
	let watchers: FSWatcher[] = [];
	let disposed = false;

	const refresh = async (): Promise<void> => {
		for (const w of watchers) w.close();
		watchers = [];
		if (disposed) return;

		for (const dir of await collectDirs(root)) {
			try {
				watchers.push(
					fsWatch(dir, () => {
						if (disposed) return;
						onChange();
						void refresh();
					}),
				);
			} catch {
				// the directory may have been removed between listing and watching — skip it, the
				// next refresh (triggered by whatever removed it) will drop it for good.
			}
		}
	};

	await refresh();

	return () => {
		disposed = true;
		for (const w of watchers) w.close();
	};
}

/**
 * dev-mode hot reload: like `loadRoutes`, but keeps watching `dir` afterwards and re-applies
 * routes on every change — no bot restart needed. mounts exactly one stable middleware on
 * `target` (`Composer`/`Bot` can't drop a middleware once added), which delegates to a
 * rebuildable off-bot registry; each rebuild swaps that registry's reference atomically, so an
 * update already in flight finishes against whichever route set was live when it started.
 *
 * unlike `loadRoutes`, `strict` defaults to `false` here: a route file mid-edit is expected, not
 * exceptional — it becomes a warning (delivered via `onReload`) rather than killing the watcher.
 * pass `strict: true` to keep hard failures during development too.
 *
 * returns a disposer that stops watching; call it on shutdown (`process.on("SIGINT", stop)`).
 * only for local development — cache-busted re-imports leak the previous module instance on every
 * reload (node has no ESM unload), and cross-platform recursive watching costs a directory scan
 * per change. never use this in production; use `loadRoutes` there.
 */
export async function watchRoutes<C extends Context>(
	target: RouteTarget<C> & { api?: CommandApiLike },
	dir: string,
	options: WatchOptions<C> = {},
): Promise<() => Promise<void>> {
	// two different defaults for the same `strict` option (see the doc comment above): the first
	// build is loud by default (like loadRoutes), every later live rebuild is quiet by default.
	// an explicit `options.strict` wins in both cases either way, since both defaults collapse to
	// the same value once it's set.
	const firstBuildOptions: LoadOptions<C> = { ...options, strict: options.strict ?? true };
	const liveBuildOptions: LoadOptions<C> = { ...options, strict: options.strict ?? false };
	const onError =
		options.onError ?? ((error: unknown) => console.error("[yaebal/router] watchRoutes:", error));

	let active: Middleware<C> | undefined;
	let version = 0;

	async function buildAndSwap(
		buildOptions: LoadOptions<C>,
		cacheBust?: string,
	): Promise<LoadResult> {
		const { resolved, warnings } = await buildRoutes<C>(dir, buildOptions, cacheBust);
		const registry = new Composer<C>();
		const routes = applyRoutes(registry, resolved);

		const commandDefs = resolved
			.map((r) => r.def)
			.filter((d): d is CommandRouteDef<C> => d.kind === "command");
		const { commands } = await applyCommandsBridge(commandDefs, options, target.api);

		active = registry.toMiddleware();
		return { routes, commands, warnings };
	}

	// the first build behaves like loadRoutes: a hard failure throws out of watchRoutes() itself,
	// so startup misconfiguration is never silently swallowed into a warning nobody reads.
	// note: this must not sit inside `onReload?.(...)`'s argument list — `f?.(x)` short-circuits
	// evaluating `x` at all when `f` is nullish, which would skip the build entirely whenever
	// `onReload` isn't passed.
	const initial = await buildAndSwap(firstBuildOptions);
	options.onReload?.(initial);

	target.use((ctx, next) => {
		if (!active) return next();
		return active(ctx, next);
	});

	const triggerRebuild = debounce(() => {
		version += 1;
		void buildAndSwap(liveBuildOptions, `v=${version}`).then(
			(result) => options.onReload?.(result),
			onError,
		);
	}, options.debounceMs ?? 150);

	const stopWatching = await watchTree(dir, triggerRebuild);

	let disposed = false;
	return async () => {
		if (disposed) return;
		disposed = true;
		stopWatching();
	};
}
