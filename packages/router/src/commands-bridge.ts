import type { Context } from "@yaebal/core";
import type { BotCommand } from "@yaebal/types";
import type {
	CommandApiLike,
	CommandDescription,
	CommandRouteDef,
	CommandsRegistryLike,
	LoadOptions,
} from "./types.js";

/** `{ default: "...", ru: "..." }` → the `default` locale's text. a full `@yaebal/commands`
 * registry localizes properly; this is only the bare (`options.commands` unset) fallback. */
function resolveDescription(description: CommandDescription): string {
	return typeof description === "string" ? description : description.default;
}

/**
 * the bare `BotCommand[]` for the default menu: menu-visible (`meta.description` set, not
 * `meta.hidden`), default-scope (`meta.scope` unset) commands only. scoped or localized menus
 * need `options.commands` / `options.syncCommands` — this is deliberately the simple 80% case.
 */
function buildBotCommandList<C extends Context>(defs: CommandRouteDef<C>[]): BotCommand[] {
	const out: BotCommand[] = [];

	for (const def of defs) {
		if (!def.meta.description || def.meta.hidden || def.meta.scope) continue;
		const [name] = def.names;
		out.push({ command: name, description: resolveDescription(def.meta.description) });
	}

	return out;
}

/** feed every menu-visible command's `(name[, aliases], description[, scope])` into a registry —
 * with **no handlers**: `load.ts` already wired those directly via `target.command(...)`. */
function feedRegistry<C extends Context>(
	registry: CommandsRegistryLike<C>,
	defs: CommandRouteDef<C>[],
): void {
	for (const def of defs) {
		if (!def.meta.description || def.meta.hidden) continue;

		const nameArg = def.names.length > 1 ? def.names : as1(def.names);
		const target = def.meta.scope ? registry.scoped(def.meta.scope) : registry;
		target.add(nameArg, def.meta.description);
	}
}

function as1<T>(names: [T, ...T[]]): T {
	return names[0];
}

async function importCommandsPackage(): Promise<{
	commands: <C extends Context>() => CommandsRegistryLike<C> & {
		sync(api: CommandApiLike): Promise<unknown>;
	};
}> {
	try {
		// biome-ignore lint/suspicious/noExplicitAny: an optional peer dependency — no type-level coupling is possible without making it a hard dependency
		return (await import("@yaebal/commands")) as any;
	} catch (cause) {
		throw new Error(
			"@yaebal/router: options.syncCommands needs the optional @yaebal/commands peer dependency — " +
				"run `pnpm add @yaebal/commands` (or drop syncCommands and use the returned `commands` list " +
				"with your own setMyCommands call).",
			{ cause },
		);
	}
}

export interface CommandsBridgeResult {
	commands: BotCommand[];
}

/**
 * runs `options.commands` / `options.syncCommands`, if either is set, and always returns the
 * bare default-menu `BotCommand[]` for `LoadResult.commands` (built independently of both — see
 * {@link buildBotCommandList}).
 */
export async function applyCommandsBridge<C extends Context>(
	defs: CommandRouteDef<C>[],
	options: Pick<LoadOptions<C>, "commands" | "syncCommands">,
	targetApi?: CommandApiLike,
): Promise<CommandsBridgeResult> {
	if (options.commands) feedRegistry(options.commands, defs);

	if (options.syncCommands) {
		const api = typeof options.syncCommands === "object" ? options.syncCommands.api : targetApi;
		if (!api) {
			throw new Error(
				"@yaebal/router: syncCommands needs an api client — pass { syncCommands: { api } }, " +
					"or call loadRoutes on a target that carries .api (e.g. Bot).",
			);
		}

		const { commands } = await importCommandsPackage();
		const registry = commands<C>();
		feedRegistry(registry, defs);
		await registry.sync(api);
	}

	return { commands: buildBotCommandList(defs) };
}
