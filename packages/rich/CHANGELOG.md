# @yaebal/rich

## 1.2.1

### patch changes

- updated dependencies [d9e233a]
  - @yaebal/core@0.4.4

## 1.2.0

### minor changes

- ai: rich: true | "markdown" | "html" answers as telegram rich messages — streamed through rich drafts, 32768 characters per message, plain-text fallback when the markup is rejected; group-mode streams report their finalized message in result.messages and onPart. rich: RICH_MARKDOWN_PROMPT, a system prompt that keeps model output inside the rich markdown grammar.

### patch changes

- updated dependencies
- updated dependencies
  - @yaebal/core@0.4.3
  - @yaebal/types@10.3.2

## 1.1.0

### minor changes

- 3338689: preserve structured blocks and explicit media throughout rich drafts, reject unsupported draft uploads, and add fluent document attachments.

### patch changes

- 1b2129b: reject empty callback payloads in rich buttons and allow rewriting structured drafts as html.
- a7a2d74: include plain strings and recursive arrays in generated rich-text unions, and handle them safely in read-side type guards.
- updated dependencies [ef37463]
- updated dependencies [46920ed]
- updated dependencies [1ebbb05]
- updated dependencies [a7a2d74]
  - @yaebal/types@10.3.1
  - @yaebal/core@0.4.2

## 1.0.1

### patch changes

- updated dependencies [d3179c9]
- updated dependencies [fb30143]
- updated dependencies [a742af7]
  - @yaebal/core@0.4.1

## 1.0.0

### patch changes

- updated dependencies [475e1ed]
- updated dependencies [24f5037]
  - @yaebal/core@0.4.0
