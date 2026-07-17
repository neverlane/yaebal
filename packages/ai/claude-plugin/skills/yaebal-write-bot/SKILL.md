---
name: yaebal-write-bot
description: Use when writing or modifying a Telegram bot built on the yaebal framework — bot setup, handlers, filter queries, commands, and context typing.
---

# writing a yaebal bot

yaebal is a type-safe, ESM-only Telegram Bot API framework. `Bot` extends `Composer`: there is
one middleware engine, and every method that enriches the context returns a composer with an
augmented context type. handlers downstream see everything added before them — no casts, no
`declare module`.

## canonical bot

```typescript
import { createBot, session } from "yaebal";

const bot = createBot(process.env.BOT_TOKEN!)
	.decorate({ version: "1.0.0" })                                  // static, zero per-update cost
	.derive(async (ctx) => ({ user: await loadUser(ctx.from?.id) })) // async, runs per update
	.install(session({ initial: () => ({ count: 0 }) }));            // plugins go through install()

bot.command("start", (ctx) => ctx.reply(`welcome! args: ${ctx.args.join(" ")}`));

bot.on("message:text", (ctx) => {
	ctx.version; // string — from decorate
	ctx.user;    // from derive
	ctx.text;    // string — narrowed by the filter query
	ctx.session.count++;
	return ctx.send(`message #${ctx.session.count}`);
});

bot.onError((error, ctx) => console.error(ctx.update.update_id, error));

await bot.start(); // long polling; resolves only when bot.stop() is called
```

## routing

```typescript
bot.on("message:text", (ctx) => ctx.text);                    // filter queries narrow the context
bot.on("callback_query:data", (ctx) => ctx.callbackQuery.data);
bot.on(":photo", (ctx) => ctx.message?.photo);                // any update kind carrying a photo
bot.command("help", (ctx) => ctx.reply(ctx.payload));         // ctx.command / ctx.args / ctx.payload
bot.hears(/hello/i, (ctx) => ctx.reply("hey")); // text/caption match; ctx.match: string | RegExpMatchArray
```

## context shortcuts & helpers outside the chain

rich contexts (what `createBot` handlers receive) carry generated per-update shortcut methods
with the ids prefilled: `ctx.delete()` (deletes the triggering message; business-chat aware),
`ctx.react(...)`, `ctx.editText(...)`, `ctx.forward(...)`, `ctx.pin(...)` on messages,
`ctx.answer(...)` on callback queries — one scoped method per applicable Bot API call. before
assuming a method does NOT exist, check the plugin docs / `get_api_method` — it usually does.

types flow only *inside* the chain. a helper extracted into its own function must name its
context type — import the per-update class from `"yaebal"`:

```typescript
import type { MessageContext } from "yaebal";

async function eatMessage(ctx: MessageContext) {
	try {
		await ctx.delete();
	} catch {
		/* no rights or older than 48h — fine */
	}
}
```

accumulated handler contexts are structural supertypes of the per-update class, so handlers pass
`ctx` in with no casts. a helper that needs plugin-added fields intersects them:
`function greet(ctx: MessageContext & { session: { count: number } })`.

NEVER type a helper as `ctx: unknown`/`any` and poke it with a structural cast like
`(ctx as { delete?: () => Promise<unknown> }).delete?.()` — the optional call silently no-ops
when the method is missing (wrong update kind), hiding exactly the bugs the named type would
have caught at compile time.

## rules

- import from `"yaebal"` (the batteries-included meta package) in application code; it re-exports
  `@yaebal/core`, contexts, keyboards, session, fmt, i18n, filters, callback-data and web.
- plugins are installed with `bot.install(plugin())` — never `bot.use(plugin())`. `use()` is for
  plain `(ctx, next)` middleware only.
- keep the chain: `derive`/`decorate`/`install`/`guard`/`filter` return an augmented composer.
  assign the result (`const bot = createBot(...).install(...)`) or chain in one expression;
  registering plugins on a discarded return value loses the types.
- `derive` is async and runs per update — use it for the current user, permissions, request
  state. `decorate` is static with zero per-update cost — use it for db clients, config,
  services. don't compute per-request data in `decorate`.
- ESM only: `"type": "module"` in package.json and explicit `.js` extensions on relative
  imports (`import { db } from "./db.js"` — even though the source file is `.ts`).
- no `any`, no `declare module` for context fields — if a handler needs a new context property,
  add it with `derive`/`decorate` or a typed plugin.
- read the token from `process.env.BOT_TOKEN`; never hardcode it.
- register all handlers and plugins before the first `bot.start()` / `bot.handleUpdate()` —
  the middleware chain is frozen on first use.
- `extend(other)` merges another `Composer` (e.g. a feature module) and intersects the two
  context types.
- not every Bot API method has a `bot.api.method` shortcut — fall back to
  `bot.api.call("methodName", params)` when needed.

## learn more

- https://yaebal.mom/docs/getting-started/
- https://yaebal.mom/docs/cheat-sheet/
