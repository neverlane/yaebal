# @yaebal/callback-data

typed `callback_data`. define a prefix + a field→codec schema, then `pack`/`unpack`
with full type inference. values are URL-encoded so the `:` separator is safe inside
them. telegram caps callback_data at 64 bytes — keeping it short is the caller's job.

codecs are not validated: `number` must be finite (garbage decodes to `NaN`), and
`boolean` parses by exact `"true"` (anything else → `false`). safe for round-tripping
data you packed yourself, which is all callback_data ever is.

## install

```sh
pnpm add @yaebal/callback-data
```

---

part of [**yaebal**](https://github.com/neverlane/yaebal) — a type-safe, runtime-agnostic Telegram Bot API framework. MIT.
