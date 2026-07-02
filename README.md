<div align="center">

  ![yeabal logo](https://raw.githubusercontent.com/neverlane/yaebal/refs/heads/master/.github/yaebal.svg)

  **Yet Another tElegram Bot Api Library**  
  *type-safe · chainable · plugin-first · batteries included*
  
  [🔗 docs](https://yaebal.pages.dev) · [📦 npmx](https://npmx.dev/org/yaebal)

</div>

### repository structure

this repository is a pnpm monorepo for the yaebal telegram bot framework — the core
plus a set of first-party plugins:

- [packages tree](/packages/) — the framework and every plugin
- [core tree & readme](/packages/core/) — `Bot`, `Composer`, context, filter queries, media
- [yaebal](/packages/yaebal/) — batteries-included meta package: core + contexts + common plugins, one import
- [create-yaebal](/packages/create-yaebal/) — `pnpm create yaebal` scaffolder for a new bot
- [@yaebal/types](/packages/types/) — full Bot API types, code-generated from the schema
- [@yaebal/contexts](/packages/contexts/) — per-update context classes with **auto-generated** shortcut methods
- [@yaebal/test](/packages/test/) — the most complete test framework for Telegram bots
- [examples tree](/examples/) — runnable bots you can clone and run
- [docs app](/apps/docs/) — the SvelteKit documentation site
- [architecture](/docs/ARCHITECTURE.md) — design, plugin catalog, roadmap

### examples

runnable, single-file bots under [`examples/`](/examples/) — clone, drop a token in
`.env`, and run. each is a workspace package, so it tracks the local source.

| example                                   | what it shows                                                                                                                 | run                                               |
|:------------------------------------------|:------------------------------------------------------------------------------------------------------------------------------|:--------------------------------------------------|
| [basic](/examples/basic/)                 | a tour wiring most plugins — keyboard, callback-data, session, morda, i18n, scenes, prompt, media                             | `pnpm --filter @yaebal/example-basic dev`         |
| [keyboard](/examples/keyboard/)           | every [@yaebal/keyboard](/packages/keyboard/) feature — button types, styling, dynamic buttons, request user/chat/managed-bot | `pnpm --filter @yaebal/example-keyboard dev`      |
| [simple](/examples/simple/)               | toml routes with a typescript handler registry                                                                                | `pnpm --filter @yaebal/example-simple dev`        |
| [onboarding](/examples/onboarding/)       | first-run product tour with typed flow controls, inline buttons and opt-out state                                             | `pnpm --filter @yaebal/example-onboarding dev`    |
| [rich-messages](/examples/rich-messages/) | [@yaebal/rich](/packages/rich/) tour — block/inline builders, sendRichMessage, streaming a draft, reading rich_message back   | `pnpm --filter @yaebal/example-rich-messages dev` |
| [panel](/examples/panel/)                 | the operator [panel](/packages/panel/) end-to-end: avatars, media viewer, keyboards, callbacks, events                        | `pnpm --filter @yaebal/example-panel dev`         |

> need a fresh project instead of the monorepo? scaffold one with
> [`create-yaebal`](/packages/create-yaebal/): `pnpm create yaebal my-bot`. it opens a centred,
> keyboard-driven ansi wizard that runs everywhere out of the box (node 20+/bun/deno · 10 templates ·
> every `@yaebal` plugin), falls back to plain prompts without a tty, and takes flags for ci —
> `--plugins all --yes`.

### plugins

| package                                           | what                                                                         |
|:--------------------------------------------------|:-----------------------------------------------------------------------------|
| [@yaebal/again](/packages/again/)                 | auto-retry on 429 / flood-wait / transient 5xx                               |
| [@yaebal/session](/packages/session/)             | per-chat session with pluggable storage                                      |
| [@yaebal/keyboard](/packages/keyboard/)           | fluent inline & reply keyboard builders                                      |
| [@yaebal/callback-data](/packages/callback-data/) | typed `callback_data` pack / unpack                                          |
| [@yaebal/filters](/packages/filters/)             | composable, type-narrowing update filters (`ctx.filter`)                     |
| [@yaebal/fmt](/packages/fmt/)                     | `` html`` `` / `` md`` `` tagged templates with auto-escaping                |
| [@yaebal/rich](/packages/rich/)                   | `sendRichMessage` / `sendRichMessageDraft`: block builder + streaming drafts |
| [@yaebal/morda](/packages/morda/)                 | dialogs engine + jsx/hooks (react-for-telegram)                              |
| [@yaebal/i18n](/packages/i18n/)                   | per-chat locale, `ctx.t` / `ctx.changeLanguage`                              |
| [@yaebal/scenes](/packages/scenes/)               | step-by-step wizards over multiple messages                                  |
| [@yaebal/onboarding](/packages/onboarding/)       | declarative first-run tutorials with inline controls                         |
| [@yaebal/conversation](/packages/conversation/)   | await-style multi-step dialogs (coroutine, no replay)                        |
| [@yaebal/prompt](/packages/prompt/)               | ask a question, handle the next message                                      |
| [@yaebal/router](/packages/router/)               | file-based routing from a `routes/` directory                                |
| [@yaebal/toml](/packages/toml/)                   | declarative toml routes with a handler registry                              |
| [@yaebal/throttle](/packages/throttle/)           | space out outgoing api calls to avoid 429s                                   |
| [@yaebal/files](/packages/files/)                 | resolve and download telegram files                                          |
| [@yaebal/ratelimiter](/packages/ratelimiter/)     | drop updates from users who spam                                             |
| [@yaebal/broadcast](/packages/broadcast/)         | send a message to many chats                                                 |
| [@yaebal/panel](/packages/panel/)                 | framework-agnostic operator panel with media, keyboards and event timeline   |
| [@yaebal/web](/packages/web/)                     | run your bot on edge/web runtimes via webhooks                               |
| [@yaebal/runner](/packages/runner/)               | concurrent long-polling for scale                                            |
| [@yaebal/media-group](/packages/media-group/)     | collect album updates into one handler                                       |
| [@yaebal/media-cache](/packages/media-cache/)     | reuse a file_id instead of re-uploading                                      |
| [@yaebal/split](/packages/split/)                 | break long messages into telegram-sized chunks                               |
| [@yaebal/commands](/packages/commands/)           | one registry for handlers + the `/` command menu                             |
| [@yaebal/pagination](/packages/pagination/)       | paginated lists with inline prev/next                                        |
| [@yaebal/preview](/packages/preview/)             | render telegram-style chats to SVG                                           |
| [@yaebal/workers](/packages/workers/)             | worker_threads pool to offload CPU-heavy work                                |
