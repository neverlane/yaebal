# @yaebal/types

## 10.3.2

### patch changes

- breaking (types only): 176 fields the bot api pins to one value — MessageOrigin*.type, BotCommandScope*.type, ChatMember*.status, InputMedia*.type, ReactionType\*.type and more — are string literals now, so their unions narrow. an object kept in a variable before being passed (const media = { type: "photo", media }) widens to string: write type: "photo" as const or annotate the variable. emoji in field descriptions are no longer dropped. contexts: ctx.editText / editCaption with a format result keep their extra params.

## 10.3.1

### patch changes

- ef37463: refresh bot api 10.3 descriptions for expandable quotes and button styles, and document mini app external-origin restrictions.
- a7a2d74: include plain strings and recursive arrays in generated rich-text unions, and handle them safely in read-side type guards.
