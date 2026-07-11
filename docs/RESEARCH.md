# puregram vs grammy vs gramio — analysis for yaebal

> goal of this document: understand how each of the three libraries is built, what each does well,
> and what is worth borrowing when designing a new telegram bot api framework in typescript.
>
> date: 22 june 2026. versions and metrics are current as of that date (see §6).

---

## tl;dr

| | **grammy** | **puregram** | **gramio** |
|---|---|---|---|
| what it is | mature **framework** | modern **sdk / client** | new **type-safe framework** |
| version | `1.43.0` | `3.6.0` | `0.9.0` |
| downloads/month (npm) | ~15.4 m | ~3.6 k | ~11.3 k |
| author | KnorpelSenf | starkow (j++ team) | kravetsone |
| licence | MIT | MPL-2.0 | MIT |
| core abstraction | `Composer` + middleware + filter queries | `Telegram` + codegen'd update classes + typed plugins (`.extend()`) + hooks | chainable `Composer` with type accumulation |
| headline feature | huge ecosystem + filter queries | thin honest sdk + composable filters + request interception | types flow through the whole chain + codegen |
| best reference for | ecosystem, update filtering, runtime-agnostic build | codegen'd update classes, request hooks, typed plugin dependency resolution | dx, `.derive/.decorate/.extend`, auto-types, `format` |

short version: **grammy** — for maturity and ecosystem; **gramio** — for modern type-safe design and dx;
**puregram** — for the minimalist sdk approach and clean update/hook/plugin model.
for yaebal the sensible move is to take the gramio-style skeleton, the grammy filter-query system,
and the puregram ideas of decoupled codegen + codegen'd update classes + typed plugin dependencies.

---

## 1. grammy

### what it is

the most popular and mature ts framework for telegram bots (successor to telegraf, but rethought).
goal — "easy for beginners and scalable". works on node.js, deno and in browser/cloudflare workers
(via a `grammy/web` web bundle).

### architecture and api design

- **`Bot extends Composer`.** everything is built around `Composer` — a koa-style middleware
  pipeline (`(ctx, next) => ...`). `Bot`, `Composer`, routers — all composers, composable with each other.
- **single `Context` object.** unlike puregram, no class hierarchy per update type — one `Context`
  extended not by classes but by **flavors** (pure type mixins: `Context & SessionFlavor<S>`,
  `HydrateFlavor`, etc.). behaviour extension happens through middleware and **transformers** on `bot.api`.
- **filter queries — the killer feature.** a mini query language for updates directly in `.on()`:
  ```ts
  bot.on("message:text", ...)
  bot.on("message:entities:url", ...)
  bot.on("callback_query:data", ...)
  bot.on(":photo", ...)            // any message/post with a photo
  bot.on("message").filter(predicate, ...)
  ```
  type-safe: after `message:text` the handler gets `ctx.msg.text` as `string`.
  neither puregram nor gramio offer this level of expressive filtering out of the box.
- **transformer api.** intercept and modify any Bot API call via `bot.api.config.use(transformer)` —
  `auto-retry`, `throttler`, `hydrate`, etc. are all built on this.
- **runtime-agnostic build.** sources target deno and are compiled to node via `deno2node` —
  hence clean multi-runtime support and the web bundle.

### ecosystem and plugins

the richest of the three. official plugins (`@grammyjs/*`):
- **conversations** — step-by-step dialogs as ordinary async code (no explicit scene machines), very powerful.
- **menu** — interactive inline menus with navigation.
- **runner** — concurrent update processing with backpressure (for high-load bots).
- **hydrate** — methods directly on objects (`ctx.msg.editText(...)`).
- **auto-retry, transformer-throttler, ratelimiter** — resilience and rate limiting.
- **i18n / fluent**, **emoji**, **parse-mode**, **router**, **stateless-question**, **chat-members**, **files**.
- **storage adapters** for sessions (redis, mongo, postgres, deno kv, files, free storage services).

plus: documentation at grammy.dev is considered the gold standard for completeness; large community and project templates.

### performance

