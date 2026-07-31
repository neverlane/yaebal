---
"yaebal": minor
---

the meta package now ships the production preamble every real bot writes anyway:
`autoRetry`, `autoAnswer`, `hydrate`, `typing`, `files`, `splitter`, plus the `FileId` decoder,
the `InlineQueryResult`/`InputMessageContent` builders and the rest of sklad's storage adapters
(`redisStorage`, `sqliteStorage`, `kvStorage`) — all from the same `import … from "yaebal"`.
