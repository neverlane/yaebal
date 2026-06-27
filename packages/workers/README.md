# @yaebal/workers

A small `worker_threads` pool for offloading CPU-heavy work (image resizing, hashing, parsing) away from the bot's event loop.

## install

```sh
pnpm add @yaebal/workers
```

## usage

```ts
// tasks.ts — runs inside each worker thread
import { register } from "@yaebal/workers";
import sharp from "sharp";

register({
  resize: (buf: Buffer) => sharp(buf).resize(100).toBuffer(),
});

// bot.ts
import { createPool } from "@yaebal/workers";
import { media } from "@yaebal/core";

const pool = createPool(new URL("./tasks.js", import.meta.url), { size: 4 });

bot.on("message:photo", async (ctx) => {
  const original = await ctx.download();
  const thumb = await pool.run<Buffer>("resize", original);
  await ctx.sendPhoto(media.buffer(thumb));
});

// on shutdown
await pool.destroy();
```
