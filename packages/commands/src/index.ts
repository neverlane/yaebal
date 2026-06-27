import type { Context, Middleware, Plugin } from "@yaebal/core";

export interface BotCommand {
	command: string;
	description: string;
}

interface CommandApi {
	call<T = unknown>(method: string, params?: Record<string, unknown>): Promise<T>;
}

export interface CommandsRegistry {
	/** Define a command: its name, menu description, and handler(s). */
	add(name: string, description: string, ...handlers: Middleware<Context>[]): CommandsRegistry;
	/** The `{ command, description }[]` for `setMyCommands`. */
	list(): BotCommand[];
	/** A plugin that registers every command's handler on the bot. */
	plugin(): Plugin<Context, Record<never, never>>;
	/** Push the command list to Telegram (so they show in the `/` menu). */
	register(api: CommandApi, options?: { languageCode?: string }): Promise<unknown>;
}

/**
 * A single source of truth for commands: name + menu description + handler.
 * `bot.install(cmd.plugin())` wires the handlers; `cmd.register(bot.api)` pushes
 * the menu to Telegram.
 */
export function commands(): CommandsRegistry {
	const defs: Array<{ name: string; description: string; handlers: Middleware<Context>[] }> = [];

	const registry: CommandsRegistry = {
		add(name, description, ...handlers) {
			defs.push({ name, description, handlers });
			return registry;
		},
		list() {
			return defs.map((d) => ({ command: d.name, description: d.description }));
		},
		plugin() {
			return (composer) => {
				for (const d of defs) composer.command(d.name, ...d.handlers);
				return composer;
			};
		},
		register(api, options) {
			return api.call("setMyCommands", {
				commands: registry.list(),
				...(options?.languageCode ? { language_code: options.languageCode } : {}),
			});
		},
	};
	return registry;
}
