# yaebal — architecture

full architecture: core, plugin contract, plugin catalog, filter-query naming,
and the `morda` subsystem (dialogs) + jsx/hooks. this document is a design spec —
it describes where we are going, not only what is already built. implemented items are marked ✅.

## 0. dna: what came from where

| idea | source | status |
|---|---|---|
| chainable `Composer`, context type accumulates through the chain (`derive`/`decorate`/`extend`) | gramio | ✅ done |
| filter queries `on("message:text")` with context type narrowing | grammy | ✅ partial |
| shortcut routers (`command`/`hears`/`callbackQuery`) on top of queries | grammy + gramio | planned |
| `api.call(method, params)` passthrough for not-yet-typed methods | puregram | ✅ done |
| `ctx.is("callback_query")` narrowing | puregram | ✅ done |
| request hooks `api.before/after` (retry, throttle, media-cache attach here) | puregram | ✅ done |
| media abstraction `MediaSource` (path/url/buffer/fileId) | puregram | ✅ done |
| decoupled type codegen from Bot API schema | puregram | ✅ `@yaebal/types` (359 objects + 180 methods) |

invariants (never break):

1. `Bot extends Composer` — don't fork the middleware engine, extend it.
2. `derive` — async, per-request. `decorate` — static, zero per-request cost. keep them separate.
3. any method that enriches the context must return an augmented type, never `any`.
4. plugin dependencies are explicit and type-checked, not implicit middleware ordering.

---

## 1. core (`@yaebal/core`)

### 1.1 composer — the engine ✅

koa-style chain with double-`next()` protection. methods:
`use` · `on(query, ...)` · `guard` · `derive` · `decorate` · `extend` · `toMiddleware`.
each enriching method returns `Composer<C & D>`. `Bot` overrides them to return `Bot`
instead of a bare `Composer` (lifecycle methods stay accessible through the chain). ✅

added: **`install(plugin)`** — see §1.6.

### 1.2 filter queries — event system (the centre of everything)

grammy-style syntax `L1:L2:L3`. the beloved `message:text` is `L1:L2`.

```
L1  update type     message · edited_message · channel_post · callback_query ·
                    inline_query · poll · poll_answer · my_chat_member ·
                    chat_member · chat_join_request · message_reaction · ...
L2  content         on message:  text · caption · photo · video · document · audio ·
                      voice · sticker · animation · location · contact · dice ·
                      entities · new_chat_members · left_chat_member · pinned_message
                    on callback_query:  data · game_short_name
                    on inline_query:  query
L3  sub-content     on message:entities:  url · mention · hashtag · bot_command ·
                      email · phone_number · bold · italic · code · spoiler · custom_emoji
```

shortcuts:
- `:text` — any update with text (`message` / `edited_message` / `channel_post`).
- `::url` — any update containing a `url` entity.
- array: `on(["message:text", "edited_message:text"], handler)`.

**type narrowing.** `Filtered<C, Q>` writes non-optional fields into the context per query:

| query | context receives |
|---|---|
| `…:text` / `…:caption` | `text: string` |
| `…:data` / `callback_query` | `callbackQuery: CallbackQuery` |
| `…:photo` | `message: Message & { photo: PhotoSize[] }` |
| `…:video` / `…:sticker` / `…:audio` / `…:voice` / `…:document` / `…:animation` / `…:contact` / `…:location` / `…:poll` / `…:dice` / `…:venue` / `…:video_note` / `…:game` / `…:invoice` / `…:successful_payment` | `message: Message & { <field>: <type> }` |
| `…:entities:url` | `entities: MessageEntity[]` |

✅ `text`/`caption`/`data`/media content fields (photo, video, sticker, …) are implemented now.
**lazy default for anything else: an unknown query doesn't narrow the type (returns `C`) but still
matches at runtime** via `checkField`/`matchQuery`. no crashes on unrecognised fields.

runtime: `matchQuery(ctx, "message:text")` → `head=message` is compared to `ctx.updateType`,
tail `text` is checked via `checkField`. ✅

