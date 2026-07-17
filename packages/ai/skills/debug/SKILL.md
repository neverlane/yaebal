---
name: yaebal-debug
description: Use when a yaebal bot fails to compile, start, or respond — install-order type errors, ESM specifier errors, Telegram 400/409/429 responses.
---

# troubleshooting a yaebal bot

## typescript: "property 'session' does not exist on type …" (install order)

plugin dependencies are typed via `Plugin<In, Out>` — installing a plugin before what it
requires is a **compile error**, not a runtime surprise. fix the order, and keep the chain:

```typescript
bot.install(auth());                                 // ❌ auth needs ctx.session
bot.install(session({ initial })).install(auth());   // ✅ dependency first
```

the same error appears when the augmented composer was discarded — `derive`/`decorate`/
`install` **return** the enriched type; assign or chain the result, don't call them as
fire-and-forget statements on separate lines.

## esm: "relative import paths need explicit file extensions" / ERR_MODULE_NOT_FOUND

yaebal projects are ESM (`"type": "module"`, `moduleResolution: NodeNext`). every relative
import needs an explicit `.js` extension — even from `.ts` source:

```typescript
import { db } from "./db";     // ❌ TS2835 / ERR_MODULE_NOT_FOUND at runtime
import { db } from "./db.js";  // ✅
```

## 400: "can't parse entities" (parse_mode errors)

hand-written `parse_mode: "MarkdownV2"` strings 400 on any unescaped `. - ! ( )` etc. don't
escape by hand — send entities instead via `@yaebal/fmt` (re-exported from `"yaebal"`):

```typescript
import { html, md } from "yaebal";

await ctx.send(html`<b>hello</b>, ${ctx.from?.first_name}!`); // interpolation auto-escaped
await ctx.send(md`**bold** and _italic_ — no parse_mode, no escaping`);
```

## 409: "terminated by other getUpdates request"

two consumers are fighting over one token: a second polling instance (dev shell + deployed
bot), or polling while a webhook is registered. stop the other instance, or clear the
webhook: `deleteWebhook(bot, { dropPendingUpdates: true })` from `@yaebal/web`. one token,
one transport, one process.

## 429: "too many requests" (rate limits)

telegram returns `retry_after` in the error's `parameters`. errors are `TelegramError` from
`@yaebal/core` with `.code` and `.parameters`. fixes, outermost first:

```typescript
import { autoRetry } from "@yaebal/again";
import { throttle } from "@yaebal/throttle";

autoRetry(bot.api, { maxRetries: 5 });        // await retry_after, re-run the call
bot.install(throttle({ globalPerSec: 30 }));  // don't hit the limit in the first place
```

for mass sends, use `@yaebal/broadcast` (built-in pacing) instead of a bare loop.

## bot doesn't respond at all

- handler registered after the first `bot.start()`/`handleUpdate()`? the chain freezes on
  first use — register everything before starting.
- update type not delivered? if `allowedUpdates` was set (or a previous `setWebhook` set
  `allowed_updates`), unlisted update types are silently dropped.
- webhook mode: check `getWebhookInfo(bot)` from `@yaebal/web` — `pending_update_count` and
  `last_error_message` say exactly what telegram sees.
- a filter query like `on("message:text")` doesn't match photos/captions — check the query.
- inline buttons stuck on a spinner: the handler never called `ctx.answerCallbackQuery()`.

## where to look

- https://yaebal.mom/docs/troubleshooting/ — the full symptom → fix catalog
- https://yaebal.mom/docs/api/ — per-method reference (params, error cases) for every Bot API
  method and type
- `bot.onError((error, ctx) => …)` — log `ctx.update` alongside the error; the update that
  broke the handler is the fastest repro.
