# @yaebal/router

file-based routing for yaebal bots — load `commands/`, `on/`, `hears/`, and `use/` handlers from
a `routes/` directory by convention, typed end to end via `define*()` helpers.

```ts
// routes/commands/start.ts
export default defineCommand("start", { description: "start the bot" }, async (ctx) => {
	await ctx.reply("welcome!");
});
```

```ts
// bot.ts
import { loadRoutes } from "@yaebal/router";

const result = await loadRoutes(bot, new URL("./routes", import.meta.url).pathname);
console.log(result.routes.map((r) => `${r.kind}:${r.trigger}`));
```

route files never `export default` a bare handler — they export a `defineCommand()` /
`defineOn()` / `defineHears()` / `defineUse()` value, so `loadRoutes` can validate the trigger
(a typo'd update type or an invalid command name throws at load time, with a "did you mean"
where it can help) instead of silently registering a handler nothing will ever call.

nested directories are guardable (`commands/admin/_guard.ts`) and `watchRoutes()` gives you dev
hot-reload with no bot restart. see the [full docs](https://yaebal.dev/docs/plugins/router) for
the directory convention, validation rules, the optional `@yaebal/commands` menu bridge, and the
watch-mode API.

## install

```sh
pnpm add @yaebal/router
```

---

part of [**yaebal**](https://github.com/neverlane/yaebal) — a type-safe, runtime-agnostic Telegram Bot API framework. MIT.
