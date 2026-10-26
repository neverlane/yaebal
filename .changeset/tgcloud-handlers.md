---
"@yaebal/tgcloud": minor
"@yaebal/core": patch
---

add `@yaebal/tgcloud`, a build step that turns a yaebal bot into telegram serverless handlers. the runtime has no npm and no `bot.start()`, so the bot is bundled once per update type into `tgcloud/handlers/<type>.js` and its bot api calls are served by `sdk` instead of http. core's api client takes an optional `fetch` so that transport can be pinned without touching the global one.
