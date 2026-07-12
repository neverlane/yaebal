import type { Composer, Context, FilterQuery, Middleware } from "@yaebal/core";
import type { BotCommand, BotCommandScope } from "@yaebal/types";

/** the properties `defineCommand`'s handlers see, mirroring `Composer.command()`'s own additions. */
export interface CommandContext {
	command: string;
	args: string[];
	payload: string;
}

export type CommandHandler<C extends Context> = Middleware<C & CommandContext>;
export type HearsHandler<C extends Context> = Middleware<C & { match: string | RegExpMatchArray }>;

/** menu text: one string for every locale, or per-locale strings with a required `default`. structurally
 * identical to `@yaebal/commands`' `CommandDescription` so the bridge passes it through untouched. */
export type CommandDescription = string | ({ default: string } & Record<string, string>);

/** menu metadata for a `defineCommand` route — all optional, so a bare handler needs none of it. */
export interface CommandMeta {
	/** shown in the bot's `/`-menu. omit to keep the command handled but off every menu. */
	description?: CommandDescription;
	/** attach this command to one `setMyCommands` scope instead of (or in addition to) the default menu. */
	scope?: BotCommandScope;
	/** explicitly exclude from the menu even with a description set (debug/admin commands). */
	hidden?: boolean;
}

/** internal brand — marks a value as produced by a `define*` helper, never constructed by hand. */
export const ROUTE_DEF: unique symbol = Symbol.for("yaebal.router.routeDef");

interface RouteDefBase {
	readonly [ROUTE_DEF]: true;
}

export interface CommandRouteDef<C extends Context = Context> extends RouteDefBase {
	kind: "command";
	names: [string, ...string[]];
	meta: CommandMeta;
	handlers: CommandHandler<C>[];
}

export interface OnRouteDef<C extends Context = Context> extends RouteDefBase {
	kind: "on";
	query: FilterQuery;
	handlers: Middleware<C>[];
}

export interface HearsRouteDef<C extends Context = Context> extends RouteDefBase {
	kind: "hears";
	trigger: string | RegExp;
	handlers: HearsHandler<C>[];
}

export interface UseRouteDef<C extends Context = Context> extends RouteDefBase {
	kind: "use";
	handlers: Middleware<C>[];
}

export interface GuardRouteDef<C extends Context = Context> extends RouteDefBase {
	kind: "guard";
	predicate: (ctx: C) => boolean | Promise<boolean>;
}

/** what a `routes/**` file's default export must be — produced only by a `define*` helper. */
export type RouteDef<C extends Context = Context> =
	| CommandRouteDef<C>
	| OnRouteDef<C>
	| HearsRouteDef<C>
	| UseRouteDef<C>
	| GuardRouteDef<C>;

/** the minimal surface a router needs to register routes — satisfied by `Bot` / `Composer`. */
export interface RouteTarget<C extends Context = Context> {
	command(name: string, ...handlers: Middleware<C & CommandContext>[]): unknown;
	on(query: FilterQuery, ...handlers: Middleware<C>[]): unknown;
	hears(
		trigger: string | RegExp,
		...handlers: Middleware<C & { match: string | RegExpMatchArray }>[]
	): unknown;
	use(...handlers: Middleware<C>[]): unknown;
}

/** extracts a bot/composer's accumulated context type: `ContextOf<typeof bot>`. feeds `createRouter<C>()`
 * so route files see the same `derive`/`decorate` extras the bot itself has. */
export type ContextOf<T> = T extends Composer<infer C> ? C : never;

/** the slice of `@yaebal/commands`' `CommandApi` that menu-sync needs — kept structural so router
 * takes no hard dependency on any particular api client. */
export interface CommandApiLike {
	call<T = unknown>(method: string, params?: Record<string, unknown>): Promise<T>;
}

/**
 * the slice of a `@yaebal/commands` `Commands` registry that the bridge writes into — kept
 * structural so router's dependency on `@yaebal/commands` stays optional at the type level too.
 * router only ever calls `.add(name, description)` with **no handlers**: it wires the actual
 * command handling itself (`target.command(...)`, unconditionally, regardless of these options) —
 * the bridge exists purely to keep the bot's `/`-menu in sync with what `routes/commands/` has.
 * feeding handlers through both `target.command()` and a `Commands.plugin()` install would double
 * -register them, so don't do that; this narrower shape is what keeps it impossible from here.
 */
export interface CommandsRegistryLike<C extends Context = Context> {
	add(
		name: string | string[],
		description: CommandDescription,
		...handlers: CommandHandler<C>[]
	): unknown;
	scoped(scope: BotCommandScope): {
		add(
			name: string | string[],
			description: CommandDescription,
			...handlers: CommandHandler<C>[]
		): unknown;
	};
}

export type RouteKind = "command" | "on" | "hears" | "use";

export interface RegisteredRoute {
	kind: RouteKind;
	/** the registered trigger: command name, filter query, or hears label. */
	trigger: string;
	/** alias command names, for `kind: "command"` with more than one name. */
	aliases?: string[];
	/** the source file this route was loaded from, relative to the routes directory. */
	file: string;
}

export interface RouterWarning {
	message: string;
	file?: string;
}

export interface LoadResult {
	/** every route registered on the target, in registration order. */
	routes: RegisteredRoute[];
	/** menu-visible commands collected from `defineCommand` `meta.description` — ready for `setMyCommands`,
	 * or already handed to `options.commands` / synced via `options.syncCommands`. */
	commands: BotCommand[];
	/** non-fatal issues surfaced instead of thrown — only populated in `{ strict: false }` mode, plus
	 * the always-non-fatal file-name/trigger mismatch notice. */
	warnings: RouterWarning[];
}

export interface LoadOptions<C extends Context = Context> {
	/**
	 * `false` turns validation failures — a default export that isn't a `define*()` value, a route
	 * in the wrong directory (e.g. a `defineOn()` file under `commands/`), a bad update-type or
	 * command name, a duplicate trigger — into `warnings` (the file is skipped, loading continues)
	 * instead of throwing. handy while iterating with {@link watchRoutes}. default `true`.
	 *
	 * one deliberate exception, unaffected by this flag: a broken `_guard.ts` (fails to import, or
	 * doesn't default-export `defineGuard(...)`) always throws — a guard is access control, and
	 * silently downgrading a broken one to "no guard" would be a silent security regression, not a
	 * lint warning.
	 */
	strict?: boolean;
	/** module extensions to import, checked in this order when a trigger has more than one candidate
	 * file. default `[".js", ".mjs", ".cjs", ".ts"]`. */
	extensions?: string[];
	/** feed every `defineCommand` `meta` into this registry (`.add`/`.hidden`/`.scoped`) instead of
	 * building a bare `BotCommand[]` — pass your own `@yaebal/commands` `Commands` instance. */
	commands?: CommandsRegistryLike<C>;
	/** after loading, diff-sync the resulting menu to telegram (`getMyCommands` + `setMyCommands` only
	 * on a mismatch) via the optional `@yaebal/commands` peer dependency. `true` uses `target.api` when
	 * present; pass `{ api }` when the target doesn't carry one (e.g. a bare `Composer` in tests). */
	syncCommands?: boolean | { api: CommandApiLike };
}
