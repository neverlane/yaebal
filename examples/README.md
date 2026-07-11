# yaebal examples

runnable workspace bots for the yaebal monorepo. every example is copyable and wired to local `@yaebal/*` packages, so the examples double as public api smoke tests.

## run

```sh
pnpm install
cp examples/basic/.env.example examples/basic/.env
# fill BOT_TOKEN in the copied .env
pnpm --filter @yaebal/example-basic dev
```

use `start` for one-shot execution and `dev` for watch mode. most examples only need `BOT_TOKEN`; `panel` also needs `PANEL_TOKEN`, `broadcast` can use `ADMIN_ID`, and `webhook-edge` can use `WEBHOOK_SECRET`, `PORT`, and `PUBLIC_URL`.

## test

```sh
pnpm -r --filter "./examples/*" run test
```

all examples have a `test` script. most run `tsc` as a no-network smoke test; `testing-lab` runs real `node:test` scenarios with `@yaebal/test` actors. plugin packages also keep their focused tests under `packages/*/src/*.test.ts`.

## bots

the examples deliberately mirror the framework's layering: [core-echo](./core-echo/),
[runner-workers](./runner-workers/) and [webhook-edge](./webhook-edge/) run on bare
`@yaebal/core` (no generated contexts — raw `ctx.api.call` is the honest style there),
[inline-search](./inline-search/) adds `@yaebal/contexts` on top of core by hand, and every
other bot uses the batteries-included [`yaebal`](https://yaebal.mom/docs/yaebal/) meta package
(`createBot()` + rich generated contexts).

| example | package | focus | run |
|:--|:--|:--|:--|
| [core-echo](./core-echo/) | `@yaebal/example-core-echo` | bare `@yaebal/core`: middleware, filter narrowing, `format`, raw typed `api.call` | `pnpm --filter @yaebal/example-core-echo dev` |
| [basic](./basic/) | `@yaebal/example-basic` | whole-stack tour on `yaebal`: session, keyboard, callback-data, morda, i18n, scenes, prompt, filters, fmt, retry, throttle | `pnpm --filter @yaebal/example-basic dev` |
| [again](./again/) | `@yaebal/example-again` | awaited retry, `retry_after`, transient failures, retry metrics | `pnpm --filter @yaebal/example-again dev` |
| [throttle](./throttle/) | `@yaebal/example-throttle` | outbound buckets, priorities, cancellation, scheduler metrics | `pnpm --filter @yaebal/example-throttle dev` |
| [broadcast](./broadcast/) | `@yaebal/example-broadcast` | typed broadcast jobs, pause, resume, cancel, retry, progress | `pnpm --filter @yaebal/example-broadcast dev` |
| [keyboard](./keyboard/) | `@yaebal/example-keyboard` | inline and reply keyboard builders, every button type, request user/chat/managed bot | `pnpm --filter @yaebal/example-keyboard dev` |
| [commands](./commands/) | `@yaebal/example-commands` | typed command registry: localized menus, scopes, aliases, hidden commands, diff-based sync | `pnpm --filter @yaebal/example-commands dev` |
| [pagination](./pagination/) | `@yaebal/example-pagination` | lazy sources (`count` + limit+1 probing), item buttons with `onSelect`, typed payload, `button()` menu morphing and back-navigation, ownership filter | `pnpm --filter @yaebal/example-pagination dev` |
| [session](./session/) | `@yaebal/example-session` | session v2: dirty-checked saves, file storage, two independent sessions (`key` + `keyBy.user`), `ttl()` fields, `clearSession`, migrations | `pnpm --filter @yaebal/example-session dev` |
| [simple](./simple/) | `@yaebal/example-simple` | toml route config plus typescript handlers | `pnpm --filter @yaebal/example-simple dev` |
| [onboarding](./onboarding/) | `@yaebal/example-onboarding` | first-run product tour, force restart, dismiss, opt-out | `pnpm --filter @yaebal/example-onboarding dev` |
| [rich-messages](./rich-messages/) | `@yaebal/example-rich-messages` | rich blocks, markdown/html builders, fake streaming draft, rich message readback | `pnpm --filter @yaebal/example-rich-messages dev` |
| [panel](./panel/) | `@yaebal/example-panel` | operator dashboard, media viewer, callbacks, outgoing replies, realtime events | `pnpm --filter @yaebal/example-panel dev` |
| [commerce-suite](./commerce-suite/) | `@yaebal/example-commerce-suite` | shop bot with session cart, i18n, pagination, commands, callback-data, ratelimiter | `pnpm --filter @yaebal/example-commerce-suite dev` |
| [dialog-quest](./dialog-quest/) | `@yaebal/example-dialog-quest` | morda cockpit, scene wizard, prompt, conversation, session profile | `pnpm --filter @yaebal/example-dialog-quest dev` |
| [state-machine](./state-machine/) | `@yaebal/example-state-machine` | typed events driving transitions, a guard you can trip interactively, per-state `onEnter` hooks, `reset()` | `pnpm --filter @yaebal/example-state-machine dev` |
| [morda-jsx](./morda-jsx/) | `@yaebal/example-morda-jsx` | jsx screens with hooks: persisted `useState`/`useEffect`, `useDialogData`, widgets (Toggle/Select/Counter/Pagination), `onText` input | `pnpm --filter @yaebal/example-morda-jsx dev` |
| [media-studio](./media-studio/) | `@yaebal/example-media-studio` | albums, file metadata + links, file_id introspection, media cache, svg previews, entity-aware long message splitting + caption strategy | `pnpm --filter @yaebal/example-media-studio dev` |
| [modular-router](./modular-router/) | `@yaebal/example-modular-router` | file-based routes from `routes/commands` and `routes/on` | `pnpm --filter @yaebal/example-modular-router dev` |
| [webhook-edge](./webhook-edge/) | `@yaebal/example-webhook-edge` | `serve()` on node, `sequentialize` + `dedupe`, `setWebhook` / `getWebhookInfo`, secret token, path routing | `pnpm --filter @yaebal/example-webhook-edge dev` |
| [runner-workers](./runner-workers/) | `@yaebal/example-runner-workers` | concurrent polling and worker thread offload | `pnpm --filter @yaebal/example-runner-workers dev` |
| [testing-lab](./testing-lab/) | `@yaebal/example-testing-lab` | bot factory plus actor-driven tests | `pnpm --filter @yaebal/example-testing-lab test` |
| [inline-search](./inline-search/) | `@yaebal/example-inline-search` | core + `@yaebal/contexts` layering: `contextFor`, `inline.answer()`, pagination offset, chosen-result analytics | `pnpm --filter @yaebal/example-inline-search dev` |
| [payments-stars](./payments-stars/) | `@yaebal/example-payments-stars` | telegram stars invoices, pre-checkout approval, successful payment, refund | `pnpm --filter @yaebal/example-payments-stars dev` |

## plugin coverage

| package                 | examples                                                                               | test signal                                    |
|:------------------------|:---------------------------------------------------------------------------------------|:-----------------------------------------------|
| `@yaebal/core`          | directly: `core-echo`, `inline-search`, `runner-workers`, `webhook-edge`; via `yaebal` everywhere else | all example `test` scripts    |
| `yaebal`                | every other example (`createBot` + re-exported plugins), docs playground examples     | all example `test` scripts, docs health        |
| `@yaebal/again`         | `basic`, `again`, `throttle`, `panel`                                                  | package tests plus example smoke               |
| `@yaebal/broadcast`     | `broadcast`                                                                            | package tests plus example smoke               |
| `@yaebal/callback-data` | `basic`, `commerce-suite`, `testing-lab`, `payments-stars`                             | package tests plus actor test in `testing-lab` |
| `@yaebal/commands`      | `commands`, `commerce-suite`                                                           | package tests plus example smoke               |
| `@yaebal/conversation`  | `dialog-quest`                                                                         | package tests plus example smoke               |
| `@yaebal/file-id`       | `media-studio`                                                                         | package tests plus example smoke               |
| `@yaebal/files`         | `media-studio`                                                                         | package tests plus example smoke               |
| `@yaebal/filters`       | `basic`, `commerce-suite`                                                              | package tests plus example smoke               |
| `@yaebal/fmt`           | `basic`, `commerce-suite`, `inline-search`                                             | package tests plus example smoke               |
| `@yaebal/i18n`          | `basic`, `commerce-suite`                                                              | package tests plus example smoke               |
| `@yaebal/keyboard`      | `basic`, `keyboard`, `modular-router`, `testing-lab`, `payments-stars`, `webhook-edge` | package tests plus actor keyboard assertions   |
| `@yaebal/media-cache`   | `media-studio`                                                                         | package tests plus example smoke               |
| `@yaebal/media-group`   | `media-studio`                                                                         | package tests plus example smoke               |
| `@yaebal/morda`         | `basic`, `dialog-quest`, `morda-jsx`                                                   | package tests plus example smoke               |
| `@yaebal/onboarding`    | `onboarding`                                                                           | package tests plus example smoke               |
| `@yaebal/pagination`    | `pagination`, `commerce-suite`                                                         | package tests plus example smoke               |
| `@yaebal/panel`         | `panel`                                                                                | package tests plus example smoke               |
| `@yaebal/preview`       | `media-studio`                                                                         | package tests plus example smoke               |
| `@yaebal/prompt`        | `basic`, `dialog-quest`                                                                | package tests plus example smoke               |
| `@yaebal/ratelimiter`   | `commerce-suite`                                                                       | package tests plus example smoke               |
| `@yaebal/rich`          | `rich-messages`                                                                        | package tests plus example smoke               |
| `@yaebal/router`        | `modular-router`                                                                       | package tests plus example smoke               |
| `@yaebal/runner`        | `runner-workers`                                                                       | package tests plus example smoke               |
| `@yaebal/scenes`        | `basic`, `dialog-quest`                                                                | package tests plus example smoke               |
| `@yaebal/session`       | `session`, `basic`, `commands`, `commerce-suite`, `dialog-quest`, `testing-lab`        | package tests plus actor session assertions    |
| `@yaebal/sklad`         | `session` (file storage); the default memory store wherever sessions appear           | package tests plus example smoke               |
| `@yaebal/state-machine` | `state-machine`                                                                        | package tests plus example smoke               |
| `@yaebal/split`         | `media-studio`                                                                         | package tests plus example smoke               |
| `@yaebal/test`          | `testing-lab`                                                                          | real `node:test` suite                         |
| `@yaebal/throttle`      | `basic`, `throttle`                                                                    | package tests plus example smoke               |
| `@yaebal/toml`          | `simple`                                                                               | package tests plus example smoke               |
| `@yaebal/web`           | `webhook-edge`                                                                         | package tests plus example smoke               |
| `@yaebal/workers`       | `runner-workers`                                                                       | package tests plus example smoke               |
| `@yaebal/types`         | generated public types used by packages                                                | package typecheck                              |
| `@yaebal/contexts`      | `inline-search` (directly on core), `yaebal` meta and docs snippets                    | example smoke plus package typecheck           |
| `@yaebal/create-yaebal` | scaffolding docs                                                                       | package typecheck                              |

## patterns to copy

| pattern                     | copy from                                                                  |
|:----------------------------|:---------------------------------------------------------------------------|
| bare core, no plugins       | `core-echo`                                                                |
| core + contexts by hand     | `inline-search`                                                            |
| single-file product demo    | `basic`                                                                    |
| plugin in isolation         | `again`, `throttle`, `keyboard`, `commands`, `onboarding`, `rich-messages`, `state-machine` |
| production operator tooling | `broadcast`, `panel`, `webhook-edge`, `runner-workers`                     |
| business workflow           | `commerce-suite`, `payments-stars`, `inline-search`                        |
| multi-step ux               | `dialog-quest`, `testing-lab`                                              |
| media-heavy workflow        | `media-studio`                                                             |
| large codebase routing      | `modular-router`, `simple`                                                 |
