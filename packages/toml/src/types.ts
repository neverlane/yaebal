import type { Context, Middleware } from "@yaebal/core";

export interface TomlBotConfig {
	bot?: {
		name?: string;
	};
	commands?: TomlCommandRoute[];
	hears?: TomlHearRoute[];
	messages?: TomlMessageRoute[];
	callbacks?: TomlCallbackRoute[];
}

export interface TomlRouteResponse {
	reply?: string;
	handler?: string;
}

export interface TomlCommandRoute extends TomlRouteResponse {
	name: string;
	/** shown in the telegram command menu when `syncCommands` is enabled. */
	description?: string;
}

export interface TomlHearRoute extends TomlRouteResponse {
	/** exact text to match. exactly one of `text` or `regex` is required. */
	text?: string;
	/** regular expression source to match against the text. */
	regex?: string;
}

export interface TomlMessageRoute extends TomlRouteResponse {
	on: string;
	contains?: string;
	equals?: string;
}

export interface TomlCallbackRoute extends TomlRouteResponse {
	/** exact callback data to match. exactly one of `data` or `regex` is required. */
	data?: string;
	/** regular expression source to match against the callback data. */
	regex?: string;
}

export type TomlHandler<C extends Context = Context> = Middleware<C>;

export type TomlHandlers<C extends Context = Context> = Record<string, TomlHandler<C>>;

export interface InstallTomlOptions<C extends Context = Context> {
	/** named handlers referenced by `handler = "name"` in toml routes. */
	handlers?: TomlHandlers<C>;
	/**
	 * sync commands that have a `description` to the telegram command menu
	 * (`setMyCommands`) once the bot starts. requires a `Bot` target.
	 */
	syncCommands?: boolean;
}

export type TomlConfigInput = string | TomlBotConfig | Record<string, unknown>;