### 1.3 shortcut routers — sugar on top of queries

thin wrappers; each simply pushes middleware with a `matchQuery` check. not a new subsystem.

| method | equivalent query | adds to ctx | source |
|---|---|---|---|
| `command("start", h)` | `message:text` where text starts with `/start` | `ctx.command`, `ctx.args` | grammy + gramio |
| `hears(/rx/ \| "str", h)` | `message:text\|caption` + match | `ctx.match` | puregram hear + grammy |
| `callbackQuery(data \| /rx/ \| CallbackData, h)` | `callback_query:data` + match | `ctx.match` | grammy + gramio |
| `reaction("👍", h)` | `message_reaction` | — | grammy |
| `chatType("private", h)` | guard on `ctx.chat.type` | — | grammy |
| `inlineQuery(/rx/, h)` | `inline_query:query` + match | `ctx.match` | grammy |

`hear` from puregram is **not** a separate plugin — it's `bot.hears` in core.

### 1.4 context ✅

base update wrapper. getters: `message` (msg/edited/channel) · `callbackQuery` ·
`from` · `chat` · `text` (text ?? caption). methods: `is(type)` (puregram narrowing) ·
`send` · `reply` · `answerCallbackQuery`. accepts `string | FormatResult` (entity formatting).
plugins add fields via `derive`/`decorate`; composer tracks the types.

✅ media shortcuts in core: `ctx.sendPhoto` / `ctx.sendDocument` (accept `MediaSource | string`).

### 1.5 api — client + extension points

current ✅: proxy client. `api.getMe()` ≡ `api.call("getMe")`, unknown methods are forwarded
transparently (puregram idea — a new Bot API method works before types are regenerated).
`TelegramError` on `ok: false`.

added (critical — half the plugin catalog depends on this):

**request hooks** (puregram):
```ts
api.before((method, params) => params | void)   // throttle, media-cache, media upload rewrite
api.after((method, result) => result | void)     // hydrate
api.onError((method, error, retry) => ...)        // again (auto-retry), logging
```
implementation — arrays of interceptors inside `createApi`, run around `call`.
without this, `again`/`throttle`/`media-cache` would have to be baked into core one by one —
instead they are just subscribers.

**media abstraction** `MediaSource` (puregram) — discriminated union:
```ts
MediaSource.path("./a.jpg") | .url("https://…") | .buffer(buf) | .fileId("AgAC…") | .stream(rs)
```
the api layer knows how to turn each variant into `multipart/form-data` or a string
(`file_id`/url). `@yaebal/files` (upload) and `@yaebal/media-cache` (cache) are built on this.

### 1.6 plugin contract (invariant #4)

a plugin is a function; dependencies are expressed by **argument type**, not a registry:

```ts
type Plugin<In extends Context = Context, Out extends object = {}> =
  <C extends In>(composer: Composer<C>) => Composer<C & Out>;

type BotPlugin<In extends Context = Context, Out extends object = {}> =
  <C extends In>(bot: Bot<C>) => Bot<C & Out>;

// Composer:
install<Out extends object>(plugin: Plugin<C, Out>): Composer<C & Out>;

// Bot:
install<Out extends object>(plugin: Plugin<C, Out>): Bot<C & Out>;
install<Out extends object>(plugin: BotPlugin<C, Out>): Bot<C & Out>;
```

the compiler catches missing dependencies:
```ts
const session:  Plugin<Context, { session: Session }>;
const tolmach: Plugin<Context & { session: Session }, { t: TFn; changeLanguage(l): void }>;

bot.install(tolmach);                  // ❌ ts: no session in context
bot.install(session).install(tolmach); // ✅ order is guaranteed by the In type
```

`Plugin` — for extending `Composer`; `BotPlugin` — when `bot.api` or lifecycle hooks
(`onStart`/`onStop`) are needed. no runtime dependency graph, no `Plugin` class, no DI container.
a named runtime registry ("plugin X is not installed" as a human-readable error) — **yagni**,
add it if runtime diagnostics are ever needed.

