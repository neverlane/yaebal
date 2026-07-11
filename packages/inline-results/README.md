# @yaebal/inline-results

typed builders for every `InlineQueryResult` and `InputMessageContent` variant — so an
`answerInlineQuery` payload reads as data instead of a hand-rolled object literal, and a typo in
a field name (`thumb_url` vs `thumbnail_url`, the classic one) is a compile error, not a silent
`400` from Telegram.

## install

```sh
pnpm add @yaebal/inline-results
```

## usage

```ts
import { InlineQueryResult, InputMessageContent } from "@yaebal/inline-results";

bot.on("inline_query", async (ctx) => {
  await ctx.api.answerInlineQuery({
    inline_query_id: ctx.inlineQuery.id,
    results: [
      InlineQueryResult.article(
        "1",
        "yaebal",
        InputMessageContent.text("yet another telegram bot api library"),
        { description: "a type-safe, extensible telegram bot api framework" },
      ),
      InlineQueryResult.photo("2", "https://example.com/cat.jpg", "https://example.com/cat_thumb.jpg"),
      InlineQueryResult.cached.audio("3", "AwACAgIAA...", { performer: "yaebal" }),
    ],
  });
});
```

every builder takes the variant's *required* fields positionally, and a trailing options object
for everything optional (`reply_markup`, thumbnails, captions, durations, …) — typed straight off
`@yaebal/types`, so it can't drift from the real schema.

## formatted text

`caption` and `message_text` accept a `FormattedText` (`{ text, entities }` — what `format` /
`html` / `md` from `@yaebal/core` / `@yaebal/fmt` produce) in addition to a plain string. pass it
through as-is; `bot.api` decomposes it into the wire fields the same way it does for every other
formatted-text param:

```ts
import { html } from "@yaebal/fmt";

InlineQueryResult.article(
  "1",
  "yaebal",
  InputMessageContent.text(html`<b>yaebal</b> — yet another telegram bot api library`),
);
```

## `cached.*`

the `file_id`-backed variants (already on Telegram's servers, not fetched from a URL) live under
`InlineQueryResult.cached`:

```ts
InlineQueryResult.cached.photo(id, photoFileId);
InlineQueryResult.cached.document(id, title, documentFileId);
InlineQueryResult.cached.sticker(id, stickerFileId);
// + gif, mpeg4Gif, video, voice, audio
```

## `InputMessageContent`

covers `text`, `location`, `venue`, `contact` and `invoice`. not covered: rich block-tree content
— build that with [`@yaebal/rich`](https://npmx.dev/package/@yaebal/rich), its output already
satisfies `InputMessageContent`.

```ts
InputMessageContent.text("hello");
InputMessageContent.location(51.5, -0.12);
InputMessageContent.venue(51.5, -0.12, "Big Ben", "Westminster");
InputMessageContent.contact("+123456789", "Ann");
InputMessageContent.invoice("Widget", "a widget", "payload1", "USD", [{ label: "Widget", amount: 500 }]);
```

---

part of [**yaebal**](https://github.com/neverlane/yaebal) — a type-safe, runtime-agnostic Telegram Bot API framework. MIT.
