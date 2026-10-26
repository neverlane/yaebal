# @yaebal/ai

## 0.2.1

### patch changes

- updated dependencies [d9e233a]
  - @yaebal/core@0.4.4
  - @yaebal/split@1.0.4

## 0.2.0

### minor changes

- ai: rich: true | "markdown" | "html" answers as telegram rich messages — streamed through rich drafts, 32768 characters per message, plain-text fallback when the markup is rejected; group-mode streams report their finalized message in result.messages and onPart. rich: RICH_MARKDOWN_PROMPT, a system prompt that keeps model output inside the rich markdown grammar.

### patch changes

- updated dependencies
- updated dependencies
- updated dependencies
  - @yaebal/core@0.4.3
  - @yaebal/sklad@0.1.2
  - @yaebal/types@10.3.2
  - @yaebal/split@1.0.3

## 0.1.0

### minor changes

- 32091fb: support native draft stop buttons, cancel provider work by chat/topic/draft, and optionally persist partial responses with cancellation-aware streaming cleanup.

### patch changes

- updated dependencies [ef37463]
- updated dependencies [46920ed]
- updated dependencies [1ebbb05]
- updated dependencies [a7a2d74]
  - @yaebal/types@10.3.1
  - @yaebal/core@0.4.2
  - @yaebal/split@1.0.2

## 0.0.5

### patch changes

- b50fc35: handle lf, crlf and cr framing in streaming model responses, preserve data whitespace and empty events, and cancel the source when a consumer stops reading early.
- updated dependencies [d3179c9]
- updated dependencies [fb30143]
- updated dependencies [a742af7]
- updated dependencies [4a6acd9]
  - @yaebal/core@0.4.1
  - @yaebal/sklad@0.1.1
  - @yaebal/split@1.0.1

## 0.0.4

### patch changes

- updated dependencies [475e1ed]
- updated dependencies [24f5037]
  - @yaebal/core@0.4.0
  - @yaebal/split@1.0.0
