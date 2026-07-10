---
name: create-package
description: Use when creating a new @yaebal/* package from scratch under packages/, including package.json shape, tsconfig project references, the Plugin<In, Out> source pattern, README, tests, and registration in docs, nav, and the root readme.
---

# create a new @yaebal/* package

use this skill when adding a new first-party package to the monorepo.

## before writing code

- check `docs/ARCHITECTURE.md` §2 (plugin catalog) — the package may already be planned there
  with a decided scope and name. follow the catalog; respect its YAGNI notes.
- one package = one job. if the idea needs another plugin's context, that's a typed dependency
  (`In`), not a reason to merge packages.
- names are short, lowercase, no `yaebal-` prefix inside the scope: `packages/split` →
  `@yaebal/split`.

## scaffold

create `packages/<name>/` with exactly these files (biome formats with tabs, line width 100):

### package.json

```json
{
	"name": "@yaebal/<name>",
	"version": "0.0.1",
	"description": "yaebal <name> — <one-line, lowercase, what it does>.",
	"type": "module",
	"main": "./lib/index.js",
	"types": "./lib/index.d.ts",
	"exports": {
		".": {
			"types": "./lib/index.d.ts",
			"import": "./lib/index.js"
		}
	},
	"files": ["lib", "src"],
	"scripts": {
		"build": "tsc -p tsconfig.json",
		"typecheck": "tsc -p tsconfig.json --noEmit",
		"test": "node --test lib/*.test.js"
	},
	"dependencies": {
		"@yaebal/core": "workspace:*"
	},
	"devDependencies": {
		"@types/node": "latest",
		"@yaebal/test": "workspace:*"
	},
	"engines": { "node": ">=20" },
	"keywords": ["telegram", "telegram-bot", "yaebal", "<name>"],
	"license": "MIT",
	"repository": {
		"type": "git",
		"url": "https://github.com/neverlane/yaebal",
		"directory": "packages/<name>"
	},
	"publishConfig": { "access": "public" }
}
```

- test script must be `node --test lib/*.test.js` — unquoted glob. `node --test lib` silently
  runs zero tests on node 25, and a quoted `'lib/**/*.test.js'` breaks on node 20 in ci.
- every workspace dependency is `workspace:*`.

### tsconfig.json

```json
{
	"extends": "../../tsconfig.base.json",
	"compilerOptions": {
		"rootDir": "./src",
		"outDir": "./lib",
		"composite": true,
		"types": ["node"]
	},
	"references": [{ "path": "../core" }, { "path": "../test" }],
	"include": ["src/**/*.ts"]
}
```

- `references` must mirror the package.json workspace deps (including devDeps like
  `@yaebal/test`). add `{ "path": "../session" }` etc. for every `@yaebal/*` you depend on.

after scaffolding run `pnpm install` once to link the workspace.

## src/index.ts — the plugin pattern

the full authoring guide lives at `apps/docs/src/routes/docs/plugins/authoring/+page.svelte`.
the contract from `@yaebal/core`:

```ts
type Plugin<In extends Context, Out extends object> =
	<C extends In>(composer: Composer<C>) => Composer<C & Out>;
```

rules (these are the core invariants — do not bend them):

- export a factory returning `Plugin<In, Out>`: `export function splitter(options = {}): Plugin<Context, SplitControl>`.
- `decorate()` for static values (zero per-update cost); `derive()` for per-update / async values.
  keep them distinct.
- a dependency on another plugin's context goes into `In`
  (e.g. `Plugin<Context & { session: S }, Out>`), never into implicit install order.
- export the options interface and the added-context interface (e.g. `SplitControl`) — users
  compose them.
- `BotPlugin<In, Out>` when you need `bot.api` / `onStart` / `onStop`; also expose a direct
  api-hook form when it makes sense (`autoRetry(bot.api, opts)` style).
- no `any` in public types. esm only: relative imports end in `.js`, type-only imports use
  `import type`.
- pure logic (splitting, packing, parsing) is exported as plain functions so tests hit it directly.
- if the plugin benefits from test fixtures, ship a `TestPack` under a `./test-pack` subpath
  export (see `packages/again` — `test-pack.ts` + second entry in `exports`).

## src/index.test.ts

write tests with the invoked `test-package` skill (actor-driven `@yaebal/test` api). tests live
next to the source, compile to `lib/`, run over compiled output.

## README.md

lowercase prose, same skeleton as every package (see `packages/again/README.md` for a full one):

1. `# @yaebal/<name>` + one-paragraph what/why.
2. `## install` — `pnpm add @yaebal/<name>`.
3. `## usage` — minimal `bot.install(...)` snippet showing what appears on `ctx`.
4. `## behavior` / `## options` as needed.
5. footer: `part of [**yaebal**](https://github.com/neverlane/yaebal) — a type-safe, runtime-agnostic Telegram Bot API framework. MIT.`

## register the package

- root `README.md` — add a row to the plugins table (alphabetical-ish by theme).
- `docs/ARCHITECTURE.md` §2 — mark the catalog entry done or add it.
- docs site — use the `add-plugin-doc` skill: route under
  `apps/docs/src/routes/docs/plugins/<name>/`, plus `nav.ts`, `SEO.svelte`, the plugin arrays in
  `docs/plugins/+page.svelte` and `docs/packages/+page.svelte`.
- only add re-exports to the `yaebal` meta package if the plugin is genuinely everyday-common
  (session/keyboard tier) — that list is curated, not automatic.
- an `examples/<name>` bot is optional; if added, wire it into `examples/README.md` and the root
  readme examples table.

## verify

```sh
pnpm typecheck        # must pass before claiming done
pnpm build
cd packages/<name> && node --test lib/*.test.js
pnpm lint:fix
```

release is via changesets (`pnpm changeset`) — do not hand-bump versions.