### 1.7 bot — lifecycle ✅

`extends Composer`. long-polling loop (`getUpdates` with offset, retry on network errors),
`onStart` / `onStop` / `onError` / `start` / `stop`. `derive`/`decorate`/`extend` are overridden
to return `Bot<…>`.

✅ webhook mode: `bot.handleUpdate(update)` — entry point; plus `webhookCallback(bot)`
(fetch-style `Request→Response`, for Bun/Deno/Workers) and `nodeWebhookCallback(bot)` (node http).
shared `toMiddleware` with polling (memoised; register middleware before the first call).

### 1.8 types (`@yaebal/types`) — decoupled codegen, custom scraper ✅

`scripts/lib/parse-schema.mjs` — custom parser for `core.telegram.org/bots/api` (no dependency
on third-party schemas like ark0f/tg-bot-api or @gramio/schema-parser) → writes `schema.json`
→ `scripts/generate.mjs` generates `src/telegram.ts`: **359 objects + 180 methods** (Bot API 10.1)
with jsdoc, plus `BotApiMethods` and per-method `*Params` interfaces.
the `@yaebal/types` package version equals the Bot API version it was generated from (`10.1.3`).
manual regen — `pnpm --filter @yaebal/types update-schema`. auto-update —
`.github/workflows/update-bot-api-types.yml`: checks live docs daily, on a new version
regenerates `@yaebal/types` + `@yaebal/contexts` and opens a pr (`feat(types): update
to bot api vX.Y.Z`); merge runs the usual ci.yml → release.yml and publishes the package.
core still has its own minimal handwritten slice (migrating core to `@yaebal/types` — later).

### 1.9 contexts (`@yaebal/contexts`) — full autogen (killer feature) ✅

the generator produces **a class per update type** (`MessageContext`, `CallbackQueryContext`, …,
26 classes) from the schema: the interface merges the payload (`interface MessageContext extends Message`),
the constructor spreads fields onto the instance (`ctx.text`/`ctx.photo` directly, gramio-style),
and **shortcut methods are derived automatically** — based on which ids the context carries.
provider table (`chat`→`chat_id`/`from_chat_id`, `message_id`, `from`→`user_id`, query `id`)
× all Bot API methods → `reply`/`send*`/`editText`/`delete`/`pin`/`forward`/`answer`/`ban`/…
with `Omit<XParams, filled>` signatures from `@yaebal/types`. add a method to Bot API →
regen → contexts get it. unlike gramio where contexts are written by hand — here they are
**fully generated**.

---

## 2. plugin catalog

naming follows the project style. dependency = what must be in the context first.
source = where the idea came from.

### core ecosystem (first priority)

