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
[bot]
name = "demo"

[[commands]]
name = "start"
description = "start command"
reply = "привет! я бот из toml."

[[commands]]
name = "ping"
handler = "ping"

[[hears]]
text = "ping"
reply = "pong"

[[messages]]
on = "message:text"
contains = "yaebal"
reply = "yaebal мощь"

[[callbacks]]
data = "profile"
handler = "profileCallback"
```

## index.ts

```ts
import { Bot } from "@yaebal/core";
import { installToml } from "@yaebal/toml";

const bot = new Bot(process.env.BOT_TOKEN!);

installToml(bot, "./bot.toml", {
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

## handler registry

when a route uses `handler = "name"`, the name must exist in `options.handlers`. if a handler is missing, install fails before routes are registered:

```txt
Missing handler "ping" referenced in commands[1]
```

if both `handler` and `reply` are present, the handler wins. the reply is only used when no handler is configured.

## plugin usage

```ts
import { createTomlPlugin } from "@yaebal/toml";

bot.install(createTomlPlugin("./bot.toml", { handlers }));
```

## limitations

toml does not replace typescript logic. it only describes routes and simple replies. use the handler registry for validation, database calls, external services, branching flows, and anything that needs compile-time types.

---

part of [**yaebal**](https://github.com/neverlane/yaebal) — a type-safe, runtime-agnostic telegram bot api framework. mit.
