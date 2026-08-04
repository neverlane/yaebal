---
"@yaebal/mini-app": patch
---

`validateInitData` no longer rejects genuine bot api 7.2+ `initData` as `bad_hash`. the hmac
data-check-string wrongly excluded `signature` alongside `hash` — that exclusion only applies to
`validateInitDataThirdParty`'s ed25519 mode. `signature` is an ordinary field covered by the hmac
hash like any other, and excluding it made every genuine payload carrying a `signature` field
fail validation.