| package | what it does | depends on | attaches via | source |
|---|---|---|---|---|
| **`@yaebal/again`** ✅ | awaited retry on 429 `response_parameters.retry_after` + transient 5xx, no error text parsing | — | `api.onError` | grammy auto-retry, @gramio/auto-retry |
| **`@yaebal/session`** ✅ | session v2 — typed state: dirty-check via snapshot (no proxy), `lazySession`, multi-sessions (`key`), `keyBy` presets + composite keys, `clearSession`/`saveSession`, `ttl()` fields, versioned migrations, sliding-ttl via `touch`. storage contract lives in `sklad` (re-exported for compatibility) | `sklad` | `use` → `ctx.session` | all three + grammy lazy/enhanceStorage |
| **`@yaebal/sklad`** ✅ | storage contract (`StorageAdapter` + `has`/`touch`) and zero-dep adapters: memory (ttl/lru/clone), redis, sqlite, cloudflare kv, json-file (`/file`). clients typed structurally | — | — | grammy storages |
| **`@yaebal/keyboard`** ✅ | inline/reply keyboard builder (pure helper) | — | export | @gramio/keyboards |
| **`@yaebal/callback-data`** ✅ | typed `callback_data` (pack/unpack + `.pattern` for `callbackQuery`) | — | export | @gramio + @puregram callback-data |
| **`@yaebal/link-preview`** ✅ | fluent builder for `link_preview_options` (url, prefer small/large media, show above text, disable) | — | export | native ops plugin |
| **`@yaebal/guards`** ✅ | reusable `bot.guard()` predicates: `isPrivate`/`isGroup` adapted from `filters`, `isAdmin`/`hasMembership`/`hasPermission` via live `getChatMember`; every predicate also fits `Filter<Context>` so it composes with `filters`' `and`/`or`/`not` | `filters` | `guard()` / `filter()` | grammy/gramio hand-rolled admin checks |
| **`@yaebal/payments`** ✅ | typed, provider-agnostic invoice builder (`.stars()` / `.provider(token, currency)` / `.subscription()`), `onPreCheckout`/`onSuccessfulPayment` hooks that answer `pre_checkout_query` for you, `cancelSubscription`/`reactivateSubscription` over the Stars Subscription API (Bot API 7.6+) | — | `on("pre_checkout_query")` / `on("message:successful_payment")` | grammy/gramio have no dedicated payments plugin — native ops plugin |
| **`@yaebal/mini-app`** ✅ | telegram Mini Apps protocol, no UI framework: `ctx.miniApp.validate(initData)` — HMAC-SHA256 hash check against the bot token via `crypto.subtle` (no `node:crypto`, runs on edge) — plus a typed `initData` parser (`user`/`chat`/`start_param`/`auth_date`/…), `parseWebAppData` for `message.web_app_data`, and `webAppInfo`/`webAppUrl` / `miniAppLink` (`t.me` direct-link) url builders | `types` | `decorate` → `ctx.miniApp` | grammy/gramio have no dedicated mini-app plugin — native ops plugin |

### ux

| package | what it does | depends on | source |
|---|---|---|---|
| **`@yaebal/morda`** ✅ | dialogs: windows → message, callback routing, navigation stack (`start`/`push`/`replace`/`back`), stale-press gate | `session`, `callback-data`, `keyboard` | @gramio/dialogs |
| **`@yaebal/morda/jsx`** ✅ | jsx runtime + hooks (`useState`/`useEffect`/`useNavigation`/`useUser`/`useSession`/`useTranslation`) on top of morda, subpath export | `morda` | @gramio/jsx + templatio-style hooks |
| **`@yaebal/scenes`** ✅ | durable wizards: firstTime steps, typed state/params, `ask()` (standard-schema), navigation `go`/`next`/`previous`, sub-scenes, `onEnter`/`onLeave(reason)`, passthrough+passCommands, ttl, snapshot self-heal. key `chat:user`. sequential-safe (no suspended promises) | `sklad` | @gramio/scenes, @puregram/scenes |
| **`@yaebal/prompt`** ✅ | `ctx.prompt(q, handler)` — ask a question, handler catches the next message (callback-style, in-memory) | — | @gramio/prompt, @puregram/prompt |
| **`@yaebal/files`** ✅ | `ctx.files.info/url/download` + lazy `FileDownload` (bytes/text/json/blob/stream/toFile), strategies for local Bot API server (disk/rewrite/url), standalone `createFiles(api)`. upload — in core via `MediaSource` | — | @gramio/files, grammy files |
| **`@yaebal/file-id`** ✅ | `file_id`/`file_unique_id` parser/serialiser (TL + RLE + base64url): dc id, access hash, photo size source, `toUniqueId()`. zero deps, pure js | — | @puregram/file-id, tdlib |
| **`@yaebal/media-cache`** | media cache — `file_id` instead of re-uploading | — | `api.before` | @gramio/media-cache |
| **`@yaebal/media-group`** | media group — collect an album from a batch of updates | — | | @gramio/media-group |
| **`@yaebal/auto-answer`** ✅ | auto-clears the callback-query spinner: immediate (fire on arrival, non-blocking) or deferred (fallback only if nothing answered) mode, filter, dynamic per-update params, `onAnswer`/`onError` — never double-answers, never throws | — | `on("callback_query")` | @gramio/auto-answer-cbq |
| **`@yaebal/typing`** ✅ | `ctx.typing(fn, opts?)` keeps `sendChatAction` alive on an interval for the duration of an async call (LLM/API latency), clears on settle; overloads the existing `ctx.typing(action?)` one-off sugar so both forms compose | — | `derive` | native ops plugin |

