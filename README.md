<div align="center">

  ![yaebal logo](https://raw.githubusercontent.com/neverlane/yaebal/refs/heads/master/.github/yaebal.svg)

  **yet another telegram bot api library**  
  *type-safe · chainable · plugin-first · batteries included*

  [docs](https://yaebal.pages.dev/docs/getting-started/) · [playground](https://yaebal.pages.dev/playground/) · [npmx](https://npmx.dev/org/yaebal)

  [![npmx version](https://img.shields.io/npm/v/yaebal?style=flat-square)](https://www.npmjs.com/package/yaebal)
  [![github stars](https://img.shields.io/github/stars/neverlane/yaebal?style=flat-square)](https://github.com/neverlane/yaebal/stargazers)
  [![license](https://img.shields.io/github/license/neverlane/yaebal?style=flat-square)](/LICENSE)

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

| need                                     | start here                                                          |
|:-----------------------------------------|:--------------------------------------------------------------------|
| build your first bot                     | [getting started](https://yaebal.pages.dev/docs/getting-started/)   |
| remember the api fast                    | [cheat sheet](https://yaebal.pages.dev/docs/cheat-sheet/)           |
| understand context type flow             | [typed examples](https://yaebal.pages.dev/docs/typed-examples/)     |
| ship webhooks or edge bots               | [webhooks & deploy](https://yaebal.pages.dev/docs/webhooks/)        |
| harden a production bot                  | [production guide](https://yaebal.pages.dev/docs/production/)       |
| debug common bot issues                  | [troubleshooting](https://yaebal.pages.dev/docs/troubleshooting/)   |
| move from another framework              | [migration guides](https://yaebal.pages.dev/docs/migration/grammy/) |
| build payments, inline mode or mini apps | [telegram guides](https://yaebal.pages.dev/docs/telegram/payments/) |
| ask an ai assistant to write yaebal code | [llms.txt](https://yaebal.pages.dev/llms.txt)                       |

if yaebal saves you time, star the repo. it helps people find a young project.

### examples

runnable, single-file bots live under [`examples/`](/examples/). clone the repo, drop a token in
`.env`, and run one package.

| example                                   | what it shows                                                                                                                  | run                                               |
|:------------------------------------------|:-------------------------------------------------------------------------------------------------------------------------------|:--------------------------------------------------|
| [basic](/examples/basic/)                 | a tour wiring most plugins: keyboard, callback-data, session, morda, i18n, scenes, prompt, media                               | `pnpm --filter @yaebal/example-basic dev`         |
| [again](/examples/again/)                 | awaited auto-retry on structured `retry_after` and transient 5xx                                                               | `pnpm --filter @yaebal/example-again dev`         |
| [throttle](/examples/throttle/)           | outbound scheduler with buckets, priority, cancellation and metrics                                                            | `pnpm --filter @yaebal/example-throttle dev`      |
| [broadcast](/examples/broadcast/)         | typed broadcast jobs with progress, retry, pause, resume and cancel                                                            | `pnpm --filter @yaebal/example-broadcast dev`     |
| [keyboard](/examples/keyboard/)           | every [@yaebal/keyboard](/packages/keyboard/) feature: button types, styling, dynamic buttons, request user/chat/managed-bot   | `pnpm --filter @yaebal/example-keyboard dev`      |
| [simple](/examples/simple/)               | toml routes with a typescript handler registry                                                                                 | `pnpm --filter @yaebal/example-simple dev`        |
| [onboarding](/examples/onboarding/)       | first-run product tour with typed flow controls, inline buttons and opt-out state                                              | `pnpm --filter @yaebal/example-onboarding dev`    |
| [rich-messages](/examples/rich-messages/) | [@yaebal/rich](/packages/rich/) tour: block/inline builders, `sendRichMessage`, streaming a draft, reading `rich_message` back | `pnpm --filter @yaebal/example-rich-messages dev` |
| [panel](/examples/panel/)                 | the operator [panel](/packages/panel/) end-to-end: avatars, media viewer, keyboards, callbacks, events                         | `pnpm --filter @yaebal/example-panel dev`         |

### plugins

| package                                           | what                                                                           |
|:--------------------------------------------------|:-------------------------------------------------------------------------------|
| [@yaebal/again](/packages/again/)                 | awaited retry on structured `retry_after` / transient 5xx                      |
| [@yaebal/session](/packages/session/)             | per-chat session with pluggable storage                                        |
| [@yaebal/keyboard](/packages/keyboard/)           | fluent inline and reply keyboard builders                                      |
| [@yaebal/callback-data](/packages/callback-data/) | typed `callback_data` pack / unpack                                            |
| [@yaebal/filters](/packages/filters/)             | composable, type-narrowing update filters (`ctx.filter`)                       |
| [@yaebal/fmt](/packages/fmt/)                     | `html` / `md` tagged templates with auto-escaping                              |
| [@yaebal/rich](/packages/rich/)                   | `sendRichMessage` / `sendRichMessageDraft`: block builder and streaming drafts |
| [@yaebal/morda](/packages/morda/)                 | dialogs engine and jsx/hooks for telegram ui                                   |
| [@yaebal/i18n](/packages/i18n/)                   | per-chat locale, `ctx.t` / `ctx.changeLanguage`                                |
| [@yaebal/scenes](/packages/scenes/)               | step-by-step wizards over multiple messages                                    |
| [@yaebal/onboarding](/packages/onboarding/)       | declarative first-run tutorials with inline controls                           |
| [@yaebal/conversation](/packages/conversation/)   | await-style multi-step dialogs                                                 |
| [@yaebal/prompt](/packages/prompt/)               | ask a question, handle the next message                                        |
| [@yaebal/router](/packages/router/)               | file-based routing from a `routes/` directory                                  |
| [@yaebal/toml](/packages/toml/)                   | declarative toml routes with a handler registry                                |
| [@yaebal/throttle](/packages/throttle/)           | priority outbound scheduler with global/private/group buckets                  |
| [@yaebal/files](/packages/files/)                 | resolve and download telegram files                                            |
| [@yaebal/ratelimiter](/packages/ratelimiter/)     | drop updates from users who spam                                               |
| [@yaebal/broadcast](/packages/broadcast/)         | typed broadcast jobs with storage, retry, progress and controls                 |
| [@yaebal/panel](/packages/panel/)                 | framework-agnostic operator panel with media, keyboards and event timeline     |
| [@yaebal/web](/packages/web/)                     | run your bot on edge/web runtimes via webhooks                                 |
| [@yaebal/runner](/packages/runner/)               | concurrent long-polling for scale                                              |
| [@yaebal/media-group](/packages/media-group/)     | collect album updates into one handler                                         |
| [@yaebal/media-cache](/packages/media-cache/)     | reuse a `file_id` instead of re-uploading                                      |
| [@yaebal/split](/packages/split/)                 | break long messages into telegram-sized chunks                                 |
| [@yaebal/commands](/packages/commands/)           | one registry for handlers and the `/` command menu                             |
| [@yaebal/pagination](/packages/pagination/)       | paginated lists with inline prev/next                                          |
| [@yaebal/preview](/packages/preview/)             | render telegram-style chats to svg                                             |
| [@yaebal/workers](/packages/workers/)             | `worker_threads` pool to offload cpu-heavy work                                |

### repository map

- [packages tree](/packages/) contains the framework and every plugin.
- [@yaebal/core](/packages/core/) contains `Bot`, `Composer`, context, filter queries, media and hooks.
- [yaebal](/packages/yaebal/) is the batteries-included meta package.
- [create-yaebal](/packages/create-yaebal/) scaffolds new bots with `pnpm create yaebal`.
- [@yaebal/types](/packages/types/) contains generated telegram bot api types.
- [@yaebal/contexts](/packages/contexts/) contains generated per-update context classes.
- [@yaebal/test](/packages/test/) tests bots without calling telegram.
- [docs app](/apps/docs/) powers [yaebal.pages.dev](https://yaebal.pages.dev/).
- [architecture notes](/docs/ARCHITECTURE.md) explain the design, plugin catalog and roadmap.
