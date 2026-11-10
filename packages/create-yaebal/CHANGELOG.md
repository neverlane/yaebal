# create-yaebal

## 0.5.0

### minor changes

- 369dbe3: html widgets (bot api 10.4). new `@yaebal/widget`: `widgets()` → `ctx.widget` (json answers, `editMessageWidgetData` / `editSharedWidgetData`, auto-answer, local limit guard), `defineWidget`, revisioned `widgetState`, the in-widget `widgetClient()` runtime (typed queries in the callback-data wire format, state decoding, TON `pay` / `sign`), `tonTransaction` / `toNano`, zlib-exact `measureHtml`, `lintHtml`, `minifyHtml`, `previewPage`. core: `bot.widgetQuery()` routing and `ctx.widgetQuery`, with `ctx.from` / `ctx.chat` filled for widget queries. test: `user.queryWidget()`, `user.querySharedWidget()`, `env.widgetAnswer()`. callback-data: `describe()` exposes a namespace's wire format. contexts: the missing `sendSharedWidget` shortcut. create-yaebal offers the `widget` plugin.

### patch changes

- updated dependencies [aee2b65]
  - @yaebal/ai@0.2.2

## 0.4.1

### patch changes

- @yaebal/ai@0.2.1

## 0.4.0

### minor changes

- file-id: InlineMessageId decodes inline_message_id strings (dc, message id, owner). keyboard: pattern([1, 2, 1]) lays buttons out by row sizes. create-yaebal: generated node/deno bots load .env (generated node projects now need node >= 22.9), deploy configs get valid app names for scoped/dotted names, --json keeps stdout clean, a signal-killed child counts as a failure, and the catalog offers @yaebal/otel and @yaebal/sentry.

### patch changes

- updated dependencies
  - @yaebal/ai@0.2.0

## 0.3.4

### patch changes

- updated dependencies [32091fb]
  - @yaebal/ai@0.1.0

## 0.3.3

### patch changes

- updated dependencies [b50fc35]
  - @yaebal/ai@0.0.5

## 0.3.2

### patch changes

- c814dbf: add `@yaebal/hydrate` to the plugin catalog.
  - @yaebal/ai@0.0.4
