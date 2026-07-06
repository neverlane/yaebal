# @yaebal/commands

one registry for command handlers and the telegram `/` command menu — define each command once
(name, menu description, handlers), then wire the handlers with `plugin()` and push the menu with
`register()` / the diff-aware `sync()`. supports localized descriptions, menu scopes, aliases and
hidden commands, and validates names/descriptions at `add()` time.

## install

```sh
pnpm add @yaebal/commands
```

## usage

```ts
import { Bot } from "@yaebal/core";
import { commands } from "@yaebal/commands";

const cmd = commands()
  .add("start", "start the bot", async (ctx) => {
    await ctx.reply(`welcome! args: ${ctx.args.join(", ")}`);
  })
  .add("help", "show help", async (ctx) => {
    await ctx.reply("available commands: /start, /help");
  });

const bot = new Bot(process.env.BOT_TOKEN!).install(cmd.plugin()); // wire the handlers

await cmd.sync(bot.api); // push the / menu — only if it changed

bot.start();
```

### typed context

the registry is generic over your bot's accumulated context — handlers see plugin-added
properties (and `ctx.command` / `ctx.args`) with no casting:

```ts
import type { Context } from "@yaebal/core";

type MyContext = Context & { session: { count: number } };

const cmd = commands<MyContext>().add("count", "count up", async (ctx) => {
  await ctx.reply(`count: ${++ctx.session.count}`);
});

// bot must provide MyContext before install — checked by the compiler
bot.install(session({ initial: () => ({ count: 0 }) })).install(cmd.plugin());
```

### localized descriptions

pass per-locale strings with a required `default`; `register()` / `sync()` push the default menu
plus one menu per locale (missing locales fall back to `default`):

```ts
const cmd = commands()
  .add("start", { default: "start the bot", ru: "запустить бота" }, handler)
  .add("help", { default: "show help", ru: "показать помощь" }, handler);

await cmd.register(bot.api); // pushes the default menu + the ru menu
```

### scopes

`scoped()` returns a view whose commands only show in that scope's menu. scoped menus repeat the
unscoped commands, because telegram *replaces* (not merges) the list for users a scope matches:

```ts
const cmd = commands().add("start", "start the bot", handler);

cmd.scoped({ type: "all_chat_administrators" })
  .add("ban", "ban a user", banHandler)
  .add("unban", "unban a user", unbanHandler);

await cmd.register(bot.api);
// default menu: /start — admins' menu: /start /ban /unban
```

note: scope only affects the *menu*. handlers still run for anyone — guard them yourself (e.g.
with `@yaebal/filters`).

### aliases and hidden commands

```ts
const cmd = commands()
  // ["name", ...aliases] — every name is handled, only the first shows in the menu
  .add(["settings", "prefs"], "open settings", handler)
  // handled but never shown in any menu (debug/admin commands)
  .hidden("debug", async (ctx) => ctx.reply(inspect(ctx)));
```

### menu-only entries

`add()` without handlers puts a command in the menu without registering middleware — useful when
the handler lives elsewhere (a router, a scene):

```ts
const cmd = commands().add("report", "file a report"); // handled by a scenes entry point
```

### sync, register, unregister

- `register(api)` pushes every `(scope, language)` menu unconditionally; pass
  `{ scope, languageCode }` to push a single one.
- `sync(api)` reads each menu with `getMyCommands` first and only pushes the ones that changed —
  safe to run on every deploy. returns `{ pushed, skipped }`.
- `unregister(api)` clears every managed menu via `deleteMyCommands`.
- `menus()` returns everything `register()` would push; `list({ languageCode?, scope? })` returns
  one menu's `{ command, description }[]` — handy for a `/help` text:

```ts
bot.command("help", (ctx) =>
  ctx.reply(cmd.list().map((c) => `/${c.command} — ${c.description}`).join("\n")),
);
```

### validation

`add()` / `hidden()` throw early (instead of a late bot api 400) on: names not matching
`[a-z0-9_]{1,32}`, duplicate names/aliases, empty or >256-char descriptions, non-ISO-639-1 locale
keys, and menus over 100 commands.

---

part of [**yaebal**](https://github.com/neverlane/yaebal) — a type-safe, runtime-agnostic Telegram Bot API framework. MIT.
