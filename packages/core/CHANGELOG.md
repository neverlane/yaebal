# @yaebal/core

## 0.4.3

### patch changes

- on, command and hears accept arrays; allowed_updates is derived from the handlers (chat_member and message_reaction updates arrive once you register them, see bot.allowedUpdates()); YAEBAL_DEBUG namespaced logging; when() for build-time conditional middleware; ctx.show() edits the pressed button's message or sends a new one; bot.createContext(); a stop mid-batch confirms the updates already handled. yaebal's Bot installs feature modules written as (bot: Bot<C>) => Bot<C>, with rich context types.
- updated dependencies
  - @yaebal/types@10.3.2

## 0.4.2

### patch changes

- 46920ed: resolve nested builders through toJSON before extracting multipart uploads, including rich document attachments.
- 1ebbb05: address replies to incoming ephemeral messages by ephemeral_message_id and keep their responses ephemeral.
- updated dependencies [ef37463]
- updated dependencies [a7a2d74]
  - @yaebal/types@10.3.1

## 0.4.1

### patch changes

- d3179c9: forward cancellation through typed api methods and interrupt retry backoff on abort. preserve cancellation errors during response parsing, resolve promised webhook reply parameters, and retain chat/topic routing for stopped message generation.
- fb30143: cancel initialization when polling stops, skip remaining startup callbacks and updates after stop, and serialize rapid restarts with the previous polling cycle. run shutdown callbacks once even on reentrant calls and finish cleanup when another callback fails.
- a742af7: reuse buffered upload streams within one api call so retries send the original bytes instead of empty files.

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
