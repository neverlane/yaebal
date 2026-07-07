# @yaebal/filters

composable, type-narrowing update filters (the mtcute idea, made two-phase) for `composer.filter(...)`. a filter is a predicate — sync or async — that may *stage* typed data; it lands on the context only after the whole filter tree matches, so a failing branch can never leak or corrupt anything. combine with `and` / `or` / `not` — additions flow through, for any number of filters.

## install

```sh
pnpm add @yaebal/filters
```

## usage

```ts
import { and, or, command, regex, deeplink, isPrivate, photo, video } from "@yaebal/filters";

// command filter: ctx.command, ctx.args, ctx.payload — same routing rules as bot.command()
bot.filter(and(isPrivate, command("buy")), (ctx) => ctx.reply(`args: ${ctx.args.join(", ")}`));

// regex filter: ctx.match
bot.filter(regex(/^\d+$/), (ctx) => ctx.reply(`number: ${ctx.match[0]}`));

// deep links: t.me/bot?start=ref_42
bot.filter(deeplink(/^ref_(\d+)$/), (ctx) => ctx.reply(`referred by ${ctx.match[1]}`));

// media shorthands narrow ctx.message
bot.filter(or(photo, video), (ctx) => ctx.reply("got media"));

// any bare predicate is a filter — async included
bot.filter(async (ctx) => await isAllowed(ctx.from?.id), handler);
```

## the catalog

- **text** — `text`, `equals`, `contains`, `startsWith`, `endsWith` (all with `{ ignoreCase }`), `regex`
- **commands** — `command(name?, { prefixes, caseSensitive })` with string / array / regex names, `start`, `startGroup`, `deeplink`
- **who / where** — `chatType`, `isPrivate`, `isGroup`, `isChannel`, `isForum`, `chatId`, `fromUser` (ids or `@usernames`, on every update kind that carries them), `fromBot`, `isPremium`
- **message shape** — `media`, `mediaType`, shorthands (`photo`, `video`, `audio`, `voice`, `sticker`, `document`, `animation`, `videoNote`, `paidMedia`, `story`), payloads (`location`, `contact`, `venue`, `poll`, `dice`, `game`, `invoice`, `successfulPayment`), `reply`, `forward`, `forwardOrigin`, `viaBot`, `hasEntity` (text *and* captions), `service`, `newChatMembers`, `leftChatMember`, `pinnedMessage`
- **other updates** — `callbackData`, `inlineQuery`, `edited`, `chatMemberStatus`
- **combinators** — `and` (additions intersect; later members see earlier stages), `or` (additions unite; failed branches leave nothing behind), `not`
- **authoring** — `defineFilter` for custom filters that stage typed data

everything is also under one namespace, mtcute-style: `import { filters } from "@yaebal/filters"` → `filters.command(...)`.

## custom filters

```ts
import { defineFilter } from "@yaebal/filters";

const vip = defineFilter<{ profile: Profile }>(async (ctx, bag) => {
  const profile = await db.profile(ctx.from?.id);
  if (!profile?.vip) return false;
  bag.profile = profile; // staged — committed onto ctx only on a full match
  return true;
});

bot.filter(and(vip, command("redeem")), (ctx) => ctx.profile /* typed */);
```

---

part of [**yaebal**](https://github.com/neverlane/yaebal) — a type-safe, runtime-agnostic Telegram Bot API framework. MIT.
