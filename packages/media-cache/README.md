# @yaebal/media-cache

Reuse a `file_id` instead of re-uploading the same file.

## manual mode

```ts
import { mediaCache } from "@yaebal/media-cache"
import { media } from "yaebal"

const cache = mediaCache()

bot.command("logo", async (ctx) => {
    await cache.photo(ctx, "logo", media.path("./logo.png"))
})
```

## transparent mode (hook into `ctx.send*`)

```ts
import { mediaCache } from "@yaebal/media-cache"
import { media } from "yaebal"

const cache = mediaCache()
cache.hook(bot.api)

// all sendPhoto/sendDocument/sendAudio/... auto-cache by path or URL
bot.command("logo", async (ctx) => {
    await ctx.sendPhoto(media.path("./logo.png")) // first time: upload
    await ctx.sendPhoto(media.path("./logo.png")) // second time: cached file_id
})
```

Keyed by the source path or URL — if you send the same path twice, it reuses the `file_id` from the first response.

## storage

Defaults to in-memory (`MemoryStorage`, lost on restart). Pass a persistent storage:

```ts
import { mediaCache } from "@yaebal/media-cache"

const cache = mediaCache({
    storage: myRedisStorage, // any StorageAdapter<string>
})
```

---

Part of [**yaebal**](https://github.com/neverlane/yaebal) — a type-safe, runtime-agnostic Telegram Bot API framework. MIT.
