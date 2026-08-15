# @yaebal/core

## 0.4.0

### minor changes

- 475e1ed: polling survives a flaky link without shouting about it: consecutive `getUpdates` failures now
  back off 3s → 30s (reset on the first success) instead of retrying every 3s forever, and the
  routine hang-timeout abort — a connection a proxy dropped without closing — is retried silently
  the first three times, so an alerting `onPollingError` stops firing on normal recovery.
  `onPollingError` receives a second argument (`{ attempt, retryInMs, aborted }`) for handlers that
  want to throttle themselves.
- 24f5037: `Filtered<C, Q>` now narrows the whole query grammar the runtime gates on — any `Message` field
  (not just the media ones), bare message-carrying updates (`message`, `edited_message`,
  `channel_post`, `business_message`, …) narrow `ctx.message`, and any other bare update type
  narrows its `ctx.update` key. queries the runtime can't verify still fall through to `C`
  unchanged, so a narrowed field is always one `matchQuery`/`checkField` verified.
