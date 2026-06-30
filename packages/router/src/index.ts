import { readdir } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import { pathToFileURL } from "node:url";
import type { Context, FilterQuery, Middleware } from "@yaebal/core";

type Handler = Middleware<Context>;

/** the minimal surface a router needs — satisfied by `Bot` / `Composer`. */
export interface RouteTarget {
	command(name: string, ...handlers: Handler[]): unknown;
	on(query: FilterQuery, ...handlers: Handler[]): unknown;
}

/**
 * map a route file to its registration. `commands/start.ts` → `command("start")`;
 * `on/message.text.ts` → `on("message:text")` (dots become `:`, since `:` is not
 * a legal filename character on every OS). pure — exported for testing.
 */
export function routeFromFile(
	kind: "commands" | "on",
	file: string,
): { method: "command" | "on"; trigger: string } {
	const name = basename(file, extname(file));

	return kind === "commands"
		? { method: "command", trigger: name }
		: { method: "on", trigger: name.replaceAll(".", ":") };
}

async function listModules(dir: string): Promise<string[]> {
	let entries: string[];

	try {
		entries = await readdir(dir);
	} catch {
		return []; // directory absent → nothing to load
	}

	return entries.filter(
		(f) => (f.endsWith(".js") || f.endsWith(".ts") || f.endsWith(".mjs")) && !f.endsWith(".d.ts"),
	);
}

async function importDefault(file: string): Promise<Handler | undefined> {
	const mod = (await import(pathToFileURL(file).href)) as { default?: Handler };
	return mod.default;
}

/**
 * load handlers from a routes directory and register them on `bot`:
 * `<dir>/commands/<name>.js` and `<dir>/on/<query>.js`, each `export default`ing
 * a handler. returns the list of registered routes (handy for a startup log).
 */
export async function loadRoutes(bot: RouteTarget, dir: string): Promise<string[]> {
	const registered: string[] = [];

	for (const file of await listModules(join(dir, "commands"))) {
		const handler = await importDefault(join(dir, "commands", file));
		if (!handler) continue;

		const { trigger } = routeFromFile("commands", file);
		bot.command(trigger, handler);

		registered.push(`command:${trigger}`);
	}

	for (const file of await listModules(join(dir, "on"))) {
		const handler = await importDefault(join(dir, "on", file));
		if (!handler) continue;

		const { trigger } = routeFromFile("on", file);
		bot.on(trigger as FilterQuery, handler);

		registered.push(`on:${trigger}`);
	}

	return registered;
}
