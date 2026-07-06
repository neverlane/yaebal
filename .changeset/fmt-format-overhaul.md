---
"@yaebal/types": minor
"@yaebal/core": minor
"@yaebal/fmt": minor
---

formatting overhaul across types/core/fmt.

**@yaebal/types**: new code-generated `formatFields` map — for every Bot API method, where formatted text lives in the params (each `X_entities` paired with its sibling `X`, nested spots included: `reply_parameters.quote`, poll options, media groups, inline results, checklists).

**@yaebal/core**:

- a `format`/`fmt` result is now accepted by *every* api call — the client splits it into text + the right `*_entities` sibling via the schema-generated map (copy-on-write, explicit entities always win). `bot.api.sendMessage({ text: format`…` })` just works.
- helpers nest (`bold(italic("x"))`) and double as tagged templates (`` bold`hi` ``).
- new helpers: `blockquote`, `expandableBlockquote`, `customEmoji`, `dateTime`, `pre(code, language)`, and `join` (keeps entities where `[].join()` drops them, skips empty pieces so no dangling separators).
- unified `Insertable`: `null`/`undefined`/booleans render as empty text, so `${cond && bold("on")}` just works.

**@yaebal/fmt**:

- fixed: an interpolated value containing private-use unicode chars could hijack a later interpolation slot and corrupt the message (slots are now located before splicing and substituted right-to-left; the slot base dodges private-use chars in the template).
- interpolation into attribute values and md link urls (`href="${url}"`, `[x](${url})`) is now substituted textually instead of silently breaking.
- html dialect completed to telegram's full vocabulary: `<pre><code class="language-x">` collapses into one `pre` entity with the language, `<blockquote expandable>`, `<tg-emoji emoji-id>`, `<br>` → newline, unclosed tags auto-close, escape-aware content.
- md dialect redesigned to the conventional meanings: `**bold**`, `*italic*`/`_italic_`, `__underline__` (was italic), `~~strike~~`, `||spoiler||`, `> ` blockquote lines, fences keep the language and drop the trailing newline; single `*`/`_` don't trigger mid-word.
