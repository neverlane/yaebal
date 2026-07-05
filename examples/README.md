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

| example | package | focus | run |
|:--|:--|:--|:--|
| [basic](./basic/) | `@yaebal/example-basic` | whole-stack tour: session, keyboard, callback-data, morda, i18n, scenes, prompt, filters, fmt, retry, throttle | `pnpm --filter @yaebal/example-basic dev` |
| [again](./again/) | `@yaebal/example-again` | awaited retry, `retry_after`, transient failures, retry metrics | `pnpm --filter @yaebal/example-again dev` |
| [throttle](./throttle/) | `@yaebal/example-throttle` | outbound buckets, priorities, cancellation, scheduler metrics | `pnpm --filter @yaebal/example-throttle dev` |
| [broadcast](./broadcast/) | `@yaebal/example-broadcast` | typed broadcast jobs, pause, resume, cancel, retry, progress | `pnpm --filter @yaebal/example-broadcast dev` |
| [keyboard](./keyboard/) | `@yaebal/example-keyboard` | inline and reply keyboard builders, every button type, request user/chat/managed bot | `pnpm --filter @yaebal/example-keyboard dev` |
| [simple](./simple/) | `@yaebal/example-simple` | toml route config plus typescript handlers | `pnpm --filter @yaebal/example-simple dev` |
| [onboarding](./onboarding/) | `@yaebal/example-onboarding` | first-run product tour, force restart, dismiss, opt-out | `pnpm --filter @yaebal/example-onboarding dev` |
| [rich-messages](./rich-messages/) | `@yaebal/example-rich-messages` | rich blocks, markdown/html builders, fake streaming draft, rich message readback | `pnpm --filter @yaebal/example-rich-messages dev` |
| [panel](./panel/) | `@yaebal/example-panel` | operator dashboard, media viewer, callbacks, outgoing replies, realtime events | `pnpm --filter @yaebal/example-panel dev` |
| [commerce-suite](./commerce-suite/) | `@yaebal/example-commerce-suite` | shop bot with session cart, i18n, pagination, commands, callback-data, ratelimiter | `pnpm --filter @yaebal/example-commerce-suite dev` |
| [dialog-quest](./dialog-quest/) | `@yaebal/example-dialog-quest` | morda cockpit, scene wizard, prompt, conversation, session profile | `pnpm --filter @yaebal/example-dialog-quest dev` |
| [media-studio](./media-studio/) | `@yaebal/example-media-studio` | albums, file links, media cache, svg previews, long message splitting | `pnpm --filter @yaebal/example-media-studio dev` |
| [modular-router](./modular-router/) | `@yaebal/example-modular-router` | file-based routes from `routes/commands` and `routes/on` | `pnpm --filter @yaebal/example-modular-router dev` |
| [webhook-edge](./webhook-edge/) | `@yaebal/example-webhook-edge` | fetch webhook handler, local node adapter, `setWebhook`, secret token | `pnpm --filter @yaebal/example-webhook-edge dev` |
| [runner-workers](./runner-workers/) | `@yaebal/example-runner-workers` | concurrent polling and worker thread offload | `pnpm --filter @yaebal/example-runner-workers dev` |
| [testing-lab](./testing-lab/) | `@yaebal/example-testing-lab` | bot factory plus actor-driven tests | `pnpm --filter @yaebal/example-testing-lab test` |
| [inline-search](./inline-search/) | `@yaebal/example-inline-search` | inline query answers, pagination offset, chosen-result analytics | `pnpm --filter @yaebal/example-inline-search dev` |
| [payments-stars](./payments-stars/) | `@yaebal/example-payments-stars` | telegram stars invoices, pre-checkout approval, successful payment, refund | `pnpm --filter @yaebal/example-payments-stars dev` |

## plugin coverage

| package | examples | test signal |
|:--|:--|:--|
| `@yaebal/core` | every example | all example `test` scripts |
| `yaebal` | docs playground examples | docs health and package typecheck |
| `@yaebal/again` | `basic`, `again`, `throttle`, `panel` | package tests plus example smoke |
| `@yaebal/broadcast` | `broadcast` | package tests plus example smoke |
| `@yaebal/callback-data` | `basic`, `commerce-suite`, `testing-lab`, `payments-stars` | package tests plus actor test in `testing-lab` |
| `@yaebal/commands` | `commerce-suite` | package tests plus example smoke |
| `@yaebal/conversation` | `dialog-quest` | package tests plus example smoke |
| `@yaebal/files` | `media-studio` | package tests plus example smoke |
| `@yaebal/filters` | `basic`, `commerce-suite` | package tests plus example smoke |
| `@yaebal/fmt` | `basic`, `commerce-suite`, `inline-search` | package tests plus example smoke |
| `@yaebal/i18n` | `basic`, `commerce-suite` | package tests plus example smoke |
| `@yaebal/keyboard` | `basic`, `keyboard`, `modular-router`, `testing-lab`, `payments-stars`, `webhook-edge` | package tests plus actor keyboard assertions |
| `@yaebal/media-cache` | `media-studio` | package tests plus example smoke |
| `@yaebal/media-group` | `media-studio` | package tests plus example smoke |
| `@yaebal/morda` | `basic`, `dialog-quest` | package tests plus example smoke |
| `@yaebal/onboarding` | `onboarding` | package tests plus example smoke |
| `@yaebal/pagination` | `commerce-suite` | package tests plus example smoke |
| `@yaebal/panel` | `panel` | package tests plus example smoke |
| `@yaebal/preview` | `media-studio` | package tests plus example smoke |
| `@yaebal/prompt` | `basic`, `dialog-quest` | package tests plus example smoke |
| `@yaebal/ratelimiter` | `commerce-suite` | package tests plus example smoke |
| `@yaebal/rich` | `rich-messages` | package tests plus example smoke |
| `@yaebal/router` | `modular-router` | package tests plus example smoke |
| `@yaebal/runner` | `runner-workers` | package tests plus example smoke |
| `@yaebal/scenes` | `basic`, `dialog-quest` | package tests plus example smoke |
| `@yaebal/session` | `basic`, `commerce-suite`, `dialog-quest`, `testing-lab` | package tests plus actor session assertions |
| `@yaebal/split` | `media-studio` | package tests plus example smoke |
| `@yaebal/test` | `testing-lab` | real `node:test` suite |
| `@yaebal/throttle` | `basic`, `throttle` | package tests plus example smoke |
| `@yaebal/toml` | `simple` | package tests plus example smoke |
| `@yaebal/web` | `webhook-edge` | package tests plus example smoke |
| `@yaebal/workers` | `runner-workers` | package tests plus example smoke |
| `@yaebal/types` | generated public types used by packages | package typecheck |
| `@yaebal/contexts` | `yaebal` meta and docs snippets | package typecheck |
| `@yaebal/create-yaebal` | scaffolding docs | package typecheck |

## patterns to copy

| pattern | copy from |
|:--|:--|
| single-file product demo | `basic` |
| plugin in isolation | `again`, `throttle`, `keyboard`, `onboarding`, `rich-messages` |
| production operator tooling | `broadcast`, `panel`, `webhook-edge`, `runner-workers` |
| business workflow | `commerce-suite`, `payments-stars`, `inline-search` |
| multi-step ux | `dialog-quest`, `testing-lab` |
| media-heavy workflow | `media-studio` |
| large codebase routing | `modular-router`, `simple` |