### i18n / infra (yagni until needed)

| package | what it does | depends on | source |
|---|---|---|---|
| **`@yaebal/i18n`** ✅ | `ctx.t` + `changeLanguage`, locale per-chat, fallback to default locale; feeds `useTranslation` | `session` | @gramio/i18n, grammy i18n |
| **`@yaebal/throttle`** ✅ | outbound scheduler: global/private/group buckets, per-method limits, priority queue, shared storage, cancel/abort, metrics, retry_after feedback | — | puregram throttler, grammy transformer-throttler |
| **`@yaebal/ratelimiter`** ✅ | anti-spam for incoming updates: drops updates over the limit per time window (per-user) | — | grammy ratelimiter, @gramio/rate-limiter |
| **`@yaebal/cache`** ✅ | `ctx.cache.get/set/wrap` — ttl memoization for api calls and arbitrary data, in-flight dedup for concurrent misses (e.g. `getChat`/`getChatMember`) | `sklad` | — |
| **`@yaebal/feature-flags`** ✅ | `ctx.flags.isEnabled(key)` — percentage/`userIds`/date-window rollout rules (OR of rules, AND within a rule), deterministic fnv-1a bucketing, per-bucket overrides persisted via `sklad`, `FlagProvider` adapters for LaunchDarkly/GrowthBook (structurally typed, no SDK dep) | `sklad` | — | native ops plugin; cf. unleash/launchdarkly/growthbook sdks |
| **`@yaebal/router`** ✅ | file-based routing (storona-style): `loadRoutes(bot, dir)`, `commands/` + `on/`, dot→`:` in names | — | @gramio/autoload + storona |
| **`@yaebal/toml`** ✅ | declarative toml routes: commands, hears, message filters, callback queries and handler registry | — | config-driven routing |
| **`@yaebal/pagination`** ✅ | pagination: array/lazy sources (`offset/limit` + optional `count`), element buttons with `onSelect`, typed payload, `view`/`edit`/`button`, ownership filter, not-modified/48h/forged data handling | `keyboard`, `callback-data` | @gramio/pagination |
| **`@yaebal/split`** | split long messages into parts | — | | @gramio/split |
| **`@yaebal/onboarding`** ✅ | onboarding — declarative tutorials, `ctx.onboarding.<id>` | `keyboard` | @gramio/onboarding |
| **`@yaebal/broadcast`** ✅ | typed broadcast jobs: storage adapter, worker, retry, rate limit, skipped recipients, progress, pause/resume/cancel, events | `core`, `types` | native ops plugin |
| **`@yaebal/analytics`** ✅ | `ctx.track(event, properties)` — structurally-typed adapters (posthog, plausible, sqlite, clickhouse, console); `createAnalytics()` is a standalone collection point other plugins' event streams (e.g. `broadcast`'s `onEvent`) can feed into via `fromEvent` | — | native ops plugin |
| **`@yaebal/audit-log`** ✅ | structured logging of every incoming update and outgoing api call: configurable formatters (json/text), filters, sampling rate, pluggable sinks (console + structural `AuditSink`), direct `{ use, api }` install form (`use` + `api.before`/`after`/`onError`) | — | native ops plugin |
| **`@yaebal/cron`** ✅ | typed cron jobs: declarative schedule (cron expression / `@alias` / interval), overlap control, cooperative timeouts, `bot.onStart`/`onStop` wiring with graceful drain | — | native ops plugin |
| **`@yaebal/commands`** | command/scope management | — | | grammy commands |
| **`@yaebal/runner`** ✅ | concurrent update dispatch with a per-key scheduler (default key: chat id) — same-chat updates stay strictly ordered, different chats/keys run concurrently up to `concurrency` | — | grammy runner |

