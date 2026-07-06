# @yaebal/fmt

`html` and `md` tagged template literals that parse telegram's markup subset into `MessageEntity` objects — no `parse_mode`, no manual escaping.

## scope, honestly

these are **template dialects for authoring bot messages**, not document converters. they cover telegram's own entity vocabulary — bold through blockquote, `pre` with a language, custom emoji — and deliberately nothing beyond it: no headings, lists, tables or paragraph reflow. if you need to render an *arbitrary* markdown or html document (say, LLM output), run a real markdown parser and map its AST onto entities; for telegram's block-tree rich messages (headings, tables, collages) see [`@yaebal/rich`](https://npmx.dev/package/@yaebal/rich).

## install

```sh
pnpm add @yaebal/fmt
```

## usage

```ts
import { html, md } from "@yaebal/fmt";

// interpolations are auto-escaped: user input can never inject markup
bot.command("greet", (ctx) =>
  ctx.send(html`<b>Hello</b>, <i>${ctx.from?.first_name}</i>!`),
);

bot.command("info", (ctx) =>
  ctx.send(md`**yaebal** — *yet another* telegram bot api library`),
);

// a FormatResult interpolation (core's bold()/link()/…) is merged, offsets shifted
import { bold } from "@yaebal/core";
bot.command("mix", (ctx) => ctx.send(html`welcome, ${bold(ctx.who)}!`));

// interpolation inside an attribute (or a md link url) is substituted textually
ctx.send(html`<a href="${url}">open</a>`);
ctx.send(md`[open](${url})`);
```

## the html dialect

telegram's full html vocabulary:

| markup | entity |
| --- | --- |
| `<b>` `<strong>` | bold |
| `<i>` `<em>` | italic |
| `<u>` `<ins>` | underline |
| `<s>` `<strike>` `<del>` | strikethrough |
| `<tg-spoiler>` / `<span class="tg-spoiler">` | spoiler |
| `<code>` | code |
| `<pre>` | pre |
| `<pre><code class="language-x">` | one pre entity carrying `language: "x"` |
| `<blockquote>` | blockquote |
| `<blockquote expandable>` | expandable_blockquote |
| `<a href="…">` | text_link |
| `<tg-emoji emoji-id="…">` | custom_emoji |
| `<br>` / `<br/>` | a newline |

tags left unclosed at the end of input are auto-closed; unmatched closing tags are dropped; anything unrecognized (`<div>`, unquoted attributes) stays literal text.

## the md dialect

| markup | entity |
| --- | --- |
| `**bold**` | bold |
| `*italic*` / `_italic_` | italic |
| `__underline__` | underline |
| `~~strike~~` | strikethrough |
| `\|\|spoiler\|\|` | spoiler |
| `` `code` `` | code |
| ```` ```lang … ``` ```` | pre with `language` |
| `[text](url)` | text_link |
| `> ` line prefix | blockquote (consecutive lines merge) |

a backslash escapes the next character (`2 \* 3`), including inside a run (`**a \** b**`). single `*`/`_` don't trigger mid-word — `snake_case` and `2 * 3` are safe — and their content can't start or end with whitespace. for `expandable_blockquote` and `custom_emoji`, use the html dialect or core's helpers.

## interpolation rules

- `${string}` (and numbers/bigints) — inserted as **literal text**, never re-parsed.
- `${FormatResult}` — merged with its entity offsets shifted.
- `${null}` / `${undefined}` / booleans — render as empty text, so `${cond && bold("on")}` just works.
- inside an attribute value or a link url — substituted textually.

## api

| export | signature | returns |
| --- | --- | --- |
| `html` | tagged template | `FormatResult` |
| `md` | tagged template | `FormatResult` |
| `htmlToEntities` | `(s: string)` | `FormatResult` |
| `mdToEntities` | `(s: string)` | `FormatResult` |

the result is accepted anywhere core sends text: `ctx.send`/`reply`, captions, and — via the schema-generated format map — every `bot.api.*` method that has an `*_entities` sibling, including nested spots like `reply_parameters.quote`, poll options and media groups.

---

part of [**yaebal**](https://github.com/neverlane/yaebal) — a type-safe, runtime-agnostic Telegram Bot API framework. MIT.
