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
	description?: string;
}

export interface TomlHearRoute extends TomlRouteResponse {
	text: string;
}

export interface TomlMessageRoute extends TomlRouteResponse {
	on: string;
	contains?: string;
	equals?: string;
}

export interface TomlCallbackRoute extends TomlRouteResponse {
	data: string;
}

export type TomlHandler<C extends Context = Context> = Middleware<C>;

export type TomlHandlers<C extends Context = Context> = Record<string, TomlHandler<C>>;

export interface InstallTomlOptions<C extends Context = Context> {
	/** named handlers referenced by `handler = "name"` in toml routes. */
	handlers?: TomlHandlers<C>;
}

export type TomlConfigInput = string | TomlBotConfig | Record<string, unknown>;
