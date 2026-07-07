# @yaebal/media-cache

upload a file once, send its `file_id` forever after — with self-healing when telegram
rejects a stale id.

## transparent mode

```ts
import { mediaCache } from "@yaebal/media-cache"
import { media } from "yaebal"

const cache = mediaCache()
const bot = createBot(token).install(cache.plugin()) // or: cache.attach(bot.api)

bot.command("logo", async (ctx) => {
    await ctx.sendPhoto(media.path("./logo.png")) // first time: upload
    await ctx.sendPhoto(media.path("./logo.png")) // after that: cached file_id
})
```

every media send is covered — `sendPhoto`, `sendDocument`, `sendAudio`, `sendVideo`,
`sendAnimation`, `sendVoice`, `sendVideoNote`, `sendSticker`, plus each item of a
`sendMediaGroup` and the media of an `editMessageMedia`.

## what keys what

| source | cache key | note |
| --- | --- | --- |
| `media.path("./a.png")` | the path | zero extra I/O on a hit |
| `media.url("https://…")` | the url | telegram skips re-downloading it |
| `media.buffer(bytes)` | sha-256 of the bytes | same bytes → one upload, changed bytes → new key |
| `media.text("…", "a.txt")` | sha-256 of the text | |
| `media.stream(…)` | — | single-shot, passes through uncached |
| `media.fileId("…")` | — | already the cached form |

raw string params (a bare url / file_id) pass through untouched — only `media.*` sources
are cached.

## self-healing

a cached `file_id` can go bad — storage shared with another bot (file_ids are per-bot),
a wiped test server, a corrupt entry. when telegram answers `400 wrong file identifier`,
the entry is evicted and the request retries with the original source automatically; the
caller never sees the failure.

## manual mode — explicit keys

when the key should survive the file moving between paths or urls, name it yourself:

```ts
bot.command("poster", async (ctx) => {
    await cache.photo(ctx, "poster:v1", media.url("https://cdn.example/poster.png"))
})
```

one method per media kind: `photo`, `document`, `audio`, `video`, `animation`, `voice`,
`videoNote`, `sticker`. manual keys live in their own `key:` namespace, so they never
collide with transparent-mode keys.

## invalidation

```ts
await cache.invalidate(media.path("./logo.png")) // by source
await cache.invalidate("poster:v1")              // by manual key
await cache.keyFor(media.path("./logo.png"))     // → "path:logo.png" (inspect/debug)
```

no ttl by design: file_ids don't expire, they get *rejected* — and rejection already
self-heals (see above). content-keyed sources (buffers, text) also self-invalidate: new
content is a new key.

## storage & multi-bot

defaults to in-memory (`MemoryStorage`, lost on restart). pass any `StorageAdapter<string>`
to persist; set `scope` when bots share one storage — a `file_id` only works for the bot
that uploaded it:

```ts
const cache = mediaCache({
    storage: myRedisStorage,
    scope: "my-bot", // keys become "my-bot:path:…"
})
```

## observability

```ts
const cache = mediaCache({
    onEvent: (e) => console.log(e.type, e.key), // "hit" | "store" | "evict"
})
```

## notes

- two concurrent first sends of the same source both upload (no request blocks another);
  the cache converges on one file_id.
- `thumbnail` params are never cached — telegram doesn't allow reusing thumbnails by
  `file_id`.

---

part of [**yaebal**](https://github.com/neverlane/yaebal) — a type-safe, runtime-agnostic Telegram Bot API framework. MIT.
