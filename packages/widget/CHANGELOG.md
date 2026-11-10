# @yaebal/widget

## 0.1.0

### minor changes

- 369dbe3: html widgets (bot api 10.4). new `@yaebal/widget`: `widgets()` → `ctx.widget` (json answers, `editMessageWidgetData` / `editSharedWidgetData`, auto-answer, local limit guard), `defineWidget`, revisioned `widgetState`, the in-widget `widgetClient()` runtime (typed queries in the callback-data wire format, state decoding, TON `pay` / `sign`), `tonTransaction` / `toNano`, zlib-exact `measureHtml`, `lintHtml`, `minifyHtml`, `previewPage`. core: `bot.widgetQuery()` routing and `ctx.widgetQuery`, with `ctx.from` / `ctx.chat` filled for widget queries. test: `user.queryWidget()`, `user.querySharedWidget()`, `env.widgetAnswer()`. callback-data: `describe()` exposes a namespace's wire format. contexts: the missing `sendSharedWidget` shortcut. create-yaebal offers the `widget` plugin.

### patch changes

- updated dependencies [aee2b65]
- updated dependencies [369dbe3]
  - @yaebal/core@0.4.5
