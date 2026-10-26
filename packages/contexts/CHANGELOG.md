# @yaebal/contexts

## 1.0.5

### patch changes

- updated dependencies [d9e233a]
  - @yaebal/core@0.4.4

## 1.0.4

### patch changes

- breaking (types only): 176 fields the bot api pins to one value — MessageOrigin*.type, BotCommandScope*.type, ChatMember*.status, InputMedia*.type, ReactionType\*.type and more — are string literals now, so their unions narrow. an object kept in a variable before being passed (const media = { type: "photo", media }) widens to string: write type: "photo" as const or annotate the variable. emoji in field descriptions are no longer dropped. contexts: ctx.editText / editCaption with a format result keep their extra params.
- updated dependencies
- updated dependencies
  - @yaebal/core@0.4.3
  - @yaebal/types@10.3.2

## 1.0.3

### patch changes

- a6a4587: keep generated and positional reply/quote shortcuts ephemeral when responding to an ephemeral message.
- updated dependencies [ef37463]
- updated dependencies [46920ed]
- updated dependencies [1ebbb05]
- updated dependencies [a7a2d74]
  - @yaebal/types@10.3.1
  - @yaebal/core@0.4.2

## 1.0.2

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
