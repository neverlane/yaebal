# @yaebal/callback-data

Typed `callback_data`. Define a prefix + a field→codec schema, then `pack`/`unpack`
with full type inference. Values are URL-encoded so the `:` separator is safe inside
them. Telegram caps callback_data at 64 bytes — keeping it short is the caller's job.

Codecs are not validated: `Number` must be finite (garbage decodes to `NaN`), and
`Boolean` parses by exact `"true"` (anything else → `false`). Safe for round-tripping
data you packed yourself, which is all callback_data ever is.

## install

```sh
pnpm add @yaebal/callback-data
```

---

Part of [**yaebal**](https://github.com/neverlane/yaebal) — a type-safe, runtime-agnostic Telegram Bot API framework. MIT.
