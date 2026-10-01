# yaebal

## 0.2.1

### patch changes

- updated dependencies [ba1ae27]
- updated dependencies [d3179c9]
- updated dependencies [fb30143]
- updated dependencies [a742af7]
- updated dependencies [ada380c]
- updated dependencies [0e9ac10]
- updated dependencies [4a6acd9]
  - @yaebal/callback-data@0.1.1
  - @yaebal/core@0.4.1
  - @yaebal/session@1.0.1
  - @yaebal/sklad@0.1.1
  - @yaebal/again@1.0.1
  - @yaebal/auto-answer@1.0.1
  - @yaebal/contexts@1.0.2
  - @yaebal/files@1.0.1
  - @yaebal/filters@1.0.1
  - @yaebal/fmt@1.0.1
  - @yaebal/hydrate@0.1.2
  - @yaebal/i18n@1.0.1
  - @yaebal/split@1.0.1
  - @yaebal/typing@1.0.1
  - @yaebal/web@1.0.1

## 0.2.0

### minor changes

- 770b00e: the meta package now ships the production preamble every real bot writes anyway:
  `autoRetry`, `autoAnswer`, `hydrate`, `typing`, `files`, `splitter`, plus the `FileId` decoder,
  the `InlineQueryResult`/`InputMessageContent` builders and the rest of sklad's storage adapters
  (`redisStorage`, `sqliteStorage`, `kvStorage`) — all from the same `import … from "yaebal"`.

### patch changes

- updated dependencies [475e1ed]
- updated dependencies [24f5037]
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
