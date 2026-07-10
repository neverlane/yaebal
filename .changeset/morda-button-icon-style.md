---
"@yaebal/morda": minor
---

dialog buttons now forward `icon` (custom-emoji id) and `style` (`"danger" | "success" | "primary"`)
to the inline keyboard — previously these fields were silently dropped when the keyboard was built.
every button helper accepts them: in the options object for `button` / `switchInline`, or as a
trailing `{ icon, style }` argument on `switchTo`, `back`, `cancel`, `url`, `webApp`, and `copy`.
