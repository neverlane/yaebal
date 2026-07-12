/**
 * @yaebal/router — file-based routing. load `commands/`, `on/`, `hears/`, and `use/` handlers
 * from a routes directory by convention, typed end to end via `define*()` helpers.
 */

export type { BoundDefineCommand, RouterHelpers } from "./define.js";
export {
	createRouter,
	defineCommand,
	defineGuard,
	defineHears,
	defineOn,
	defineUse,
} from "./define.js";
export { DEFAULT_EXTENSIONS, loadRoutes } from "./load.js";
export type {
	CommandApiLike,
	CommandContext,
	CommandDescription,
	CommandHandler,
	CommandMeta,
	CommandRouteDef,
	CommandsRegistryLike,
	ContextOf,
	GuardRouteDef,
	HearsHandler,
	HearsRouteDef,
	LoadOptions,
	LoadResult,
	OnRouteDef,
	RegisteredRoute,
	RouteDef,
	RouteKind,
	RouterWarning,
	RouteTarget,
	UseRouteDef,
} from "./types.js";
export type { WatchOptions } from "./watch.js";
export { watchRoutes } from "./watch.js";
