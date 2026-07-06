# @yaebal/toml

declarative toml routes for yaebal bots.

status: experimental.

## installation

```sh
pnpm add @yaebal/toml
```

## what it is

`@yaebal/toml` lets small bots describe commands, text routes, message filters, callback queries, and simple replies in toml. typescript stays available for real logic through a handler registry.

## bot.toml

```toml
[[commands]]
name = "start"
description = "say hello"
reply = "привет! я бот из toml."

[[commands]]
name = "ping"
description = "check the bot is alive"
handler = "ping"

[[hears]]
regex = "^p[io]ng$"
reply = "pong"

[[messages]]
on = "message:text"
contains = "yaebal"
reply = "yaebal мощь"

[[callbacks]]
data = "profile"
handler = "profileCallback"
```

every route needs `reply = "..."` or `handler = "name"`. `hears` takes exactly one of `text`
(exact match) or `regex`; `callbacks` takes exactly one of `data` or `regex`. `messages` filters
by an `on` filter query (validated against the real update names at install time) plus optional
`contains` / `equals` text filters.

## index.ts

```ts
import { Bot } from "@yaebal/core";
import { installToml } from "@yaebal/toml";

const bot = new Bot(process.env.BOT_TOKEN!);

installToml(bot, "./bot.toml", {
	syncCommands: true,
	handlers: {
		ping: async (ctx) => {
			await ctx.reply("pong from typescript");
		},
		profileCallback: async (ctx) => {
			await ctx.reply("profile");
		},
	},
});

await bot.start();
```

`installToml` accepts a file path, a raw toml string, or an already parsed object, and returns the
same bot or composer instance. the whole config is validated before any route is registered, so a
bad config can never leave the bot half-wired.

## command menu

with `syncCommands: true`, commands that have a `description` are pushed to the telegram command
menu (`setMyCommands`) once the bot starts. commands without a description are still routed — they
just stay out of the menu. `syncCommands` needs a `Bot` target (it hooks `onStart`); installing on
a plain `Composer` fails with a readable error.

## handler registry

when a route uses `handler = "name"`, the name must exist in `options.handlers`. if a handler is
missing, install fails before any route is registered:

```txt
Missing handler "ping" referenced in commands[1]
```

if both `handler` and `reply` are present, the handler wins. the reply is only used when no
handler is configured.

callback routes that use `reply` also answer the callback query first, so the button never hangs
on a spinner. handler-based callback routes answer it themselves (`ctx.answerCallbackQuery()`).

## plugin usage

```ts
import { createTomlPlugin } from "@yaebal/toml";

bot.install(createTomlPlugin("./bot.toml", { handlers }));
```

## limitations

toml does not replace typescript logic. it only describes routes and simple replies. use the handler registry for validation, database calls, external services, branching flows, and anything that needs compile-time types.

---

part of [**yaebal**](https://github.com/neverlane/yaebal) — a type-safe, runtime-agnostic Telegram Bot API framework. MIT.