### dependency graph (core)

```
sklad ─→ session ─→ i18n
     │          ├→ scenes
     │          ├→ onboarding
     │          └→ morda ─→ morda/jsx
     ├→ cache
     └→ feature-flags
callback-data ───────────┘
keyboard ──→ pagination
throttle ─→ broadcast
again · prompt · files · media-cache · media-group · auto-answer · ratelimiter · runner · analytics · audit-log · cron · payments · mini-app  (no session dependency)
```

---

## 3. `morda` + jsx/hooks — react-for-telegram

### the key insight

**one `<Screen>` = one message.** therefore there is no need for a reconciler/fibres/tree diffing.
render = walk the tree once → `{ text, keyboard }`. re-render after `setState` =
rebuild, compare `(text, markup)` with the previous → `editMessageText` if changed.
routing anchor — `id` on a button: `callback_data = pack(frameId, button.id)` (via `callback-data`).

### `morda` engine (builder api, no jsx)

- **widgets:** `Screen`/`Window`, `Column`/`Row`/`ButtonRow`, `Button`, `SwitchTo` — node objects, no logic.
- **render:** flatten → text nodes into `text`, buttons into `InlineKeyboardMarkup`, each gets a `callback_data`.
- **routing:** `on("callback_query:data")` → unpack → find frame → re-render → find button by id → `onClick`.
- **navigation:** frame stack. `start`/`push`/`replace`/`back`/`reset`. frame = `{ screenId, hookState[], mounted, prevDeps }`. lives in `session` → survives process restarts.
- **frame state:** `useState` serialised into the frame → values **must be json-serialisable** (documented constraint).

### `morda/jsx` — jsx + hooks

jsx runtime (~20-30 lines): `jsx(type, props)` returns a `morda` widget node.
intrinsics → widget constructors, functional components → called with props. `jsxImportSource` in tsconfig.