- `runner` provides sequential-by-chat concurrency + backpressure — for thousands of updates per second.
- minimal dependencies (`node-fetch`, `debug`, `abort-controller`), unpacked ~1.3 mb.
- the web bundle enables running on edge (cf workers) with minimal cold start.

### dx and type safety

- very strong filtering + type narrowing via filter queries.
- flavors compose well, but with many plugins the `Context` type grows with manual intersections
  (`type MyContext = Context & A & B & C`), which is slightly less ergonomic than gramio's chain accumulation.
- documentation and community — the best onboarding in the market.

**grammy summary:** the reference for maturity. taken as the model for **update filtering,
transformer-layer api, ecosystem, and runtime-agnostic build**.

---

## 2. puregram

### what it is

"powerful and modern telegram bot api sdk for node.js and typescript". in spirit — not a heavy
framework but a **clean sdk/client** with pleasant, codegen'd updates. the authorial style is
deliberately informal (lowercase readme, memes); author is starkow under the j++ team. inspired by
`vk-io` by negezor — visible in the update/plugin architecture.

as of **v3** (the current default branch on github — the `lord` branch, which used to track v2, has
since been overwritten with v3; v2 is frozen, and packages dropped in v3 have had their source
removed from the tree, though the published `puregram@2.x` npm tarballs stay put) the library was
substantially rewritten: `Context` is gone, `telegram.updates.on(...)` became per-kind methods
(`telegram.onMessage`, `telegram.onCallbackQuery`, …), and plugins became a first-class,
dependency-resolved concept via `.extend()`. the readme is explicit that there is **no migration
codemod** from v2 — "write the migration by hand". this section describes v3.

### architecture and api design

- **`Telegram` instance.** entry point: `Telegram.fromToken(token)` or `new Telegram({ token, ... })`.
  updates arrive via `telegram.onMessage(...)` / `telegram.onCallbackQuery(...)` / … (one method per
  update kind — a nonexistent kind is a compile error) or the catch-all `telegram.onUpdate(...)`;
  transport is `telegram.startPolling()` or `telegram.startWebhook(...)` / per-framework adapters
  (express, fastify, koa, hono, h3, elysia, raw `node:http`, `webAdapter` for edge runtimes).
- **updates are a codegen'd class hierarchy, not "contexts".** v2's `Context` classes are gone
  entirely. every update kind is now a discriminated subclass of an `Update` union, codegen'd from
  the bot api schema: primitive fields are direct getters (`message.text`), nested objects are
  lazy/memoized wrappers (`message.chat`), and per-kind shortcuts are attached as methods
  (`message.send(...)`, `callbackQuery.answer(...)`). type narrowing is still via type guards:
  ```ts
  if (update.is('callback_query')) { /* update: CallbackQueryUpdate */ }
  if (message.hasText()) { /* message.text: string */ }
  ```
- **filters replace v2's mixins.** a filter is a named, composable, type-guarded predicate over an
  update (`filters.hasText`, `filters.kind.message`, `command`, `regex`, `chat`, `from`, …), composed
  with `and`/`or`/`not` (factory form, chained `.and()`/`.or()`, or a raw boolean — all interoperable)
  and passed as the first arg to `telegram.on<Kind>(filter, handler)` to narrow the handler's
  argument. custom filters are `defineFilter(name, predicate)`; declaring `kinds: [...]` on one gives
  the dispatcher a free fast-path.
- **four ways to call the api:** `telegram.api.sendMessage({...})` (raw, schema-typed, every
  method), `telegram.send(chatId, text)` (curated positional shortcut), `message.send(...)`
  (per-update shortcut, chat id auto-filled), and `telegram.api.call('someBetaMethod', {...})`
  (untyped escape hatch for methods not yet generated). every wrapped accessor still exposes `.raw`
  for the bare bot-api payload.
