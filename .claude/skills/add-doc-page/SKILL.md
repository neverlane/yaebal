---
name: add-doc-page
description: Use when adding or updating yaebal docs pages under apps/docs/src/routes/docs, including nav, seo, runnable try examples, codetabs, and docs health checks.
---

# add doc page

use this skill when creating or changing a yaebal docs page.

## rules

- write visible docs prose in lowercase.
- keep real code identifiers, package names, env vars, and api method names exact inside code blocks and inline code.
- prefer runnable examples through `$lib/Try.svelte` when the example can run in the playground.
- put playground examples in `apps/docs/src/lib/examples.ts` and reference them by stable id.
- use `$lib/CodeTabs.svelte` for package-manager commands or deploy target command variants.
- add new pages to `apps/docs/src/lib/nav.ts` when they should be discoverable.
- add route metadata in `apps/docs/src/lib/SEO.svelte` for every new top-level docs page.
- run `pnpm docs:check` before finishing docs work.

## workflow

1. choose the route under `apps/docs/src/routes/docs/<slug>/+page.svelte`.
2. add or update content with lowercase headings and prose.
3. add runnable examples to `apps/docs/src/lib/examples.ts` if the page contains bot code.
4. use `<Try id="example-id" title="bot.ts" />` for playground-backed snippets.
5. use `<CodeTabs tabs={tabs} title="install" />` for install, run, deploy, or package-manager variants.
6. update `nav.ts` and `SEO.svelte` when adding a route.
7. run `pnpm docs:check`.

## references

- docs routes: `apps/docs/src/routes/docs/`
- playground registry: `apps/docs/src/lib/examples.ts`
- try component: `apps/docs/src/lib/Try.svelte`
- code tabs: `apps/docs/src/lib/CodeTabs.svelte`
- nav: `apps/docs/src/lib/nav.ts`
- seo: `apps/docs/src/lib/SEO.svelte`
- health script: `apps/docs/scripts/check-docs-health.mjs`
