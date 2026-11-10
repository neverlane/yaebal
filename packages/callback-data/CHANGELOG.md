# @yaebal/callback-data

## 0.1.2

### patch changes

- 369dbe3: html widgets (bot api 10.4). new `@yaebal/widget`: `widgets()` → `ctx.widget` (json answers, `editMessageWidgetData` / `editSharedWidgetData`, auto-answer, local limit guard), `defineWidget`, revisioned `widgetState`, the in-widget `widgetClient()` runtime (typed queries in the callback-data wire format, state decoding, TON `pay` / `sign`), `tonTransaction` / `toNano`, zlib-exact `measureHtml`, `lintHtml`, `minifyHtml`, `previewPage`. core: `bot.widgetQuery()` routing and `ctx.widgetQuery`, with `ctx.from` / `ctx.chat` filled for widget queries. test: `user.queryWidget()`, `user.querySharedWidget()`, `env.widgetAnswer()`. callback-data: `describe()` exposes a namespace's wire format. contexts: the missing `sendSharedWidget` shortcut. create-yaebal offers the `widget` plugin.

## 0.1.1

### patch changes

- ba1ae27: reject malformed numeric tokens, enum indices, and optional field masks instead of accepting partially parsed values.
