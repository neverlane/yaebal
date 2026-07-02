# @yaebal/rich

`sendRichMessage` / `sendRichMessageDraft` — telegram's block-tree message format. one dual-dialect builder set, a draft/streaming session that owns the 30s ttl, and full read-side coverage (type guards + plain-text flattening) of everything telegram can hand back on `message.rich_message`.

unlike classic `parse_mode`/entities (see [`@yaebal/fmt`](https://www.npmjs.com/package/@yaebal/fmt)), a rich message isn't a flat `{ text, entities }` pair — it's a document: paragraphs, headings, tables, lists, collages, slideshows, block quotes, a collapsible `<details>`, even a `<tg-thinking>` placeholder for streaming an in-progress answer. you write extended html (or markdown), telegram parses it server-side into a `RichMessage.blocks` tree, and that same tree is what you read back.

## install

```sh
pnpm add @yaebal/rich
```

## one builder, two dialects

telegram accepts a rich message as either `InputRichMessage.html` or `.markdown`. most rich-message libraries pick one dialect to build for and bolt the other on as a parallel, hand-duplicated set of functions. `@yaebal/rich` doesn't: every builder — `bold`, `paragraph`, `table`, `list`, all ~40 of them — returns a `RichNode` that doesn't know its own output format yet. it renders itself only when it lands inside a template:

```ts
import { html, md, heading, paragraph, bold, link, sendRichMessage } from "@yaebal/rich";

const title = "release notes";
const body = [
  heading(1, title),
  paragraph("yaebal ", bold("0.1"), " is out — see ", link("https://yaeb.al", "the docs"), "."),
];

await sendRichMessage(ctx.api, ctx.chat.id, html(body)); // <h1>…</h1><p>…</p>
await sendRichMessage(ctx.api, ctx.chat.id, md(body));   // # …\n\n…
```

there is no `md.bold`/`md.paragraph` shadow api to learn, nothing to keep in sync, and nothing that silently drifts between dialects — `bold(...)` is `bold(...)` everywhere. `html`/`md` are tagged templates first:

```ts
const doc = html`
  ${heading(1, title)}

  ${paragraph("yaebal ", bold("0.1"), " is out — see ", link("https://yaeb.al", "the docs"), ".")}
`;

await sendRichMessage(ctx.api, ctx.chat.id, doc);
```

literal template text passes through unchanged; only `${…}` interpolation is touched:

| interpolation                    | what happens                                                    |
|:----------------------------------|:-----------------------------------------------------------------|
| `${string}` / `${number}` / `${bigint}` | dialect-escaped — renders literally, can't inject formatting |
| `${builderNode}`                  | rendered into the template's dialect                              |
| `${anotherDocument}`              | inlined as-is if dialects match, throws `RichError` if they don't |
| `${array}`                        | each item rendered and concatenated                                |
| `${null \| undefined \| false}`   | empty string — so `cond && bold("x")` composes cleanly             |

multi-line templates are **dedented** (common leading indentation stripped) so you can write at your code's natural indent level. `html`/`md` also accept a plain string (passed through as-is, no escaping/dedent — for already-formatted content) or an array of blocks (each rendered and, for markdown, blank-line-joined — the form to reach for when composing from data instead of prose):

```ts
html([heading(1, title), list(items.map((i) => paragraph(i.text)))]);
```

`document(blocks, { dialect, rtl, skipEntityDetection })` is the options-object equivalent of `html(blocks)`/`md(blocks)`, for when the dialect is a runtime variable rather than a call-site choice.

### `RichDocument` — the sendable result

`html`/`md`/`document()` all return a `RichDocument`: a rendered string plus the `InputRichMessage` flags, settable fluently.

```ts
const doc = html`${paragraph("right-to-left, no auto-linking")}`
  .rtl()
  .noEntityDetection();

await sendRichMessage(ctx.api, ctx.chat.id, doc);
```

`sendRichMessage`/`sendRichMessageDraft`/`RichMessageDraft` all accept a `RichDocument`, a raw `InputRichMessage`, or a plain html string interchangeably — `toJSON()` also delegates to `toInputRichMessage()`, so a `RichDocument` serializes correctly even nested inside a hand-built payload.

### install the plugin for `ctx.send`-flavored ergonomics

```ts
import { Bot } from "@yaebal/core";
import { rich, html, paragraph } from "@yaebal/rich";

const bot = new Bot(token)
  .install(rich())
  .command("hi", (ctx) => ctx.sendRichMessage(html`${paragraph("hello!")}`));
```

## streaming a draft

`sendRichMessageDraft` streams a partial answer to a private chat — but the draft is **ephemeral**: telegram drops it 30 seconds after the last push, and it never becomes a real message on its own. `RichMessageDraft` owns that lifecycle: it re-pushes the latest draft on a timer so a slow generator doesn't lose it, and it refuses to push after you close it.

two ways to grow a draft: `rewrite()` replaces the whole thing — right for a token stream, where every chunk is a longer version of the *same* paragraph. `write()` appends to it (plain string concatenation) — right for tacking on a block after content that's already there, without re-supplying it.

```ts
import { thinking, html, paragraph, divider, footer } from "@yaebal/rich";

bot.command("ask", async (ctx) => {
  const draft = ctx.richMessageDraft(1); // draft_id, non-zero, per-message

  await draft.rewrite(html`${thinking("thinking…")}`); // draft-only block, see below

  let text = "";
  for await (const chunk of streamAnswer(ctx.text)) {
    text += chunk;
    await draft.rewrite(html`${paragraph(text)}`);
  }

  await draft.write(html`${divider()}${footer("streamed")}`); // append, no need to re-supply `text`

  // required: a draft never persists on its own. send() with no argument
  // auto-assembles from the rewrite()/write() calls above; pass an explicit
  // override (as here) when the persisted message should differ from the last
  // draft snapshot.
  await draft.send(html`${paragraph(text.trim())}${divider()}${footer("streamed")}`);
});
```

call `draft.cancel()` instead of `send()` to abandon a draft without persisting anything (it expires within 30s regardless).

## reading

```ts
import { richMessageToPlainText, isTable, isPhoto } from "@yaebal/rich";

bot.on("message:rich_message", (ctx) => {
  const plain = richMessageToPlainText(ctx.message.rich_message);
  const tables = ctx.message.rich_message.blocks.filter(isTable);
});
```

`richMessageToPlainText` / `richBlockToPlainText` / `richTextToPlainText` flatten the whole tree (or one node) to plain characters — useful for search indices, logs, or notification previews. every `RichBlock`/`RichText` variant has a matching `isX` type guard (`isParagraph`, `isTable`, `isCustomEmoji`, `isDateTime`, …).

## coverage

every one of telegram's ~50 `Rich*` types is covered on both sides:

- **write** — a builder function (or documented auto-detection) for every block and inline mark, in both dialects at once.
- **read** — an `isX` type guard and a plain-text flattening branch for every block and inline mark.

most tags are **confirmed** directly from telegram's schema (`<p>`, `<h1>`–`<h6>`, `<pre><code>`, `<hr/>`, `<footer>`, `<blockquote>`, `<aside>` for pull-quotes, `<details>`/`<summary>`, `<table>`, `<tg-collage>`, `<tg-slideshow>`, `<tg-map>`, `<tg-math-block>`, `<tg-thinking>`, `<img>`/`<video>`/`<audio>`, `<a name>`/`<a href="#…">`, `<cite>`, and the classic `<b>`/`<i>`/`<u>`/`<s>`/`<code>`/`<tg-spoiler>`/`<tg-emoji>`/`tg://user?id=…` set). `url`/`email_address`/`phone_number`/`bank_card_number`/`@mention`/`#hashtag`/`$cashtag`/`/bot_command` need **no explicit tag at all** — telegram auto-detects them from plain text unless you pass `.noEntityDetection()`.

a handful of inline/block features have **no documented tag** in the schema at all (`marked`, `subscript`, `superscript`, `date_time`, inline `mathematical_expression`, `reference`/`reference_link`, table `is_bordered`/`is_striped`). those are implemented as a best-effort guess (standard html5 tags where one exists, a `tg-*`-style name otherwise) and flagged in their doc comments in `inline.ts`/`blocks.ts` — verify against the live "rich message formatting options" docs before relying on the exact spelling in production. where rich-markdown has no native token for a block at all (`footer`, pull-quote, collage/slideshow, map, `details`, `underline`, `subscript`, `superscript`), the raw html tag is embedded as-is in the markdown output too — telegram's markdown parser accepts embedded html blocks as long as they're blank-line-separated, which the block builders already handle.

`sendRichMessage` has no `attach://`/multipart upload path (unlike `sendPhoto`) — media blocks (`image`/`video`/`audio`) take a hosted url, not a local file.

### tables and lists carry their full field set

`cell()` and `item()` aren't afterthoughts bolted onto a plain-array api — they're first-class `RichNode`s that also carry the options `table()`/`list()` need to do the right thing per dialect:

```ts
table(
  [
    [cell("day", { header: true }), cell("count", { header: true, align: "right" })],
    [cell("mon"), cell(128, { align: "right", colspan: 2 })],
  ],
  { bordered: true, caption: "week" },
);
```

in html this is a full `<table>` with `colspan`/`rowspan`/`valign`/per-cell `<th>`/`<td>`; in markdown it degrades gracefully to a gfm table (structurally header-first, alignment preserved, the rest dropped — gfm has no cell spans). `list()` accepts bare values directly (auto-wrapped in a plain item) or explicit `item()`s for checkboxes and ordered-list numbering overrides (`value`, `type`) — no separate wrapper step required either way.

## api

| export                                                                                                 | what                                                                      |
|:-------------------------------------------------------------------------------------------------------|:--------------------------------------------------------------------------|
| `html` / `md`                                                                                          | tagged templates — same builders, either dialect, auto-escaped interpolation |
| `document`                                                                                              | options-object form: assemble blocks into a `RichDocument` with an explicit dialect |
| `RichDocument`                                                                                          | the sendable result — `.rtl()`/`.noEntityDetection()`, `toInputRichMessage()`/`toJSON()` |
| `bold`/`italic`/`underline`/`strikethrough`/`spoiler`/`code`/`marked`/`subscript`/`superscript`/`br`   | inline marks                                                              |
| `link`/`textMention`/`anchor`/`anchorLink`/`customEmoji`/`dateTime`/`math`/`reference`/`referenceLink` | inline nodes with data                                                    |
| `paragraph`/`heading`/`h1`–`h6`/`preformatted`/`footer`/`divider`/`mathBlock`/`anchorBlock`            | simple blocks                                                             |
| `blockquote`/`pullquote`/`details`/`list`/`item`/`table`/`cell`/`join`                                 | structural blocks & composition                                          |
| `collage`/`slideshow`/`map`/`image`/`video`/`audio`/`thinking`                                         | media & draft-only blocks                                                |
| `RichNode`/`isRichNode`/`makeNode`/`Dialect`/`Level`/`RichError`                                        | the node contract, for writing your own dual-dialect builder             |
| `escapeMarkdown`/`escapeMarkdownUrl`                                                                    | the raw markdown escapers the builders use internally                    |
| `sendRichMessage`/`sendRichMessageDraft`                                                                | standalone send functions, no plugin required                            |
| `rich()`                                                                                                | plugin: adds `ctx.sendRichMessage`/`ctx.richMessageDraft`                |
| `RichMessageDraft`                                                                                      | the draft/streaming session class — `rewrite()`/`write()`/`send()`/`cancel()` |
| `isParagraph`, `isTable`, `isCustomEmoji`, …                                                            | one type guard per `RichBlock`/`RichText` variant                        |
| `richTextToPlainText`/`richBlockToPlainText`/`richMessageToPlainText`                                   | flatten to plain text                                                    |

plus the full generated type surface (`RichMessage`, `RichBlock`, `RichText`, and every `RichBlock*`/`RichText*` interface) re-exported from `@yaebal/types` for convenience.

---

part of [**yaebal**](https://github.com/neverlane/yaebal) — a type-safe, runtime-agnostic Telegram Bot API framework. MIT.
