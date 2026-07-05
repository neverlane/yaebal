---
name: add-plugin-doc
description: Use when adding or updating yaebal plugin docs under apps/docs/src/routes/docs/plugins, including package api tables, runnable examples, nav, seo, and docs health.
---

# add plugin doc

use this skill when documenting a first-party `@yaebal/*` plugin.

## rules

- write visible docs prose in lowercase.
- preserve exact exported symbol names in code and inline code.
- show install, minimal setup, context fields added by the plugin, api surface, production notes, testing notes, and a runnable playground example when possible.
- mention plugin dependencies explicitly when the plugin requires context from another plugin.
- keep examples type-flow oriented: show what appears on `ctx` after `.install(...)`.
- add seo metadata in `apps/docs/src/lib/SEO.svelte` (`PLUGIN_META`) for new plugin routes.
- for a brand-new plugin page, also add the plugin to the catalog arrays in
  `apps/docs/src/routes/docs/plugins/+page.svelte` and
  `apps/docs/src/routes/docs/packages/+page.svelte`, to `apps/docs/src/lib/nav.ts`
  (the right plugins section), and to the plugins table in the root `README.md`.
- run `pnpm docs:check` before finishing.

## page shape

1. lead paragraph: what the plugin does and when to use it.
2. install command tabs if the package is installed directly.
3. minimal bot snippet, preferably via `<Try />`.
4. table of exports and context additions.
5. configuration options and defaults.
6. production caveats and testing guidance.
7. links to related plugins and examples.

## references

- plugin routes: `apps/docs/src/routes/docs/plugins/`
- plugin catalog page: `apps/docs/src/routes/docs/plugins/+page.svelte`
- packages catalog page: `apps/docs/src/routes/docs/packages/+page.svelte`
- packages: `packages/*/src/index.ts`
- playground registry: `apps/docs/src/lib/examples.ts`
- nav: `apps/docs/src/lib/nav.ts`
- seo plugin map: `apps/docs/src/lib/SEO.svelte`
- docs health: `pnpm docs:check`
