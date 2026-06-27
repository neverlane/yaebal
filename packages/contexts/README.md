# @yaebal/contexts

@yaebal/contexts — a context class per Update type (`MessageContext`,
`CallbackQueryContext`, …), each merging the raw payload fields and exposing
shortcut methods (`reply`, `editText`, `delete`, `answer`, …) that are
AUTO-GENERATED from the Bot API methods + the ids the context carries.
Regenerate with `pnpm --filter @yaebal/contexts generate`.

## install

```sh
pnpm add @yaebal/contexts
```

---

Part of [**yaebal**](https://github.com/neverlane/yaebal) — a type-safe, runtime-agnostic Telegram Bot API framework. MIT.
