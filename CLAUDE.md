# CLAUDE.md

Guidance for Claude Code when working in this repository.

## What this is

**YAEBAL** (Yet Another tElegram Bot Api Library) — a type-safe, extensible Telegram Bot API
framework. pnpm monorepo. The published packages live under the `@yaebal/*` npm scope.

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
4. Plugin dependencies are explicit and type-checked — never rely on implicit middleware order.

## Layout

pnpm workspace globs: `packages/*`, `examples/*`, `apps/*`.

- `packages/core` — `@yaebal/core`. Entry: `src/index.ts`. Build output: `lib/` (via `tsc`).
- `packages/*` — the rest of the published `@yaebal/*` scope: plugins (`again`, `session`,
  `keyboard`, `morda`, `i18n`, `scenes`, `conversation`, `router`, `panel`, `web`, `runner`, …),
  codegen packages (`@yaebal/types`, `@yaebal/contexts`), the `yaebal` batteries-included meta
  package, the `create-yaebal` scaffolder, and `@yaebal/test` utilities. Each builds `src/` → `lib/`.
- `examples/basic` — runnable bot, used as a smoke test for the public API.
- `apps/docs` — the SvelteKit documentation site (Cloudflare adapter).
- `docs/RESEARCH.md` — the comparative analysis that motivated the design.
- `docs/ARCHITECTURE.md` — full architecture, plugin catalog, and build roadmap.

## Commands

```sh
pnpm install          # bootstrap workspace
pnpm typecheck        # tsc across all packages — run this before claiming done
pnpm build            # compile packages to lib/
pnpm test             # build, then run each package's node:test suite over lib/
pnpm dev              # run examples/basic in watch mode (needs BOT_TOKEN)
pnpm docs:dev         # run the docs app (apps/docs) in dev mode
pnpm lint:fix         # Biome format + lint (alias for `biome check --write .`)
```

## Conventions

- ESM only. `"type": "module"`, `moduleResolution: NodeNext`, explicit `.js` import specifiers
  in source (e.g. `import { Composer } from "./composer.js"`).
- TypeScript strict mode + `noUncheckedIndexedAccess`. No `any` in public types.
- Use `import type` for type-only imports (`verbatimModuleSyntax` is on).
- Before finishing any change, run `pnpm typecheck`.
