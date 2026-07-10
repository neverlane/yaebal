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
| core abstraction | `Composer` + middleware + filter queries | `Telegram` + context classes + hooks | chainable `Composer` with type accumulation |
| headline feature | huge ecosystem + filter queries | thin honest sdk + request interception | types flow through the whole chain + codegen |
| best reference for | ecosystem, update filtering, runtime-agnostic build | context classes, request hooks, decoupled codegen | dx, `.derive/.decorate/.extend`, auto-types, `format` |

short version: **grammy** — for maturity and ecosystem; **gramio** — for modern type-safe design and dx;
**puregram** — for the minimalist sdk approach and clean context/hook model.
for yaebal the sensible move is to take the gramio-style skeleton, the grammy filter-query system,
and the puregram ideas of decoupled codegen + context classes.

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
framework but a **clean sdk/client** with pleasant contexts. the authorial style is deliberately
informal (lowercase readme, memes); author is starkow under the j++ team. inspired by `vk-io`
by negezor — visible in the context architecture.

### architecture and api design

- **`Telegram` instance.** entry point: `Telegram.fromToken(token)` or `new Telegram({ token })`.
  updates via `telegram.updates.on('message', ...)`, polling via `telegram.updates.startPolling()`, or webhook middleware.
- **contexts as a class hierarchy.** the key difference from grammy: each update type gets its own class
  (`MessageContext`, `CallbackQueryContext`, `ForumTopicCreatedContext`, …) loaded with getters and shortcuts.
  type narrowing via **type guards**:
  ```ts
  if (context.is('callback_query')) { /* context: CallbackQueryContext */ }
  if (context.hasText()) { /* context.text: string */ }
  ```
  all predicate methods `is*/has*/can*` are methods (type guards), not getters — a deliberate choice.
- **three ways to call the api:** `telegram.api.call('getMe')` (raw, works even before types catch up
  to a new bot api), `telegram.api.getMe()` (typed), and context shortcuts (`context.send(...)`).
- **hooks — request interceptors.** five stages (`onBeforeRequest`, `onRequestIntercept`,
  `onResponseIntercept`, `onAfterRequest`, `onError`): modify params, inject `parse_mode`,
  cancel via `AbortController`. hooks are applied in bulk via `telegram.useHooks(...)` — easy to
  package in third-party modules.
- **middlewares** in the `(context, next)` style — for extending context and instrumentation.
- **media abstractions.** `MediaSource` (path/stream/buffer/url/fileId) and `MediaSourceTo` for
  downloading, `InputMedia` for media-group/editMessageMedia — a clean, well-thought-out layer.
- **decoupled codegen.** Bot API types and methods live in a separate package `@puregram/api`
  (dependency `~10.1.4`), imported from `puregram/generated`, `puregram/methods`, `puregram/telegram-interfaces`.
  the core is decoupled from generated types.

### ecosystem and plugins

smaller, but covers the basics. official `@puregram/*`:
- **hear** — react to text/caption by conditions.
- **scenes** — middleware scenes (step-by-step scenarios).
- **session** — sessions.
- **prompt** — wait for the next message.
- **callback-data** — validate/serialise callback data.
- **markup** — markup system.
- **media-cacher** — `file_id` cache.
- **utils** — utilities (webapp validation, crypto value conversion).
- unofficial: `nestjs-puregram` for nestjs.

important middleware ordering note: `session()` must be registered **before** `hear`/`scenes`,
otherwise `Cannot read property '__scene' of undefined`.

### performance

- thin layer over `fetch`/`undici`, no heavy runtime — minimal overhead.
- esm-only, `node >= 22` — modern baseline but cuts off older environments.
- no claimed multi-runtime story (bun/deno like gramio) in the readme — focus is on node.js.

### dx and type safety

- very pleasant context handling and type guards — code reads well.
- informal authorial documentation style: fun, but less "corporate-predictable" than grammy/gramio.
- smaller community and downloads → fewer ready-made recipes on stackoverflow/in chats.

**puregram summary:** a beautiful minimalist sdk. taken as the model for **context classes + type guards,
request hooks, media abstractions (`MediaSource`/`InputMedia`), and decoupled codegen api package**.

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

- **context model:** grammy — single `Context` + type flavors; puregram — class hierarchy + type guards;
  gramio — single context enriched by chain methods with type accumulation.
- **composition:** grammy and gramio use `Bot extends Composer`; puregram uses `Telegram` + `updates` +
  middleware (less "framework-y").
- **api call interception:** grammy — transformers; puregram — hooks (5 stages); gramio — lifecycle hooks
  (`preRequest`/`onResponse...`).
- **update filtering:** grammy is unmatched (filter queries `message:text` etc.); puregram/gramio have
  plain `on(type)` + guard/predicate.

### ecosystem and plugins

grammy ≫ gramio > puregram in coverage. grammy's unique offerings: `conversations`, `menu`, `runner`.
gramio surprises with plugin maturity (jsx-views, opentelemetry, sentry, posthog, pagination) and tooling
(scaffolder, orm, jobify). puregram covers the basics (hear/scenes/session/prompt/callback-data/markup/media-cacher)
but the ecosystem is more compact.

### performance

all three are thin layers over fetch/undici; framework overhead is not the bottleneck (the bottleneck is
the network and the telegram api). what differs:
- grammy `runner` — concurrent processing with backpressure (off-the-shelf high-load solution).
- gramio — multi-runtime (bun) + `decorate` with zero per-request overhead.
- puregram — the thinnest sdk, but no built-in high-load runner and no claimed bun/deno support.

### dx and type safety

- **type-flow:** gramio (chain accumulation) ≥ grammy (filter-query narrowing, but manual flavors)
  > puregram (guards, but more manual typing in middleware).
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
- optionally — **context classes per update type** + `is()/has()/can()` type guards
  (readability; can be combined with filter queries as sugar).
- **request interceptor hooks** with cancellation via `AbortController` and the ability to package
  hook sets into third-party modules (`useHooks`).
- clean **media abstractions** `MediaSource` / `MediaSourceTo` / `InputMedia`.
- **decoupled codegen**: core separate, generated types/methods in a separate package.
- `suppress: true` pattern for suppressing api errors without try/catch.

**what to avoid:**
- don't proliferate manual context type intersections (`Context & A & B & C`) as in grammy —
  gramio's chain accumulation is more ergonomic.
- don't tie plugin ordering implicitly (like `session` before `scenes` in puregram) —
  make plugin dependencies explicit and type-checked.
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
- puregram: [github nitreojs/puregram](https://github.com/nitreojs/puregram), [readme](https://github.com/nitreojs/puregram/blob/lord/README.md), [npm puregram](https://www.npmjs.com/package/puregram)
- gramio: [gramio.dev](https://gramio.dev/), [gramio.dev/get-started](https://gramio.dev/get-started), [github gramiojs/gramio](https://github.com/gramiojs/gramio)
- download metrics: [npm downloads api](https://api.npmjs.org/downloads/point/last-month/grammy,gramio,puregram,telegraf)
