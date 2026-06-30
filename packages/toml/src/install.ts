import type {
	CallbackQuery,
	Composer,
	Context,
	FilterQuery,
	Middleware,
	Plugin,
} from "@yaebal/core";
import { parseTomlConfig } from "./parse.js";
import type {
	InstallTomlOptions,
	TomlBotConfig,
	TomlConfigInput,
	TomlRouteResponse,
} from "./types.js";

type EmptyPluginOutput = Record<never, never>;

function replyHandler<C extends Context>(text: string): Middleware<C> {
	return async (ctx) => {
		await ctx.reply(text);
	};
}

function missingResponseError(kind: string, index: number): Error {
	return new Error(`${kind}[${index}] must define either reply or handler`);
}

function resolveHandler<C extends Context>(
	route: TomlRouteResponse,
	kind: string,
	index: number,
	options: InstallTomlOptions<C>,
): Middleware<C> {
	if (route.handler !== undefined) {
		const handler = options.handlers?.[route.handler];

		if (!handler)
			throw new Error(`Missing handler "${route.handler}" referenced in ${kind}[${index}]`);

		return handler;
	}

	if (route.reply !== undefined) return replyHandler(route.reply);

	throw missingResponseError(kind, index);
}

function assertHandlersExist<C extends Context>(
	config: TomlBotConfig,
	options: InstallTomlOptions<C>,
): void {
	for (const [index, route] of (config.commands ?? []).entries()) {
		if (route.handler !== undefined && !options.handlers?.[route.handler]) {
			throw new Error(`Missing handler "${route.handler}" referenced in commands[${index}]`);
		}
	}

	for (const [index, route] of (config.hears ?? []).entries()) {
		if (route.handler !== undefined && !options.handlers?.[route.handler]) {
			throw new Error(`Missing handler "${route.handler}" referenced in hears[${index}]`);
		}
	}

	for (const [index, route] of (config.messages ?? []).entries()) {
		if (route.handler !== undefined && !options.handlers?.[route.handler]) {
			throw new Error(`Missing handler "${route.handler}" referenced in messages[${index}]`);
		}
	}

	for (const [index, route] of (config.callbacks ?? []).entries()) {
		if (route.handler !== undefined && !options.handlers?.[route.handler]) {
			throw new Error(`Missing handler "${route.handler}" referenced in callbacks[${index}]`);
		}
	}
}

function matchesMessageFilters(
	ctx: Context,
	filters: { contains?: string; equals?: string },
): boolean {
	if (filters.contains === undefined && filters.equals === undefined) return true;

	const text = ctx.text;
	if (text === undefined) return false;
	if (filters.equals !== undefined && text !== filters.equals) return false;
	if (filters.contains !== undefined && !text.includes(filters.contains)) return false;

	return true;
}

/** install toml routes on an existing bot or composer and return the same instance. */
export function installToml<C extends Context, T extends Composer<C>>(
	target: T,
	configPathOrObject: TomlConfigInput,
	options: InstallTomlOptions<C> = {},
): T {
	const config = parseTomlConfig(configPathOrObject);

	assertHandlersExist(config, options);

	for (const [index, route] of (config.commands ?? []).entries()) {
		const handler = resolveHandler(route, "commands", index, options) as Middleware<
			C & { command: string; args: string[] }
		>;

		target.command(route.name, handler);
	}

	for (const [index, route] of (config.hears ?? []).entries()) {
		const handler = resolveHandler(route, "hears", index, options) as Middleware<
			C & { match: string | RegExpMatchArray }
		>;

		target.hears(route.text, handler);
	}

	for (const [index, route] of (config.messages ?? []).entries()) {
		const handler = resolveHandler(route, "messages", index, options);

		target.on(route.on as FilterQuery, async (ctx, next) => {
			if (!matchesMessageFilters(ctx, route)) return next();

			return handler(ctx as C, next);
		});
	}

	for (const [index, route] of (config.callbacks ?? []).entries()) {
		const handler = resolveHandler(route, "callbacks", index, options) as Middleware<
			C & { match: string | RegExpMatchArray; callbackQuery: CallbackQuery }
		>;

		target.callbackQuery(route.data, handler);
	}

	return target;
}

/** create a yaebal plugin that installs toml routes when mounted. */
export function createTomlPlugin<C extends Context = Context>(
	configPathOrObject: TomlConfigInput,
	options: InstallTomlOptions<C> = {},
): Plugin<C, EmptyPluginOutput> {
	return <D extends C>(composer: Composer<D>) =>
		installToml(composer, configPathOrObject, options as InstallTomlOptions<D>);
}
