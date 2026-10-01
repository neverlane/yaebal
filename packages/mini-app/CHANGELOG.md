# @yaebal/mini-app

## 1.0.1

### patch changes

- 172d693: reject out-of-range authentication dates instead of bypassing expiry checks with an invalid date.
- updated dependencies [d3179c9]
- updated dependencies [fb30143]
- updated dependencies [a742af7]
  - @yaebal/core@0.4.1

## 1.0.0

### patch changes

- 412165b: `validateInitData` no longer rejects genuine bot api 7.2+ `initData` as `bad_hash`. the hmac
  data-check-string wrongly excluded `signature` alongside `hash` — that exclusion only applies to
  `validateInitDataThirdParty`'s ed25519 mode. `signature` is an ordinary field covered by the hmac
  hash like any other, and excluding it made every genuine payload carrying a `signature` field
  fail validation.
- updated dependencies [475e1ed]
- updated dependencies [24f5037]
  - @yaebal/core@0.4.0
