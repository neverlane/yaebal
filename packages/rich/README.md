# @yaebal/rich

`sendRichMessage` / `sendRichMessageDraft` — telegram's block-tree message format. a typed builder for the extended html dialect, a draft/streaming session that owns the 30s ttl, and full read-side coverage (type guards + plain-text flattening) of everything telegram can hand back on `message.rich_message`.

unlike classic `parse_mode`/entities (see [`@yaebal/fmt`](https://www.npmjs.com/package/@yaebal/fmt)), a rich message isn't a flat `{ text, entities }` pair — it's a document: paragraphs, headings, tables, lists, collages, slideshows, block quotes, a collapsible `<details>`, even a `<tg-thinking>` placeholder for streaming an in-progress answer. you write extended html (or markdown), telegram parses it server-side into a `RichMessage.blocks` tree, and that same tree is what you read back.

## install

```sh
pnpm add @yaebal/rich
```

## sending

```ts
import { document, heading, paragraph, bold, link, sendRichMessage } from "@yaebal/rich";

const input = document([
  heading(1, "release notes"),
  paragraph("yaebal ", bold("0.1"), " is out — see ", link("https://yaeb.al", "the docs"), "."),
]);

await sendRichMessage(ctx.api, ctx.chat.id, input);
```

or install the plugin for `ctx.send`-flavored ergonomics:

```ts
import { Bot } from "@yaebal/core";
import { rich, document, paragraph } from "@yaebal/rich";

const bot = new Bot(token)
  .install(rich())
  .command("hi", (ctx) => ctx.sendRichMessage(document([paragraph("hello!")])));
```

## streaming a draft

`sendRichMessageDraft` streams a partial answer to a private chat — but the draft is **ephemeral**: telegram drops it 30 seconds after the last push, and it never becomes a real message on its own. `RichMessageDraft` owns that lifecycle: it re-pushes the latest draft on a timer so a slow generator doesn't lose it, and it refuses to push after you close it.

```ts
import { thinking, document, paragraph, sendRichMessage } from "@yaebal/rich";

bot.command("ask", async (ctx) => {
  const draft = ctx.richMessageDraft(1); // draft_id, non-zero, per-message

  await draft.push(thinking("thinking…")); // draft-only block, see below

  let text = "";
  for await (const chunk of streamAnswer(ctx.text)) {
    text += chunk;
    await draft.push(document([paragraph(text)]));
  }

  // required: a draft never persists on its own.
  await draft.commit(document([paragraph(text)]));
});
```

call `draft.cancel()` instead of `commit()` to abandon a draft without persisting anything (it expires within 30s regardless).

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

- **write** — a builder function (or documented auto-detection) for every block and inline mark.
- **read** — an `isX` type guard and a plain-text flattening branch for every block and inline mark.

most tags are **confirmed** directly from telegram's schema (`<p>`, `<h1>`–`<h6>`, `<pre><code>`, `<hr/>`, `<footer>`, `<blockquote>`, `<aside>` for pull-quotes, `<details>`/`<summary>`, `<table>`, `<tg-collage>`, `<tg-slideshow>`, `<tg-map>`, `<tg-math-block>`, `<tg-thinking>`, `<img>`/`<video>`/`<audio>`, `<a name>`/`<a href="#…">`, `<cite>`, and the classic `<b>`/`<i>`/`<u>`/`<s>`/`<code>`/`<tg-spoiler>`/`<tg-emoji>`/`tg://user?id=…` set). `url`/`email_address`/`phone_number`/`bank_card_number`/`@mention`/`#hashtag`/`$cashtag`/`/bot_command` need **no explicit tag at all** — telegram auto-detects them from plain text unless you pass `skipEntityDetection: true`.

a handful of inline/block features have **no documented tag** in the schema at all (`marked`, `subscript`, `superscript`, `date_time`, inline `mathematical_expression`, `reference`/`reference_link`, table `is_bordered`/`is_striped`). those are implemented as a best-effort guess (standard html5 tags where one exists, a `tg-*`-style name otherwise) and flagged in their doc comments in `inline.ts`/`blocks.ts` — verify against the live "rich message formatting options" docs before relying on the exact spelling in production.

`sendRichMessage` has no `attach://`/multipart upload path (unlike `sendPhoto`) — media blocks (`image`/`video`/`audio`) take a hosted url, not a local file.

## api

| export                                                                                                 | what                                                                      |
|:-------------------------------------------------------------------------------------------------------|:--------------------------------------------------------------------------|
| `html`                                                                                                 | tagged template for the extended-html dialect, auto-escaped interpolation |
| `bold`/`italic`/`underline`/`strikethrough`/`spoiler`/`code`/`marked`/`subscript`/`superscript`        | inline marks                                                              |
| `link`/`textMention`/`anchor`/`anchorLink`/`customEmoji`/`dateTime`/`math`/`reference`/`referenceLink` | inline nodes with data                                                    |
| `paragraph`/`heading`/`preformatted`/`footer`/`divider`/`mathBlock`/`anchorBlock`                      | simple blocks                                                             |
| `blockquote`/`pullquote`/`details`/`list`/`item`/`table`/`cell`                                        | structural blocks                                                         |
| `collage`/`slideshow`/`map`/`image`/`video`/`audio`/`thinking`                                         | media & draft-only blocks                                                 |
| `document`/`markdown`                                                                                  | assemble blocks into an `InputRichMessage`                                |
| `sendRichMessage`/`sendRichMessageDraft`                                                               | standalone send functions, no plugin required                             |
| `rich()`                                                                                               | plugin: adds `ctx.sendRichMessage`/`ctx.richMessageDraft`                 |
| `RichMessageDraft`                                                                                     | the draft/streaming session class                                         |
| `isParagraph`, `isTable`, `isCustomEmoji`, …                                                           | one type guard per `RichBlock`/`RichText` variant                         |
| `richTextToPlainText`/`richBlockToPlainText`/`richMessageToPlainText`                                  | flatten to plain text                                                     |

plus the full generated type surface (`RichMessage`, `RichBlock`, `RichText`, and every `RichBlock*`/`RichText*` interface) re-exported from `@yaebal/types` for convenience.

---

part of [**yaebal**](https://github.com/neverlane/yaebal) — a type-safe, runtime-agnostic Telegram Bot API framework. MIT.
