---
name: yaebal-pick-plugin
description: Use when deciding which @yaebal/* package solves a problem in a yaebal bot — storage, keyboards, dialogs, rate limits, media, formatting, deployment, testing.
---

# picking the right @yaebal/* package

reach for a first-party package before writing infrastructure by hand. installable plugins are
wired with `bot.install(plugin())` — never `bot.use(plugin())`. some packages are libraries
(builders, functions) rather than plugins; those are noted below.

## state and storage

- `@yaebal/session` — typed `ctx.session`, loaded before handlers and saved after (dirty-checked).
  `bot.install(session({ initial: () => ({ count: 0 }) }))`.
- `@yaebal/sklad` — the `StorageAdapter` contract + adapters (memory, redis, sqlite, cloudflare
  kv, json file). not a plugin: pass an adapter to session/scenes/i18n/media-cache/ai.

## ui

- `@yaebal/keyboard` — `InlineKeyboard` / `Keyboard` builders. library, no install.
- `@yaebal/callback-data` — typed, compact `callback_data` schemas; routes via
  `bot.callbackQuery(namespace, handler)`. library, no install.
- `@yaebal/pagination` — paginated lists with ◀/▶ navigation that edit in place.
  `const list = pagination({...}); bot.install(list.plugin())`.

## multi-step dialogs (see the yaebal-flows skill)

- `@yaebal/scenes` — declarative step-by-step wizards, durable snapshots. `bot.install(scenes({...}))`.
- `@yaebal/conversation` — linear `await cv.waitFor(...)` async flows. `bot.install(conversation({...}))`.
- `@yaebal/prompt` — one-off question → handle the next message. `bot.install(prompt())`.

## commands and routing

- `@yaebal/commands` — one registry for handlers + the `/` command menu, with `sync()` to push
  the menu. `const cmd = commands().add(...); bot.install(cmd.plugin())`.
- `@yaebal/router` — file-based routing: load `routes/commands/*.ts` etc. via `loadRoutes(bot, dir)`.

## rate limits — two different problems

- `@yaebal/throttle` — outbound: queues your api calls under telegram's flood limits.
  `bot.install(throttle({ globalPerSec: 30 }))`.
- `@yaebal/ratelimiter` — inbound: drops update floods from spammy users.
  `bot.install(ratelimiter({ limit: 5, windowMs: 1000 }))`.
- `@yaebal/again` — `autoRetry()` re-runs failed api calls (429 `retry_after`, network errors).

## text and media

- `@yaebal/fmt` — `html` / `md` tagged templates → entities, auto-escaped interpolation, no
  `parse_mode`. library, no install.
- `@yaebal/rich` — telegram's block-tree rich messages (headings, tables, collages) via
  `sendRichMessage`. library, no install.
- `@yaebal/split` — send >4096-char text as multiple messages: `bot.install(splitter())` adds
  `ctx.sendLong` / `ctx.replyLong`.
- `@yaebal/files` — `bot.install(files())` adds `ctx.files.info/url/download`.
- `@yaebal/file-id` — parse/inspect `file_id` strings. library, no install.
- `@yaebal/media-group` — collect album parts into one handler call: `bot.install(mediaGroup(handler))`.
- `@yaebal/media-cache` — upload once, reuse `file_id`:
  `const cache = mediaCache(); bot.install(cache.plugin())`.

## product features

- `@yaebal/i18n` — typed translations, `ctx.t(...)`, plurals, locale persistence.
  `bot.install(i18n({ defaultLocale: "en", locales: { en, ru } }))`.
- `@yaebal/payments` — invoice builder + `onPreCheckout`/`onSuccessfulPayment` hooks (telegram
  stars and providers). `bot.install(payments({...}))`.
- `@yaebal/broadcast` — mass delivery with progress, retries and pause/resume:
  `await broadcast(bot.api, chatIds, text, options)`.
- `@yaebal/ai` — llm replies streamed into the chat: `bot.install(ai({ model }))` adds `ctx.ai`
  (see the yaebal-ai-features skill).

## running in production (see the yaebal-deploy skill)

- `@yaebal/runner` — concurrent long polling, ordered per chat: `const handle = run(bot, {...})`.
- `@yaebal/web` — webhooks on any runtime: `webhook(bot)`, `serve(bot)`, framework adapters,
  `sequentialize()` / `dedupe()` hardening.

## testing (see the yaebal-test-bot skill)

- `@yaebal/test` — `createTestEnv` + user/chat actors; no real HTTP ever. dev dependency.

## learn more

- https://yaebal.mom/docs/plugins/ — full catalog, one page per plugin
- https://yaebal.mom/docs/packages/
