# yaebal

## 0.2.0

### Minor Changes

- 770b00e: the meta package now ships the production preamble every real bot writes anyway:
  `autoRetry`, `autoAnswer`, `hydrate`, `typing`, `files`, `splitter`, plus the `FileId` decoder,
  the `InlineQueryResult`/`InputMessageContent` builders and the rest of sklad's storage adapters
  (`redisStorage`, `sqliteStorage`, `kvStorage`) — all from the same `import … from "yaebal"`.

### Patch Changes

- Updated dependencies [475e1ed]
- Updated dependencies [24f5037]
  - @yaebal/core@0.4.0
  - @yaebal/again@1.0.0
  - @yaebal/auto-answer@1.0.0
  - @yaebal/contexts@1.0.0
  - @yaebal/files@1.0.0
  - @yaebal/filters@1.0.0
  - @yaebal/fmt@1.0.0
  - @yaebal/hydrate@0.1.1
  - @yaebal/i18n@1.0.0
  - @yaebal/session@1.0.0
  - @yaebal/split@1.0.0
  - @yaebal/typing@1.0.0
  - @yaebal/web@1.0.0
