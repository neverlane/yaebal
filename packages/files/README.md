# @yaebal/files

inspect, link, stream and download telegram files — `ctx.files` in handlers, `createFiles(api)`
everywhere else. knows about self-hosted Bot API servers (`--local`): disk reads, shared-volume
remaps and token-less links.

## install

```sh
pnpm add @yaebal/files
```

## usage

```ts
import { files } from "@yaebal/files";

bot.install(files());

bot.on("message:photo", async (ctx) => {
	// ctx.photo is a size array — the largest size is picked automatically
	const info = await ctx.files.info(ctx.photo); // getFile metadata, no bytes
	if ((info.file_size ?? 0) > 10 * 1024 * 1024) return ctx.reply("too big");

	await ctx.files.download(ctx.photo).toFile("./last-photo.jpg");
});
```

`info` / `url` / `download` accept a `file_id` string, any object with a `file_id`
(`Document`, `Audio`, `Voice`, `Sticker`, …) or a `PhotoSize[]` array.

### the download handle

`download()` returns a lazy, `Response`-like handle — nothing is fetched until you read:

```ts
const dl = ctx.files.download(ctx.document);

await dl.info();              // File metadata (one getFile, memoized)
await dl.url();               // download URL — ⚠️ embeds the bot token by default
await dl.bytes();             // Uint8Array
await dl.text();              // utf-8 string
await dl.json<Config>();      // parsed JSON
await dl.blob();              // Blob
await dl.stream();            // ReadableStream — pipe huge files, no buffering
await dl.toFile("./a.pdf");   // save to disk, returns the path
const bytes = await dl;       // PromiseLike — awaiting yields Uint8Array
```

like a `Response`, the body is single-use — read it once, call `download()` again for
another pass. `info()`, `url()` and disk-sourced `toFile()` don't consume it.

### without middleware

```ts
import { createFiles } from "@yaebal/files";

const files = createFiles(bot.api);
await files.download(fileId).toFile("./backup.bin"); // onStart, cron jobs, workers, scripts
```

### self-hosted Bot API server (`--local`)

with `--local` the server reports absolute disk paths instead of CDN paths. the plugin
handles that automatically; tell it your topology:

```ts
files({
	local: {
		dir: "/var/lib/telegram-bot-api",  // the server's working dir (default)
		mount: "/data",                    // where that volume is mounted for the bot
		baseUrl: "https://files.my.app",   // serve the dir over HTTP → token-less url()
	},
});
```

strategy is picked per file (`source: "auto"`): relative path → classic URL; absolute path →
`baseUrl` rewrite when configured, else direct disk read (copy-on-disk `toFile`, zero
transfer). force one with `source: "url" | "disk" | "rewrite"`, or pass a function
`(file) => Promise<Uint8Array>` for full custom resolution.

## options

| option | default | what it does |
| --- | --- | --- |
| `source` | `"auto"` | byte-fetching strategy (see above) |
| `local.dir` | `/var/lib/telegram-bot-api` | server working dir — prefix of absolute `file_path`s |
| `local.mount` | = `dir` | bot-side mount point of the shared volume |
| `local.baseUrl` | — | public URL of the working dir — token-less links + `"rewrite"` |
| `fetch` | `globalThis.fetch` | fetch override for byte downloads (proxy, tests) |

per call: `ctx.files.download(file, { signal })` — the `AbortSignal` reaches both `getFile`
and the byte fetch.

## errors

every failure is a `FilesError` with a machine-readable `reason`: `"bad-input"`,
`"no-file-path"`, `"download-failed"` (carries `status`), `"no-url"`, `"no-filesystem"`,
`"config"`.

## notes

- the hosted Bot API caps `getFile` downloads at 20 MB — a local server lifts that to 2 GB.
- byte downloads go straight through `fetch`, not through `api` hooks — `@yaebal/again`
  retries the `getFile` call, not the transfer itself.
- want to see *inside* a `file_id` (datacenter, access hash, dedupe key)? that's
  [`@yaebal/file-id`](../file-id).

---

part of [**yaebal**](https://github.com/neverlane/yaebal) — a type-safe, runtime-agnostic Telegram Bot API framework. MIT.
