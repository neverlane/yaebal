<div align="center">
🐴

### yaebal

*Yet Another tElegram Bot Api Library*  
**type-safe** · **chainable** · **plugin-first**

[⭐ github](https://github.com/neverlane/yaebal) · [📦 npmx](https://npmx.dev/org/yaebal)

</div>

### repository structure

this repository is a pnpm monorepo for the yaebal telegram bot framework — the core
plus a set of first-party plugins:

- [packages tree](/packages/) — the framework and every plugin
- [core tree & readme](/packages/core/) — `Bot`, `Composer`, context, filter queries, media
- [@yaebal/types](/packages/types/) — full Bot API types, code-generated from the schema
- [@yaebal/contexts](/packages/contexts/) — per-update context classes with **auto-generated** shortcut methods
- [example tree & readme](/examples/basic/) — a runnable bot wiring every plugin
- [architecture](/docs/ARCHITECTURE.md) — design, plugin catalog, roadmap

### plugins

| package                                           | what                                                   |
|:--------------------------------------------------|:-------------------------------------------------------|
| [@yaebal/again](/packages/again/)                 | auto-retry on 429 / flood-wait / transient 5xx         |
| [@yaebal/session](/packages/session/)             | per-chat session with pluggable storage                |
| [@yaebal/keyboard](/packages/keyboard/)           | fluent inline & reply keyboard builders                |
| [@yaebal/callback-data](/packages/callback-data/) | typed `callback_data` pack / unpack                    |
| [@yaebal/morda](/packages/morda/)                 | dialogs engine + jsx/hooks (react-for-telegram)        |
| [@yaebal/i18n](/packages/i18n/)                   | per-chat locale, `ctx.t` / `ctx.changeLanguage`        |
| [@yaebal/scenes](/packages/scenes/)               | step-by-step wizards over multiple messages            |
| [@yaebal/prompt](/packages/prompt/)               | ask a question, handle the next message                |
| [@yaebal/router](/packages/router/)               | file-based routing from a `routes/` directory          |
| [@yaebal/throttle](/packages/throttle/)           | rate-limit outgoing api calls                          |
| [@yaebal/files](/packages/files/)                 | resolve and download telegram files                    |
| [@yaebal/ratelimiter](/packages/ratelimiter/)     | drop updates from users who spam                       |
| [@yaebal/broadcast](/packages/broadcast/)         | send a message to many chats                           |
| [@yaebal/web](/packages/web/)                     | operator panel — view chats and reply from the browser |
| [@yaebal/media-group](/packages/media-group/)     | collect album updates into one handler                 |
| [@yaebal/split](/packages/split/)                 | break long messages into telegram-sized chunks         |
| [@yaebal/commands](/packages/commands/)           | one registry for handlers + the `/` command menu       |
| [@yaebal/pagination](/packages/pagination/)       | paginated lists with inline prev/next                  |
| [@yaebal/media-cache](/packages/media-cache/)     | reuse a file_id instead of re-uploading                |

### design

yaebal borrows the best from three libraries: a chainable `Composer` whose context type
accumulates through the chain (gramio), filter queries that narrow the context
(`on("message:text")`, grammy), and clean contexts, request hooks and media (puregram).
the full write-up lives in [docs/RESEARCH.md](/docs/RESEARCH.md).
