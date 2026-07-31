---
"@yaebal/core": minor
---

`Filtered<C, Q>` now narrows the whole query grammar the runtime gates on — any `Message` field
(not just the media ones), bare message-carrying updates (`message`, `edited_message`,
`channel_post`, `business_message`, …) narrow `ctx.message`, and any other bare update type
narrows its `ctx.update` key. queries the runtime can't verify still fall through to `C`
unchanged, so a narrowed field is always one `matchQuery`/`checkField` verified.
