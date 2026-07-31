---
"@yaebal/core": minor
---

polling survives a flaky link without shouting about it: consecutive `getUpdates` failures now
back off 3s → 30s (reset on the first success) instead of retrying every 3s forever, and the
routine hang-timeout abort — a connection a proxy dropped without closing — is retried silently
the first three times, so an alerting `onPollingError` stops firing on normal recovery.
`onPollingError` receives a second argument (`{ attempt, retryInMs, aborted }`) for handlers that
want to throttle themselves.