- **hooks — request interceptors, now six stages.** `onBeforeRequest` → `onRequestIntercept` →
  `onApiCall` (new in v3: an *around* hook wrapping the actual fetch, for timing/tracing/retry,
  zero-cost when unregistered) → `onResponseIntercept` → `onAfterRequest`, plus `onError`.
  registered per-stage via `telegram.useHook(stage, fn)` (singular — v2's bulk `useHooks(...)` is
  gone). `telegram.use(fn)` is sugar for `useHook('onUpdate', fn)` and is priority-aware
  (`'high'`/`'normal'`/`'low'`) — plugins like `@puregram/flow`'s `waitFor` claim `'high'` to
  intercept before user handlers.
- **plugins are first-class, with typed dependency resolution.** `telegram.extend(plugin)` is
  chainable and narrows `Telegram<Ext>`'s type at every step — no `declare module 'puregram'`
  augmentation needed. `createPlugin({ name, install, dependsOn? })` defines one; the installer
  topologically resolves `dependsOn`, throws `PluginCycle`/`PluginMissingDep` on a bad graph, and
  `PluginConflict` on a duplicate `name`. soft (adapt-if-present) deps use `telegram.has('name')`
  without widening the type. **this directly fixes v2's implicit plugin-ordering footgun** (see §5).
- **media abstractions.** `MediaSource` (path/url/fileId/buffer/stream/file/arrayBuffer/bytes/
  base64/text/json/local) and `InputMedia`/`MediaGroup` factories for single items and whole
  albums — unchanged in spirit from v2, with more source kinds and a dedicated album helper.
- **decoupled codegen, now a real workspace.** bot api types/methods live in `@puregram/api`
  (`workspace:~` inside the `puregram` yarn-workspaces monorepo, not a pinned external semver range
  like v2's `~10.1.4`) — still importable standalone, still versioned separately from the core.

### ecosystem and plugins

official `@puregram/*` (all now plugins installed via `.extend()`, all in the same monorepo):
- **session** — persistent session plugin.
- **scenes** — multi-step scene/wizard plugin.
- **flow** — conversational primitives (`waitFor`, `prompt`, `collectMediaGroup`, persistent flows) —
  **replaces v2's standalone `prompt` package**.
- **callback-data** — typed, binary-packed callback-data builder + dispatch-ready filter.
- **markup** — tagged-template entity-aware text formatting.
- **rich** — safe html/markdown emission (templates + block builders), no raw string concatenation.
- **media-cacher** — transparent `file_id` caching.
- **rate-limit** — per-user fixed-window rate limiting.
- **file-id** / **inline-message-id** — parse/inspect/serialize the respective opaque telegram ids.
- **stream** — turns an `AsyncIterable<string>` (e.g. llm output) into animated `sendMessageDraft`
  previews.
- **throttler** — outbound rate-limit middleware for telegram's own ~30rps limits.
- **storage** — shared `KVStorage`/`TtlStorage` interfaces + implementations (in-process, redis, sqlite).
- **test** — actor-driven test framework for puregram bots.
- **utils** — small standalone utilities (webapp initData validation, deep links, slot-machine decode).
- **dropped in v3: `hear`** (now userland — a one-line `if` or a `command`/`regex` filter) **and
  `prompt`** (folded into `flow.prompt(...)`).
- unofficial: `nestjs-puregram` for nestjs.

v2's middleware-ordering footgun (`session()` had to run **before** `hear`/`scenes`, otherwise
`Cannot read property '__scene' of undefined`) is gone in v3 — plugins declare `dependsOn` and the
installer resolves and validates the order itself, throwing on cycles/missing deps instead of
failing at runtime with an opaque error.

### performance

- thin layer over `fetch`/undici, no heavy runtime — minimal overhead.
- esm-only, `node >= 22` — modern baseline, cuts off older environments (unchanged from v2).
- still no claimed multi-runtime (bun/deno) story in the readme — focus stays on node.js.
- new built-in resilience knobs: `retryOnFloodWait` (429 auto-retry, optional exponential backoff on
  5xx/network too), polling `concurrency` cap + `sequentializeBy` (per-key FIFO dispatch, explicitly
  grammy-runner-inspired), `dedupeUpdates` (drop recently-seen `update_id`s).

### dx and type safety

