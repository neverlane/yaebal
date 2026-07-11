# AGENTS.md

Guidance for coding agents (Claude Code, Codex, opencode, …) working in this repository.
`CLAUDE.md` is a symlink to this file.

## What this is

**YAEBAL** (Yet Another tElegram Bot Api Library) — a type-safe, extensible Telegram Bot API
framework. pnpm monorepo. The published packages live under the `@yaebal/*` npm scope, plus the
`yaebal` batteries-included meta package and the `create-yaebal` scaffolder.

## Architecture (the important part)

The design borrows deliberately from three existing libraries (see `docs/RESEARCH.md`):

- **GramIO** → chainable `Composer` where the context type *accumulates* through the chain.
  `derive` / `decorate` / `guard` / `extend` each return a Composer with an augmented context
  type, so handlers see plugin-added properties with no manual casting.
- **grammY** → filter queries (`on("message:text")`) that narrow the context type, and a
  transformer-style API layer.
- **puregram** → request hooks, clean media abstractions, decoupled codegen for API types.

Core invariants to preserve:

1. `Bot extends Composer`. Don't fork the middleware engine — extend it.
2. `derive` is async + per-request; `decorate` is static + zero per-request cost. Keep them
   distinct.
3. Types must flow through the chain. Any new Composer method that enriches the context must
   return an augmented type, never widen to `any`.
4. Plugin dependencies are explicit and type-checked — a plugin's requirements go in the `In`
   parameter of `Plugin<In, Out>`; never rely on implicit middleware order.

## Layout

pnpm workspace globs: `packages/*`, `examples/*`, `apps/*`. Node >= 20.

- `packages/core` — `@yaebal/core`: `Bot`, `Composer`, context, filter queries, media, hooks.
  Entry: `src/index.ts`. Build output: `lib/` (via `tsc`). Every package follows this shape.
- `packages/*` — the rest of the published `@yaebal/*` scope: ~32 plugins (`again`, `session`,
  `sklad`, `keyboard`, `callback-data`, `filters`, `fmt`, `rich`, `morda`, `i18n`, `scenes`,
  `conversation`, `prompt`, `files`, `file-id`, `router`, `toml`, `throttle`, `ratelimiter`,
  `broadcast`, `panel`, `web`, `runner`, `split`, `workers`, `onboarding`, `pagination`,
  `media-cache`, `media-group`, `commands`, `preview`, `payments`, …), the codegen packages (`@yaebal/types`
  — generated Bot API types, with `packages/types/schema.json` as the single source of truth;
  `@yaebal/contexts` — generated per-update context classes), the `yaebal` meta package,
  `create-yaebal`, and `@yaebal/test` (actor-driven test framework: `createTestEnv` / `UserActor`
  / `ChatActor`).
- `examples/*` — 23 runnable bots, doubling as public-API smoke tests; the plugin coverage
  matrix lives in `examples/README.md`.
- `apps/docs` — the SvelteKit docs site (Cloudflare adapter): guides, plugin pages, the
  playground, and a Bot API reference generated from `packages/types/schema.json`.
- `docs/RESEARCH.md` — the comparative analysis that motivated the design.
- `docs/ARCHITECTURE.md` — full architecture, plugin catalog, and build roadmap.
- `scripts/` — release automation (changesets-based).

## Commands

```sh
pnpm install          # bootstrap workspace
pnpm typecheck        # tsc across all packages — run this before claiming done
pnpm build            # compile packages to lib/
pnpm test             # build, then run each package's node:test suite over lib/
pnpm dev              # run examples/basic in watch mode (needs BOT_TOKEN)
pnpm docs:dev         # run the docs app (apps/docs) in dev mode
pnpm docs:check       # docs health script + svelte-check — run after any docs change
pnpm lint:fix         # Biome format + lint (alias for `biome check --write .`)
pnpm changeset        # record a release note; versions are bumped by changesets, never by hand
```

## Conventions

- ESM only. `"type": "module"`, `moduleResolution: NodeNext`, explicit `.js` import specifiers
  in source (e.g. `import { Composer } from "./composer.js"`).
- TypeScript strict mode + `noUncheckedIndexedAccess`. No `any` in public types.
- Use `import type` for type-only imports (`verbatimModuleSyntax` is on).
- Biome formatting: tabs, line width 100.
- Tests are `node:test` files next to the source (`src/*.test.ts`) that compile with the package
  and run over `lib/`. A package's test script must be `node --test lib/*.test.js` — unquoted
  glob (`node --test lib` silently runs zero tests on Node 25; a quoted `**` glob breaks Node 20
  in CI).
- Generated code is changed via its generator, never edited in place:
  `packages/types/src/telegram.ts` and `packages/contexts/src/generated/` are codegen output
  (excluded from Biome). Extend the existing parser/generators under `packages/types/scripts`
  instead of writing parallel ones.
- Docs-site prose and package READMEs are lowercase; code identifiers, package names, and API
  method names stay exact.
- Before finishing any change, run `pnpm typecheck`.

## Skills (task playbooks)

Step-by-step playbooks for recurring tasks live in `.claude/skills/` (`.opencode/skills` is a
symlink to the same directory):

- `create-package` — scaffold and register a new `@yaebal/*` package from scratch.
- `test-package` — write tests with the `@yaebal/test` actor API.
- `add-doc-page` — add or update a docs page (nav, seo, playground examples, health check).
- `add-plugin-doc` — document a first-party plugin on the docs site.
