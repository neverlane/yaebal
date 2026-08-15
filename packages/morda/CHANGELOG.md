# @yaebal/morda

## 1.0.1

### patch changes

- writes made from a window's `render()` are no longer silently lost. `commit()` snapshotted the
  dialog state *before* calling `render`, so a `ctx.dialog.setData()`/`update()` from inside a
  render loaded its own copy, mutated it, saved it — and was then clobbered by the snapshot the
  commit wrote back. the same shape hit `onClick`/`onText` whenever the callback also set frame
  state (`invalidate()`, jsx `setState`), and `onEnter`, whose seed was overwritten by `start()`'s
  post-`onEnter` save. only serializing storages were affected — redis, sqlite, file — because an
  in-memory adapter hands back the same object and papers the lost update over; the reentrant
  `KeyedLock` prevented the deadlock but not the lost write, so it failed without an error.

  a held lock section now owns a single in-flight `DialogState`: every `load()` inside it resolves
  to the same object, so a hook mutates the very instance the surrounding code persists and
  `save()` stays the only writer. **every window hook may now write dialog state, `render()`
  included** — the one rule left is that `render` runs once per commit pass (and again when a
  press is routed, to locate the button that was tapped), so its writes must be idempotent and
  one-shot side effects still belong in `onEnter`/`onCommit`.

- `update()`/`rerender()` called from inside `render()` or `onCommit()` no longer recurse into the
  commit that is already running — previously an unbounded hang, now they fold into one more
  pass, bounded by `MAX_COMMIT_PASSES`. a render that unconditionally re-renders itself fails
  loud with a `MordaError` instead of wedging the process.

## 1.0.0

### patch changes

- updated dependencies [475e1ed]
- updated dependencies [24f5037]
  - @yaebal/core@0.4.0