- codegen'd update classes + filters read at least as well as v2's context/guard model, and the
  filter system is strictly more composable (`and`/`or`/`not`, chaining, custom `defineFilter`) than
  v2's fixed mixin set.
- `Telegram<Ext>` generic + `.extend()` type narrowing means plugin-added properties
  (`message.session`) are visible with zero manual augmentation — closer to gramio's chain-
  accumulation story than v2 was.
- still an informal documentation style; smaller community and downloads than grammy/gramio →
  fewer ready-made recipes on stackoverflow/in chats.
- **no migration path from v2** — by the author's own admission, hand-migration only.

**puregram summary:** v3 is a rewrite, not a patch — `Context` is gone, updates are a codegen'd
class hierarchy, filters replace mixins, and plugins gained typed dependency resolution. taken as
the model for **codegen'd per-kind update classes + type guards, request hooks (now with an
`onApiCall` around-hook), media abstractions (`MediaSource`/`InputMedia`/`MediaGroup`), a decoupled
codegen package, and a typed, dependency-resolved plugin system**.

---

## 3. gramio

### what it is

the youngest and most "modernly designed" of the three. tagline — "powerful, extensible and really type-safe".
works on node.js, bun and deno with no config changes. author — kravetsone. still at version `0.9.0`
(pre-1.0), but the api is already rich and well-considered.

### architecture and api design

- **`Bot extends Composer`, and types flow through the whole chain.** each method enriches the context
  and **returns the updated type** — so the chain is always fully typed without manual annotations:
  ```ts
  const bot = new Bot(token)
    .derive("message", async (ctx) => ({ user: await db.getUser(ctx.from!.id) }))
    .on("message", (ctx) => ctx.send(`Hi, ${ctx.user.name}!`)); // ctx.user is typed
  ```
- **`Composer` method palette** — essentially the core of the design:
  | method | what it does |
  |---|---|
  | `use(ctx, next)` | raw middleware |
  | `derive(fn)` | async context enrichment per request |
  | `decorate(obj)` | static enrichment at startup (zero per-request overhead) |
  | `guard(fn)` | continue only if predicate is `true` |
  | `on(event, fn)` | handler for an update type |
  | `extend(composer)` | merge another composer **together with its types** |
- **`Composer` as a standalone class.** production pattern: assemble a composer with plugins once,
  then `.extend()` it into each feature file — features become plain `Composer` instances with no
  `Bot` import or token, fully testable, and they see plugin types (`ctx.scene`, `ctx.session`).
- **plugins via `.extend()` + hook system.** plugins add context properties, register handlers, and
  hook into the lifecycle (`onStart`, `onStop`, `preRequest`, `onResponse`, `onResponseError`) —
  all typed. lazy-load plugins are supported.
- **`format` instead of `parse_mode`.** formatting via tagged template literals that build correct
  `MessageEntity` arrays:
  ```ts
  ctx.send(format`${bold`Welcome!`} — ${italic("type-safe")} ${link("gramio", "https://gramio.dev")}`)
  ```
  no manual markdownv2 escaping — a significant reliability advantage.
- **codegen + auto-published types.** Bot API types are generated and **published on every Bot API release**
  (package `@gramio/types`) — no waiting for a maintainer. parts of the framework are also codegen'd.
- **keyboards** — fluent chainable api (`new InlineKeyboard().text(...).url(...).row()...`).
- **storages** — storage abstraction shared across session/scenes etc.

### ecosystem and plugins

surprisingly rich for a 0.9 release. official plugins:
**scenes, onboarding, i18n (on fluent), session, autoload, auto-retry,
auto-answer-callback-query, media-cache, media-group, rate-limiter, prompt, views (jsx message render),
split, pagination, jsx, posthog, opentelemetry, sentry.**

strong dx tooling as a separate point:
- `npm create gramio@latest ./bot` — scaffolder that installs orm (prisma/drizzle), linter (biome/eslint),
  docker + docker-compose, husky, a set of official plugins, hot-reload.
