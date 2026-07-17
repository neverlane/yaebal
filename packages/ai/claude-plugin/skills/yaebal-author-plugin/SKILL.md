---
name: yaebal-author-plugin
description: Use when writing a custom yaebal plugin — the Plugin<In, Out> contract, derive vs decorate, and typed plugin dependencies.
---

# authoring a yaebal plugin

a plugin is a function that receives a composer and returns it with an enriched context type:

```typescript
export type Plugin<In extends Context = Context, Out extends object = Record<never, never>> = <
	C extends In,
>(composer: Composer<C>) => Composer<C & Out>;
```

`In` is what the plugin requires on the context, `Out` is what it adds. users wire it with
`bot.install(myPlugin(options))`.

## canonical plugin

```typescript
import type { Context, Plugin } from "@yaebal/core";

/** options are always an exported interface. */
export interface GreeterOptions {
	greeting?: string;
}

/** the context fields this plugin adds — exported so users can type helpers around it. */
export interface GreeterControl {
	greet(): Promise<unknown>;
}

export function greeter(options: GreeterOptions = {}): Plugin<Context, GreeterControl> {
	const greeting = options.greeting ?? "hi"; // static setup runs once, here

	return (composer) =>
		composer.derive((ctx) => ({
			greet: () => ctx.send(`${greeting}, ${ctx.from?.first_name ?? "there"}!`),
		}));
}
```

## derive vs decorate — pick deliberately

- `composer.derive(fn)` — `fn` runs on **every update** (may be async). use it for anything
  computed from `ctx`: the current user, per-request state, api wrappers bound to the update.
- `composer.decorate(value)` — attached **once**, zero per-update cost. use it for services,
  clients, config, constants. never do per-request work in `decorate`.
- plain cross-cutting middleware (run something around `next()`) goes through
  `composer.use(async (ctx, next) => { ...; await next(); })` inside the plugin.

## typed dependencies — the `In` parameter

a plugin that needs another plugin's context declares it in `In`. install order is then
type-checked; never rely on implicit ordering or runtime probing:

```typescript
import type { Context, Plugin } from "@yaebal/core";

interface Deps {
	session: { visits: number };
}

export function visitBadge(): Plugin<Context & Deps, { badge: string }> {
	return (composer) =>
		composer.derive((ctx) => ({ badge: `visit #${ctx.session.visits}` }));
}

bot.install(visitBadge());                                              // ❌ compile error: no session
bot.install(session({ initial: () => ({ visits: 0 }) })).install(visitBadge()); // ✅
```

## rules

- the plugin must chain on **and return** the composer it was given — `install()` throws at
  runtime if you return a different composer (its middleware would silently detach).
- export the options interface and the added-context (`Out`) interface from the package entry.
- a plugin that adds nothing to the context uses `Plugin<Context, Record<never, never>>`
  (e.g. a pure guard/drop plugin) — `Out` is never `any`.
- keep per-instance state (maps, caches) in the factory closure, not module scope, so two
  installs don't share state accidentally.
- for persistence, accept a `StorageAdapter` from `@yaebal/sklad` as an option instead of
  binding to a specific database.

## learn more

- https://yaebal.mom/docs/plugins/authoring/
