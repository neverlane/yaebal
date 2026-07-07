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

/** the `Bot` surface `syncCommands` needs; kept structural so toml doesn't depend on `Bot`. */
interface BotLike {
	onStart(handler: () => unknown): unknown;
	api: { call<T = unknown>(method: string, params?: Record<string, unknown>): Promise<T> };
}

function isBotLike(target: object): target is BotLike {
	const candidate = target as Partial<BotLike>;
	return typeof candidate.onStart === "function" && typeof candidate.api?.call === "function";
}

function replyHandler<C extends Context>(text: string): Middleware<C> {
	return async (ctx) => {
		await ctx.reply(text);
	};
}

/** callback buttons show a spinner until the query is answered, so answer before replying. */
function callbackReplyHandler<C extends Context>(text: string): Middleware<C> {
	return async (ctx) => {
		await ctx.answerCallbackQuery();
		await ctx.reply(text);
	};
}

function resolveHandler<C extends Context>(
	route: TomlRouteResponse,
	kind: string,
	index: number,
	options: InstallTomlOptions<C>,
	makeReply: (text: string) => Middleware<C> = replyHandler,
): Middleware<C> {
	if (route.handler !== undefined) {
		const handler = options.handlers?.[route.handler];

		if (!handler)
			throw new Error(`Missing handler "${route.handler}" referenced in ${kind}[${index}]`);

		return handler;
	}

	if (route.reply !== undefined) return makeReply(route.reply);

	throw new Error(`${kind}[${index}] must define either reply or handler`);
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

function resolveCommandSync(target: object, config: TomlBotConfig): (() => void) | undefined {
	if (!isBotLike(target)) {
		throw new Error(
			"syncCommands requires a Bot target (it registers an onStart hook that calls setMyCommands)",
		);
	}

	const commands: { command: string; description: string }[] = [];

	for (const route of config.commands ?? []) {
		if (route.description !== undefined) {
			commands.push({ command: route.name, description: route.description });
		}
	}

	if (commands.length === 0) return undefined;

	return () => {
		target.onStart(() => target.api.call("setMyCommands", { commands }));
	};
}

/** install toml routes on an existing bot or composer and return the same instance. */
export function installToml<C extends Context, T extends Composer<C>>(
	target: T,
	configPathOrObject: TomlConfigInput,
	options: InstallTomlOptions<C> = {},
): T {
	const config = parseTomlConfig(configPathOrObject);

	// resolve everything before touching the target, so a bad route can't
	// leave it partially configured.
	const registrations: (() => void)[] = [];

	for (const [index, route] of (config.commands ?? []).entries()) {
		const handler = resolveHandler(route, "commands", index, options) as Middleware<
			C & { command: string; args: string[]; payload: string }
		>;

		registrations.push(() => target.command(route.name, handler));
	}

	for (const [index, route] of (config.hears ?? []).entries()) {
		const handler = resolveHandler(route, "hears", index, options) as Middleware<
			C & { match: string | RegExpMatchArray }
		>;
		const trigger = route.regex !== undefined ? new RegExp(route.regex) : (route.text as string);

		registrations.push(() => target.hears(trigger, handler));
	}

	for (const [index, route] of (config.messages ?? []).entries()) {
		const handler = resolveHandler(route, "messages", index, options);

		registrations.push(() => {
			target.on(route.on as FilterQuery, async (ctx, next) => {
				if (!matchesMessageFilters(ctx, route)) return next();

				return handler(ctx as C, next);
			});
		});
	}

	for (const [index, route] of (config.callbacks ?? []).entries()) {
		const handler = resolveHandler(
			route,
			"callbacks",
			index,
			options,
			callbackReplyHandler,
		) as Middleware<C & { match: string | RegExpMatchArray; callbackQuery: CallbackQuery }>;
		const trigger = route.regex !== undefined ? new RegExp(route.regex) : (route.data as string);

		registrations.push(() => target.callbackQuery(trigger, handler));
	}

	if (options.syncCommands) {
		const sync = resolveCommandSync(target, config);
		if (sync) registrations.push(sync);
	}

	for (const register of registrations) register();

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
