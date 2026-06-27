# @yaebal/filters

Composable, type-narrowing update filters for `composer.filter(...)`. A filter is a type guard that may also attach data to the context; combine them with `and` / `or` / `not`.

## install

```sh
pnpm add @yaebal/filters
```

## usage

```ts
import { and, command, isPrivate, mediaType, or, regex } from "@yaebal/filters";

// command filter: exposes ctx.command and ctx.args
bot.filter(command("buy"), (ctx) => ctx.reply(`args: ${ctx.args.join(", ")}`));

// regex filter: exposes ctx.match
bot.filter(regex(/^\d+$/), (ctx) => ctx.reply(`number: ${ctx.match[0]}`));

// combinators
bot.filter(and(isPrivate, command("secret")), (ctx) => ctx.reply("shhh"));

bot.filter(
  or(mediaType("photo"), mediaType("video")),
  (ctx) => ctx.reply("got media"),
);
```
