---
"@yaebal/keyboard": minor
---

inline button builders (`text`, `url`, `webApp`, `switchInline`, `copyText`, `pay`, `game`, …) now
take an optional third `deco` argument so you can style a button inline instead of chaining
`.style()` / `.icon()` after it. `deco` is either an object `{ style, icon }` or a string shorthand
`"<customEmojiId>:<style>"` (a bare style like `"primary"` or a bare custom-emoji id also works).
exports the `ButtonStyle` / `ButtonDecoration` types and a `parseButtonDecoration` helper.
