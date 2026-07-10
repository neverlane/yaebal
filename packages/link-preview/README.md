# @yaebal/link-preview

fluent builder for telegram's `link_preview_options` — the field `sendMessage`,
`editMessageText`, and friends take to control the automatic link preview: which url to
preview, whether to shrink or enlarge its media, whether it renders above the message
text, or whether to hide it entirely. zero deps beyond `@yaebal/types`, no `ctx` wiring.

## install

```sh
pnpm add @yaebal/link-preview
```

## usage

```ts
import { linkPreview } from "@yaebal/link-preview";

await ctx.reply("check this out: https://example.com", {
	link_preview_options: linkPreview("https://example.com").showAboveText().preferLargeMedia().build(),
});
```

hide the preview entirely:

```ts
import { disableLinkPreview, linkPreview } from "@yaebal/link-preview";

await ctx.reply("no preview here", { link_preview_options: disableLinkPreview() });
// same as:
await ctx.reply("no preview here", { link_preview_options: linkPreview().disable().build() });
```

## api

- `linkPreview(url?)` → a `LinkPreview` builder, optionally pre-seeded with `.url(url)`.
- `LinkPreview` — chainable methods, each returning `this`:
  - `.url(url)` — url to preview; if omitted, telegram uses the first url found in the text.
  - `.disable(value = true)` — hides the preview.
  - `.preferSmallMedia(value = true)` / `.preferLargeMedia(value = true)` — resize hints;
    ignored when the url isn't explicitly set or resizing isn't supported for it.
  - `.showAboveText(value = true)` — renders the preview above the message text.
  - `.build()` — the plain `LinkPreviewOptions` object.
  - `.toJSON()` — same as `.build()`, so the builder also serializes correctly if you ever
    `JSON.stringify` it directly.
- `disableLinkPreview()` — shorthand for `{ is_disabled: true }`.

## behavior

every field on `LinkPreviewOptions` is optional and independent — `.preferSmallMedia()` and
`.preferLargeMedia()` are both plain flags with no mutual-exclusion logic, matching
telegram's own (equally permissive) api shape.

---

part of [**yaebal**](https://github.com/neverlane/yaebal) — a type-safe, runtime-agnostic Telegram Bot API framework. MIT.
