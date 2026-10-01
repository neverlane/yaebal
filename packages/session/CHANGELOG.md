# @yaebal/session

## 1.0.1

### patch changes

- ada380c: serialize explicit saves, clears, and final flushes within an update so delayed storage writes cannot restore a cleared session.
- 0e9ac10: reject invalid or newer stored migration versions without rewriting session data to an older schema.
- updated dependencies [d3179c9]
- updated dependencies [fb30143]
- updated dependencies [a742af7]
- updated dependencies [4a6acd9]
  - @yaebal/core@0.4.1
  - @yaebal/sklad@0.1.1

## 1.0.0

### patch changes

- updated dependencies [475e1ed]
- updated dependencies [24f5037]
  - @yaebal/core@0.4.0
