# @yaebal/file-id

parse, inspect and re-serialize telegram `file_id` and `file_unique_id` strings.

a `file_id` isn't opaque — it's a TL-serialized [TDLib](https://core.telegram.org/tdlib) blob
(behind zero-byte RLE and url-safe base64) carrying the file's datacenter, type, access hash,
file reference and photo-size source. this package decodes it. zero dependencies, pure js,
runs anywhere (node/bun/deno/edge) — no `Buffer`, no telegram client.

## install

```sh
pnpm add @yaebal/file-id
```

## usage

```ts
import { FileId, FileType, isPhotoFileId } from "@yaebal/file-id";

const file = FileId.from(ctx.document.file_id);

file.kind          // "photo" | "document" | "web"
file.fileType      // FileType.Sticker, FileType.Video, …
file.dcId          // 1..5 — which telegram datacenter stores the file
file.accessHash    // bigint
file.hasReference  // carries a fresh file_reference?

if (file.fileType === FileType.Sticker) {
	// …
}

// full discriminated union for narrowing
if (isPhotoFileId(file.raw)) {
	file.raw.photoSize; // legacy | thumbnail | dialog_photo_* | sticker_set_thumbnail*
}

file.toString(); // re-serializes — round-trips the original string byte-for-byte
```

### dedupe with `file_unique_id`

`file_id` is bot-scoped and may rotate; `file_unique_id` is the stable identity. it's
derivable from the full id:

```ts
const unique = FileId.from(a).toUniqueId();
const same = unique.toString() === FileId.from(b).toUniqueId().toString();
```

or parse one you already have:

```ts
import { FileUniqueId } from "@yaebal/file-id";

const unique = FileUniqueId.from(msg.document.file_unique_id);
unique.kind; // "photo" | "document" | "web" | "secure" | "encrypted" | "temp"
```

## functional api

every class entry point exists as a free function: `parseFileId` / `serializeFileId` /
`fileUniqueIdFromFileId` / `parseFileUniqueId` / `serializeFileUniqueId`. the encoding
primitives (`base64urlEncode/Decode`, `rleEncode/Decode`, `packTlString/unpackTlString`,
`BinaryReader`/`BinaryWriter`) are exported too.

## errors

- `FileIdParseError` — malformed input (bad base64url, truncated payload, unknown tags).
- `UnsupportedFileIdVersionError` — telegram bumped the format past what this parser knows.
  open an issue when you hit it.

---

part of [**yaebal**](https://github.com/neverlane/yaebal) — a type-safe, runtime-agnostic Telegram Bot API framework. MIT.
