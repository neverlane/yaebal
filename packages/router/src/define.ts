import {
	Composer,
	type Context,
	type Filtered,
	type FilterQuery,
	type Middleware,
} from "@yaebal/core";
import {
	type CommandHandler,
	type CommandMeta,
	type GuardRouteDef,
	type HearsHandler,
	ROUTE_DEF,
	type RouteDef,
} from "./types.js";

/**
 * define a `commands/<name>.ts` route. `name` may be `[name, ...aliases]` — only the first shows
 * in a menu built from `meta.description`. handlers see `ctx.command`/`ctx.args`/`ctx.payload`,
 * plus whatever `C` carries (bind it once via {@link createRouter}). with no handlers the command
 * still contributes to the menu (via `meta.description`) but registers nothing on the bot —
 * useful when another route (or `@yaebal/commands`) owns the actual handling.
 */
export function defineCommand<C extends Context = Context>(
	name: string | [string, ...string[]],
	...handlers: CommandHandler<C>[]
): RouteDef<C>;
export function defineCommand<C extends Context = Context>(
	name: string | [string, ...string[]],
	meta: CommandMeta,
	...handlers: CommandHandler<C>[]
): RouteDef<C>;
export function defineCommand<C extends Context = Context>(
	name: string | [string, ...string[]],
	metaOrHandler?: CommandMeta | CommandHandler<C>,
	...rest: CommandHandler<C>[]
): RouteDef<C> {
	const names = Array.isArray(name) ? name : [name];
	const [first, ...aliases] = names;
	if (!first) throw new TypeError("@yaebal/router: defineCommand() needs at least one name");

	const hasMeta = metaOrHandler !== undefined && typeof metaOrHandler !== "function";
	const meta = hasMeta ? (metaOrHandler as CommandMeta) : {};
	const handlers = hasMeta
		? rest
		: metaOrHandler === undefined
			? rest
			: [metaOrHandler as CommandHandler<C>, ...rest];

	return { [ROUTE_DEF]: true, kind: "command", names: [first, ...aliases], meta, handlers };
}

/**
 * define an `on/<query>.ts` route (dots in the filename become `:` — see `loadRoutes`). `Q` is
 * checked against `FilterQuery` at compile time, and handlers see `ctx` narrowed exactly like
 * `Composer.on(query, ...)` would narrow it (`ctx.text`, `ctx.callbackQuery`, …).
 */
export function defineOn<Q extends FilterQuery, C extends Context = Context>(
	query: Q,
	...handlers: Middleware<Filtered<C, Q>>[]
): RouteDef<C> {
	return {
		[ROUTE_DEF]: true,
		kind: "on",
		query,
		handlers: handlers as unknown as Middleware<C>[],
	};
}

/** define an `hears/<label>.ts` route — the filename is purely organizational; `trigger` (string or
 * regex) is what actually matches. handlers see `ctx.match`, exactly like `Composer.hears()`. */
export function defineHears<C extends Context = Context>(
	trigger: string | RegExp,
	...handlers: HearsHandler<C>[]
): RouteDef<C> {
	return { [ROUTE_DEF]: true, kind: "hears", trigger, handlers };
}

/**
 * define a `use/<name>.ts` feature file — a standalone `Composer` (or bare middleware), mounted
 * on the bot in file order. this is the escape hatch for anything the other four kinds don't fit:
 * multiple handlers of different kinds in one file, `derive`/`decorate` scoped to a subtree, etc.
 */
export function defineUse<C extends Context = Context>(
	...items: Array<Composer<C> | Middleware<C>>
): RouteDef<C> {
	const handlers = items.map((item) => (item instanceof Composer ? item.toMiddleware() : item));
	return { [ROUTE_DEF]: true, kind: "use", handlers };
}

/**
 * define a `_guard.ts` file. its predicate gates every route in the same directory and its
 * subdirectories (across all of `commands/`, `on/`, `hears/`, `use/`): a route only runs once every
 * guard from its directory up to the kind root has passed, evaluated outermost-first. a failing
 * guard stops the update the same way `Composer.guard()` does — nothing after it runs.
 */
export function defineGuard<C extends Context = Context>(
	predicate: (ctx: C) => boolean | Promise<boolean>,
): GuardRouteDef<C> {
	return { [ROUTE_DEF]: true, kind: "guard", predicate };
}

/** bound overload set `createRouter` hands back — both `defineCommand` shapes, specialized to `C`. */
export interface BoundDefineCommand<C extends Context> {
	(name: string | [string, ...string[]], ...handlers: CommandHandler<C>[]): RouteDef<C>;
	(
		name: string | [string, ...string[]],
		meta: CommandMeta,
		...handlers: CommandHandler<C>[]
	): RouteDef<C>;
}

export interface RouterHelpers<C extends Context> {
	defineCommand: BoundDefineCommand<C>;
	defineOn: <Q extends FilterQuery>(
		query: Q,
		...handlers: Middleware<Filtered<C, Q>>[]
	) => RouteDef<C>;
	defineHears: (trigger: string | RegExp, ...handlers: HearsHandler<C>[]) => RouteDef<C>;
	defineUse: (...items: Array<Composer<C> | Middleware<C>>) => RouteDef<C>;
	defineGuard: (predicate: (ctx: C) => boolean | Promise<boolean>) => GuardRouteDef<C>;
}

/**
 * bind every `define*` helper to one context type, so route files loaded under it see the bot's
 * own `derive`/`decorate` extras instead of the bare `Context`:
 *
 * ```ts
 * // router.ts
 * export const { defineCommand, defineOn } = createRouter<ContextOf<typeof bot>>();
 * ```
 *
 * the returned helpers are the same runtime functions as the top-level `define*` exports — this
 * only re-specializes their type, so route files can `import { defineCommand } from "../router.js"`
 * instead of the bare package and get full narrowing with zero per-call generics.
 */
export function createRouter<C extends Context = Context>(): RouterHelpers<C> {
	return {
		defineCommand: defineCommand as BoundDefineCommand<C>,
		defineOn: defineOn as RouterHelpers<C>["defineOn"],
		defineHears: defineHears as RouterHelpers<C>["defineHears"],
		defineUse: defineUse as RouterHelpers<C>["defineUse"],
		defineGuard: defineGuard as RouterHelpers<C>["defineGuard"],
	};
}