- ecosystem around it: `wrappergram`, `crypto pay api`, `@gramio/schema-parser`, `jobify` (bullmq wrapper).
- migration guides from grammy, puregram, telegraf, node-telegram-bot-api.

### performance

- `decorate()` for statics = zero per-request overhead (an important architectural distinction —
  separating expensive `derive` from cheap `decorate`).
- multi-runtime (node/bun/deno) with no code changes → can run on bun for speed.
- 100% typescript, mit.

### dx and type safety

- the strongest "type-flow": plugin types reach handlers automatically, no `Context & A & B`.
- best onboarding speed (scaffolder in a minute).
- maturity downsides: version `0.9.0` (potential breaking changes), community and download count
  still modest, fewer battle-tested high-scale deployments than grammy.

**gramio summary:** the most modern design. taken as the primary reference for **framework skeleton
(chainable composer with type accumulation, derive/decorate/guard/extend), type auto-generation and
auto-publishing, `format`-via-entities, and dx scaffolding**.

---

## 4. comparison across four axes

### architecture and api design

- **context model:** grammy — single `Context` + type flavors; puregram (v3) — codegen'd update-class
  hierarchy + type guards (v2's `Context` was removed in the v3 rewrite); gramio — single context
  enriched by chain methods with type accumulation.
- **composition:** grammy and gramio use `Bot extends Composer`; puregram uses `Telegram` + per-kind
  `on<Kind>` methods + middleware, plus (new in v3) a typed, dependency-resolved `.extend()` plugin
  system — still not `Bot extends Composer`, but no longer "just middleware" either.
- **api call interception:** grammy — transformers; puregram — hooks, six stages as of v3 (added an
  `onApiCall` around-hook); gramio — lifecycle hooks (`preRequest`/`onResponse...`).
- **update filtering:** grammy is unmatched (filter queries `message:text` etc.); gramio still has
  plain `on(type)` + guard/predicate; puregram (v3) gained a real composable filter system
  (`filters`, `defineFilter`, `and`/`or`/`not`) — narrower than grammy's query mini-language, but no
  longer just `on(type)` + a bare predicate.

### ecosystem and plugins

grammy ≫ gramio > puregram in coverage. grammy's unique offerings: `conversations`, `menu`, `runner`.
gramio surprises with plugin maturity (jsx-views, opentelemetry, sentry, posthog, pagination) and tooling
(scaffolder, orm, jobify). puregram (v3) covers scenes/session/flow(prompt)/callback-data/markup/rich/
media-cacher/rate-limit/file-id/throttler/stream/test — broader than v2's list (`hear` and the standalone
`prompt` package were dropped/folded in), but still more compact than gramio's or grammy's.

### performance

all three are thin layers over fetch/undici; framework overhead is not the bottleneck (the bottleneck is
the network and the telegram api). what differs:
- grammy `runner` — concurrent processing with backpressure (off-the-shelf high-load solution).
- gramio — multi-runtime (bun) + `decorate` with zero per-request overhead.
- puregram — the thinnest sdk; no built-in bun/deno support, but v3 added `concurrency` +
  `sequentializeBy` (per-key FIFO) knobs on polling, explicitly inspired by grammy's `runner`.

### dx and type safety

- **type-flow:** gramio (chain accumulation) ≥ grammy (filter-query narrowing, but manual flavors)
  ≥ puregram v3 (`.extend()` narrows `Telegram<Ext>` per plugin, closer to gramio than v2's guards
  + manual middleware typing were).
- **onboarding/docs:** grammy (reference docs + community) and gramio (scaffolder in a minute) lead;
  puregram — pleasant, but informal and more compact.
- **protection from formatting errors:** gramio `format` (entities, no escaping) — the safest approach.

---

## 5. what to borrow for yaebal

the skeleton and principles are primarily inspired by **gramio**, plus the best bits from the other two.

**core (from gramio):**
- `Bot extends Composer`, chainable api with **type accumulation** via `derive` / `decorate` / `guard` / `extend`.
  separating `derive` (async, per-request) and `decorate` (static, zero overhead) is the correct
  architectural split.