hooks — thin facades over the context/stack (react rules: call unconditionally, fixed order).
they **do not import** plugins as a package — they read `ctx` (soft dependency, invariant #4 catches it via type):

| hook | what | from |
|---|---|---|
| `useState` | slot in frame's `hookState[]` by index; setState → frame is dirty → re-render | jsx runtime |
| `useEffect(fn, deps)` | after commit; mounts once (`mounted` flag), `deps` compared by json equality | jsx runtime |
| `useNavigation` | `{ push, replace, back, reset }` | `morda` stack |
| `useUser` | `ctx.user` | core derive |
| `useSession` | `ctx.session` (`.get/.set`) | `session` |
| `useTranslation` | `{ t, changeLanguage }` | `i18n` |

### lifecycle example (`LangSelectScreen`)

1. `start("lang")` → new frame, render, hooks read empty state.
2. commit: `useEffect([],…)` fires once → `upsertUser` → `session.set("userDbId")`.
3. `<Button id="ru">` pressed → unpack callback → rehydrate frame → **re-run component**
   (hooks read saved state, effect does NOT fire) → find button `ru` → `onClick` →
   `setUserLanguage` + `changeLanguage` + `replace(HomeScreen)`.
4. `replace` → new frame → re-render → `editMessageText`.

### hard limits (ceilings)

- state serialisation: `useState` with json-only values.
- hook rules: runtime assert "hook count == previous render", fail with a clear message.
- async `onClick` + batching: multiple `setState` calls per handler → one `editMessageText`.
- effect idempotency on restart between mount and press — `mounted` flag in session.

### yagni (not doing)

concurrent mode, suspense, context api (built-in hooks are enough),
key-based list reconciliation (keyboard is fully re-rendered), multi-message screen.

---

## 4. filter query cheat-sheet

```ts
// L1 — update type
bot.on("message", h)
bot.on("edited_message", h)
bot.on("callback_query", h)
bot.on("inline_query", h)
bot.on("my_chat_member", h)

// L1:L2 — content
bot.on("message:text", h)          // ctx.text: string
bot.on("message:photo", h)         // ctx.message.photo
bot.on("message:caption", h)
bot.on("callback_query:data", h)   // ctx.callbackQuery: CallbackQuery
bot.on("inline_query:query", h)

// L1:L2:L3 — sub-content
bot.on("message:entities:url", h)
bot.on("message:entities:bot_command", h)

// shortcuts
bot.on(":text", h)                  // any update with text
bot.on("::url", h)                  // any update with a url entity
bot.on(["message:text", "edited_message:text"], h)

// sugar (on top of queries)
bot.command("start", h)             // ctx.command, ctx.args
bot.hears(/hello/i, h)             // ctx.match
bot.callbackQuery(myData, h)        // ctx.match (via callback-data)
bot.reaction("👍", h)
bot.chatType("private", h)
```

---

## 5. build order

**m0 — core (extend existing)**

- request hooks `api.before/after/onError` in `createApi`
- `install(plugin)` + `Plugin` type
- complete `Filtered` mapping for common queries + shortcut routers (`command`/`hears`/`callbackQuery`)

**m1 — plugin foundation**

- ✅ `session` — storage contract and `MemoryStorage` extracted into ✅ `sklad` (memory/redis/sqlite/cloudflare kv/file), session re-exports them for backwards compatibility
- ✅ `keyboard` (keyboard builder) + `callback-data` (typed callback_data, `.pattern` integrates with `bot.callbackQuery`)
- `again` (on `api.onError`) — also verifies the monorepo pulls in a second package correctly

**m2 — ux flagship**

- ✅ **m2a** `morda` (builder api): windows + render + callback routing + navigation stack + stale-press gate. `button`/`switchTo`/`back` helpers, `ctx.dialog`
- ✅ **m2b** `morda/jsx`: jsx runtime + hooks. "one screen = one message → no reconciler"; `setState` → `editMessageText` in place; hook state in frame slots, evicted on screen close; component navigation (`push(HomeScreen)`). screen example works.

**m3 — soft context dependencies**

- ✅ `i18n` → activates `useTranslation` (per-chat locale, fallback, `{placeholder}` interpolation)
- ✅ `scenes` (durable wizards: firstTime steps, typed state/params, `ask()`, navigation, sub-scenes, passthrough/passCommands, ttl) + ✅ `prompt` (`ctx.prompt`, callback-style). both don't block the sequential loop (unlike await-prompt which would require concurrent dispatch)

**m4 — infra on demand (yagni until needed)**

- ✅ `router` · `throttle` · `files` (+ core `api.fileUrl`) · `ratelimiter` · `broadcast`
- ✅ `web` — operator panel (view chats / reply from the browser): `recorder` plugin + `PanelStore` + `panelHandler` (fetch). webhooks moved to core (`webhookCallback`)
- ✅ `media-group` · `split` · `commands` · `pagination` · `media-cache` (caches `file_id` via explicit keys — correct under concurrency)
- ✅ codegen `@yaebal/types` (359 objects + 180 methods from schema, generator `scripts/generate.mjs`)
- ✅ `runner` — per-key scheduler (default key: chat id) serializes same-chat updates so they never
  overlap through the middleware chain; different chats/keys run concurrently up to `concurrency`.
  session's load-mutate-save cycle is therefore race-free under the default `sequentializeBy` —
  only overriding it to a coarser key (or dispatching updates outside `run()`) reintroduces a race,
  since neither `session` nor `sklad`'s `StorageAdapter` has optimistic locking/CAS.
- remaining: `onboarding` (niche)

**type codegen** (`@yaebal/types`) — runs in parallel, does not block m0–m3.

builder api and jsx are two frontends to the same `morda` engine, so jsx can be deferred without rewriting anything.
