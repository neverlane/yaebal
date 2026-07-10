<!-- markdownlint-disable MD033 -->
<!-- markdownlint-disable MD041 -->
<!-- markdownlint-disable MD013 -->
<div align="center">

  ![yaebal logo](https://raw.githubusercontent.com/neverlane/yaebal/refs/heads/master/.github/yaebal.svg)

  **yet another telegram bot api library**  
  *type-safe · chainable · plugin-first · batteries included*

  [docs](https://yaebal.mom/docs/getting-started/) · [playground](https://yaebal.mom/playground/) · [npmx](https://npmx.dev/org/yaebal)

  [![npm version](https://img.shields.io/npm/v/yaebal?style=flat-square&logo=npm&labelColor=000000)](https://www.npmjs.com/package/yaebal)
  [![github stars](https://img.shields.io/github/stars/neverlane/yaebal?style=flat-square&logo=github&labelColor=000000)](https://github.com/neverlane/yaebal/stargazers)
  [![license](https://img.shields.io/github/license/neverlane/yaebal?style=flat-square&labelColor=000000)](/LICENSE)

</div>

yaebal is a type-safe telegram bot framework for typescript. build your bot as one chain:
`derive`, `decorate`, `install`, `guard`, filters and plugins all carry the context type forward,
so handlers see exactly what earlier steps added.

```ts
import { InlineKeyboard, callbackData, createBot, html, session } from "yaebal";

const vote = callbackData("vote", { id: Number });

const bot = createBot(process.env.BOT_TOKEN!)
  .install(session({ initial: () => ({ count: 0 }) }))
  .derive((ctx) => ({ name: ctx.from?.first_name ?? "friend" }));

bot.command("start", (ctx) =>
  ctx.reply(html`<b>hey ${ctx.name}</b>, pick one`, {
    reply_markup: new InlineKeyboard()
      .text("yes", vote.pack({ id: 1 }))
      .text("no", vote.pack({ id: 2 }))
      .build(),
  }),
);

bot.on("message:text", (ctx) => ctx.reply(`typed text: ${ctx.text}`));

bot.on("callback_query:data", (ctx) => {
  const data = vote.unpack(ctx.callbackQuery.data);
  if (data) ctx.session.count += data.id;
  return ctx.answer(`count: ${ctx.session.count}`);
});

await bot.start();
```

### why yaebal

- `Bot` extends `Composer`, so there is one middleware engine instead of a bot/router split.
- filter queries such as `on("message:text")` narrow the handler context without casts.
- generated contexts give update-specific shortcuts such as `ctx.react`, `ctx.answer`, and `ctx.editText`.
- first-party plugins cover sessions, keyboards, callback data, formatting, webhooks, retries, testing, routing and more.
- explicit plugin dependencies make wrong install order a type error instead of a production surprise.

### install

```sh
pnpm add yaebal
```

or scaffold a fresh bot:

```sh
pnpm create yaebal
```

### choose your path

| need                                     | start here                                                    |
|:-----------------------------------------|:--------------------------------------------------------------|
| build your first bot                     | [getting started](https://yaebal.mom/docs/getting-started/)   |
| remember the api fast                    | [cheat sheet](https://yaebal.mom/docs/cheat-sheet/)           |
| understand context type flow             | [typed examples](https://yaebal.mom/docs/typed-examples/)     |
| ship webhooks or edge bots               | [webhooks & deploy](https://yaebal.mom/docs/webhooks/)        |
| harden a production bot                  | [production guide](https://yaebal.mom/docs/production/)       |
| debug common bot issues                  | [troubleshooting](https://yaebal.mom/docs/troubleshooting/)   |
| move from another framework              | [migration guides](https://yaebal.mom/docs/migration/grammy/) |
| build payments, inline mode or mini apps | [telegram guides](https://yaebal.mom/docs/telegram/payments/) |
| ask an ai assistant to write yaebal code | [llms.txt](https://yaebal.mom/llms.txt)                       |

if yaebal saves you time, star the repo. it helps people find a young project.

### examples

runnable bots live under [`examples/`](/examples/). clone the repo, drop a token in `.env`, and run one package. the full plugin coverage matrix is in [`examples/readme.md`](/examples/README.md).

| example                                     | what it shows                                                                                                              | run                                                 |
|:--------------------------------------------|:---------------------------------------------------------------------------------------------------------------------------|:----------------------------------------------------|
| [core-echo](/examples/core-echo/)           | bare `@yaebal/core`: middleware, filter narrowing, `format`, raw typed `api.call`                                          | `pnpm --filter @yaebal/example-core-echo dev`       |
| [basic](/examples/basic/)                   | whole-stack tour on `yaebal`: keyboard, callback-data, session, morda, i18n, scenes, prompt, filters, fmt, retry, throttle | `pnpm --filter @yaebal/example-basic dev`           |
| [again](/examples/again/)                   | awaited retry on structured `retry_after` and transient 5xx                                                                | `pnpm --filter @yaebal/example-again dev`           |
| [throttle](/examples/throttle/)             | outbound scheduler with buckets, priority, cancellation and metrics                                                        | `pnpm --filter @yaebal/example-throttle dev`        |
| [broadcast](/examples/broadcast/)           | typed broadcast jobs with progress, retry, pause, resume and cancel                                                        | `pnpm --filter @yaebal/example-broadcast dev`       |
| [keyboard](/examples/keyboard/)             | every keyboard button type, dynamic grids, reply keyboards and request buttons                                             | `pnpm --filter @yaebal/example-keyboard dev`        |
| [commands](/examples/commands/)             | typed command registry: localized menus, scopes, aliases, hidden commands, diff sync                                       | `pnpm --filter @yaebal/example-commands dev`        |
| [pagination](/examples/pagination/)         | lazy paginated lists, item buttons with `onSelect`, typed payload, menu morphing, ownership filter                         | `pnpm --filter @yaebal/example-pagination dev`      |
| [session](/examples/session/)               | session v2: dirty-checked saves, file storage, two independent sessions, `ttl()` fields, `clearSession`, migrations        | `pnpm --filter @yaebal/example-session dev`         |
| [simple](/examples/simple/)                 | toml routes with a typescript handler registry                                                                             | `pnpm --filter @yaebal/example-simple dev`          |
| [onboarding](/examples/onboarding/)         | first-run product tour with typed flow controls and opt-out state                                                          | `pnpm --filter @yaebal/example-onboarding dev`      |
| [rich-messages](/examples/rich-messages/)   | rich block builders, draft streaming and `rich_message` readback                                                           | `pnpm --filter @yaebal/example-rich-messages dev`   |
| [panel](/examples/panel/)                   | operator dashboard with media viewer, keyboards, callbacks and events                                                      | `pnpm --filter @yaebal/example-panel dev`           |
| [commerce-suite](/examples/commerce-suite/) | shop bot: cart session, i18n, pagination, callback data, command registry, ratelimiter                                     | `pnpm --filter @yaebal/example-commerce-suite dev`  |
| [dialog-quest](/examples/dialog-quest/)     | morda cockpit, scenes, prompt, conversation and session profile                                                            | `pnpm --filter @yaebal/example-dialog-quest dev`    |
| [morda-jsx](/examples/morda-jsx/)           | jsx dialog screens: persisted hooks, dialog data, widgets, free-text input                                                 | `pnpm --filter @yaebal/example-morda-jsx dev`       |
| [media-studio](/examples/media-studio/)     | albums, file metadata + links, file_id introspection, media cache, svg previews, entity-aware splitting                    | `pnpm --filter @yaebal/example-media-studio dev`    |
| [modular-router](/examples/modular-router/) | file-based routes from `routes/commands` and `routes/on`                                                                   | `pnpm --filter @yaebal/example-modular-router dev`  |
| [webhook-edge](/examples/webhook-edge/)     | `serve()` on node, `sequentialize` + `dedupe`, secret token, `setWebhook` / `getWebhookInfo`                               | `pnpm --filter @yaebal/example-webhook-edge dev`    |
| [runner-workers](/examples/runner-workers/) | concurrent polling plus worker thread offload                                                                              | `pnpm --filter @yaebal/example-runner-workers dev`  |
| [testing-lab](/examples/testing-lab/)       | bot factory with real actor-driven `node:test` coverage                                                                    | `pnpm --filter @yaebal/example-testing-lab test`    |
| [inline-search](/examples/inline-search/)   | core + `@yaebal/contexts` by hand: `contextFor`, `inline.answer()`, offset pagination, chosen-result analytics             | `pnpm --filter @yaebal/example-inline-search dev`   |
| [payments-stars](/examples/payments-stars/) | telegram stars invoices, pre-checkout approval, successful payment and refund                                              | `pnpm --filter @yaebal/example-payments-stars dev`  |

### plugins

| package                                           | what                                                                                  |
|:--------------------------------------------------|:--------------------------------------------------------------------------------------|
| [@yaebal/again](/packages/again/)                 | awaited retry on structured `retry_after` / transient 5xx                             |
| [@yaebal/session](/packages/session/)             | typed sessions: dirty-checked saves, lazy mode, multi-session, ttl fields, migrations |
| [@yaebal/sklad](/packages/sklad/)                 | zero-dep storage adapters: memory (ttl/lru), redis, sqlite, cloudflare kv, file       |
| [@yaebal/keyboard](/packages/keyboard/)           | fluent inline and reply keyboard builders                                             |
| [@yaebal/callback-data](/packages/callback-data/) | typed `callback_data` pack / unpack                                                   |
| [@yaebal/auto-answer](/packages/auto-answer/)     | auto-clears the callback-query loading spinner, no manual `answerCallbackQuery` call  |
| [@yaebal/filters](/packages/filters/)             | composable, type-narrowing update filters: `and`/`or`/`not`, deep links, async        |
| [@yaebal/fmt](/packages/fmt/)                     | `html` / `md` tagged templates with auto-escaping                                     |
| [@yaebal/rich](/packages/rich/)                   | `sendRichMessage` / `sendRichMessageDraft`: block builder and streaming drafts        |
| [@yaebal/morda](/packages/morda/)                 | dialogs engine and jsx/hooks for telegram ui                                          |
| [@yaebal/i18n](/packages/i18n/)                   | typed `ctx.t` (keys + params), Intl plurals, `language_code` detection                |
| [@yaebal/scenes](/packages/scenes/)               | durable wizards: typed state, `ask()` validation, navigation, sub-scenes, ttl         |
| [@yaebal/onboarding](/packages/onboarding/)       | declarative first-run tutorials with inline controls                                  |
| [@yaebal/conversation](/packages/conversation/)   | await-style multi-step dialogs                                                        |
| [@yaebal/prompt](/packages/prompt/)               | ask a question, handle the next message                                               |
| [@yaebal/router](/packages/router/)               | file-based routing from a `routes/` directory                                         |
| [@yaebal/toml](/packages/toml/)                   | declarative toml routes with a handler registry                                       |
| [@yaebal/throttle](/packages/throttle/)           | priority outbound scheduler with global/private/group buckets                         |
| [@yaebal/files](/packages/files/)                 | inspect, link, stream and download files; local Bot API server aware                  |
| [@yaebal/file-id](/packages/file-id/)             | parse and re-serialize `file_id` / `file_unique_id` strings (zero deps)               |
| [@yaebal/ratelimiter](/packages/ratelimiter/)     | drop updates from users who spam                                                      |
| [@yaebal/broadcast](/packages/broadcast/)         | typed broadcast jobs with storage, retry, progress and controls                       |
| [@yaebal/panel](/packages/panel/)                 | framework-agnostic operator panel with media, keyboards and event timeline            |
| [@yaebal/web](/packages/web/)                     | webhooks on any runtime — edge, node servers, serverless, fetch frameworks; adapters, `sequentialize`, `dedupe`, lifecycle |
| [@yaebal/runner](/packages/runner/)               | concurrent long-polling for scale                                                     |
| [@yaebal/media-group](/packages/media-group/)     | collect albums into one handler call or a `ctx.mediaGroup` pass-through               |
| [@yaebal/media-cache](/packages/media-cache/)     | upload once, reuse the `file_id` — self-heals when telegram rejects it                |
| [@yaebal/split](/packages/split/)                 | long text as multiple messages — entity-aware splits, partial-failure reports         |
| [@yaebal/commands](/packages/commands/)           | one registry for handlers and the `/` menu — localized, scoped, diff-synced           |
| [@yaebal/pagination](/packages/pagination/)       | paginated lists over any source — lazy fetch, item buttons, typed payload             |
| [@yaebal/preview](/packages/preview/)             | render telegram-style chats to svg                                                    |
| [@yaebal/workers](/packages/workers/)             | typed `worker_threads` pool — queueing, timeouts, aborts, crash recovery              |

### repository map

- [packages tree](/packages/) contains the framework and every plugin.
- [@yaebal/core](/packages/core/) contains `Bot`, `Composer`, context, filter queries, media and hooks.
- [yaebal](/packages/yaebal/) is the batteries-included meta package.
- [create-yaebal](/packages/create-yaebal/) scaffolds new bots with `pnpm create yaebal`.
- [@yaebal/types](/packages/types/) contains generated telegram bot api types.
- [@yaebal/contexts](/packages/contexts/) contains generated per-update context classes.
- [@yaebal/test](/packages/test/) tests bots without calling telegram.
- [docs app](/apps/docs/) powers [yaebal.mom](https://yaebal.mom/).
- [architecture notes](/docs/ARCHITECTURE.md) explain the design, plugin catalog and roadmap.
