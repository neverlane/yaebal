# @yaebal/runner

## 0.0.4

### Patch Changes

- 7bcd7f8: `stop()` now aborts the in-flight `getUpdates` long poll (and any retry backoff) instead of waiting out the full `timeout` window, and `chatKey` covers the remaining chat-scoped update types (business messages, reactions, boosts) plus the payment/inline actor ids, so those updates are sequentialized instead of running unordered.
