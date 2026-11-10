# @yaebal/test

## 1.0.5

### patch changes

- 369dbe3: html widgets (bot api 10.4). new `@yaebal/widget`: `widgets()` → `ctx.widget` (json answers, `editMessageWidgetData` / `editSharedWidgetData`, auto-answer, local limit guard), `defineWidget`, revisioned `widgetState`, the in-widget `widgetClient()` runtime (typed queries in the callback-data wire format, state decoding, TON `pay` / `sign`), `tonTransaction` / `toNano`, zlib-exact `measureHtml`, `lintHtml`, `minifyHtml`, `previewPage`. core: `bot.widgetQuery()` routing and `ctx.widgetQuery`, with `ctx.from` / `ctx.chat` filled for widget queries. test: `user.queryWidget()`, `user.querySharedWidget()`, `env.widgetAnswer()`. callback-data: `describe()` exposes a namespace's wire format. contexts: the missing `sendSharedWidget` shortcut. create-yaebal offers the `widget` plugin.
- updated dependencies [aee2b65]
- updated dependencies [369dbe3]
  - @yaebal/core@0.4.5

## 1.0.4

### patch changes

- updated dependencies [d9e233a]
  - @yaebal/core@0.4.4

## 1.0.3

### patch changes

- fixes from a full audit. test: createTestEnv builds contexts with the bot's own factory (rich ctx.answer/editText work in tests) and records format results split like the real client. router: watchRoutes no longer loops on macos or leaks watchers. runner: calls bot.init(), logs poll failures by default with backoff, uses bot.allowedUpdates() and confirms the last batch on stop. web: dedupe lets a failed update's redelivery run, node adapters cap raw bodies, setWebhook falls back to bot.allowedUpdates(). throttle/ratelimiter: idle buckets and windows are swept. again: a 429 whose retry_after exceeds maxDelayMs is thrown instead of retried early. conversation: form.int rejects blank answers. analytics, audit-log, cache, cron, payments (declines always carry error_message, subscription invoices refuse sendInvoice), preview, sklad, state-machine, toml, feature-flags (rollouts follow a custom bucketKey, non-boolean overrides rejected): race, leak and prototype-key fixes.
- updated dependencies
  - @yaebal/core@0.4.3

## 1.0.2

### patch changes

- updated dependencies [46920ed]
- updated dependencies [1ebbb05]
  - @yaebal/core@0.4.2

## 1.0.1

### patch changes

- updated dependencies [d3179c9]
- updated dependencies [fb30143]
- updated dependencies [a742af7]
  - @yaebal/core@0.4.1

## 1.0.0

### patch changes

- updated dependencies [475e1ed]
- updated dependencies [24f5037]
  - @yaebal/core@0.4.0