- `Composer` as a standalone, testable class → feature files without `Bot`/token.
- **Bot API type codegen + auto-publishing** on every api release. decouple type releases from core releases.
- `format` via tagged templates → `MessageEntity`, no `parse_mode` and no manual escaping.
- `create <lib>` scaffolder for instant start (orm/linter/docker/plugins).

**filtering and api layer (from grammy):**
- **filter queries** — `update:subtype:subsubtype` mini-language with type narrowing. the most useful
  grammy feature, with no equivalent in the other two — a strong differentiator.
- **transformer layer** for api calls (retry/throttle/hydrate are built on this).
- ready-made **runner with backpressure** for high-load from the start.
- runtime-agnostic build (single codebase → node/deno/web/edge).

**contexts and service layer (from puregram):**
- optionally — **codegen'd update classes per update type** + `is()/has()/can()` type guards
  (readability; can be combined with filter queries as sugar). note puregram itself moved *away*
  from a `Context` class hierarchy in its v3 rewrite, toward this codegen'd-update-union shape —
  a data point in favor of yaebal's existing single-`Context` design over a class hierarchy.
- **request interceptor hooks**, staged (before/intercept/around/response/after/error), with
  cancellation and the ability to package hook sets into third-party modules.
- clean **media abstractions** `MediaSource` / `InputMedia` / `MediaGroup`.
- **decoupled codegen**: core separate, generated types/methods in a separate package.
- `suppress: true` pattern for suppressing api errors without try/catch.
- **typed, dependency-resolved plugins** (`dependsOn`, cycle/missing-dep/name-conflict errors,
  `has()` for soft deps) — puregram v3 independently arrived at essentially the same answer yaebal's
  `Plugin<In, Out>` already gives (see "what to avoid" below); worth treating as external
  validation of that design, and worth mining for error-shape ideas (`PluginCycle`,
  `PluginMissingDep`, `PluginConflict`).

**what to avoid:**
- don't proliferate manual context type intersections (`Context & A & B & C`) as in grammy —
  gramio's chain accumulation is more ergonomic.
- don't tie plugin ordering implicitly, the way **v2** puregram did (`session` had to run before
  `hear`/`scenes`, or a runtime `Cannot read property '__scene' of undefined`) — make plugin
  dependencies explicit and type-checked, the way yaebal's `Plugin<In, Out>` already does and v3
  puregram's `dependsOn` now also does.
- don't tie Bot API type releases to core releases — otherwise you end up waiting for a maintainer.

---

## 6. facts and figures (verified 22.06.2026)

| metric | grammy | puregram | gramio |
|---|---|---|---|
| latest version (npm) | 1.43.0 | 3.6.0 | 0.9.0 |
| downloads per month (npm) | 15 388 039 | 3 584 | 11 315 |
| licence | MIT | MPL-2.0 | MIT |
| min node | ^12.20 / >=14.13 | >=22 | (node/bun/deno) |
| modularity | esm+cjs, web bundle | esm-only | esm, multi-runtime |
| author | KnorpelSenf | starkow / j++ team | kravetsone |

for market context: telegraf over the same month — ~1.98 m downloads, meaning grammy already
outpaces the old leader by a wide margin; puregram/gramio are niche by volume but actively developed
(gramio — 73 releases, latest v0.9.0 from 10.04.2026).

---

## sources

- grammy: [grammy.dev](https://grammy.dev/), [github grammyjs/grammY](https://github.com/grammyjs/grammy), [npm grammy](https://www.npmjs.com/package/grammy)
- puregram: [github nitreojs/puregram](https://github.com/nitreojs/puregram), [readme (v3, default branch)](https://github.com/nitreojs/puregram/blob/v3/README.md), [npm puregram](https://www.npmjs.com/package/puregram)
- gramio: [gramio.dev](https://gramio.dev/), [gramio.dev/get-started](https://gramio.dev/get-started), [github gramiojs/gramio](https://github.com/gramiojs/gramio)
- download metrics: [npm downloads api](https://api.npmjs.org/downloads/point/last-month/grammy,gramio,puregram,telegraf)
