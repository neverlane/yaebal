# @yaebal/ai — state of the package

status doc for whoever works on `packages/ai` next: what exists, how it fits together, what
is deliberately not done yet, and the traps. written 2026-07-17, after the initial build.

## what this package is

one package, two halves, hard-isolated by subpath exports so neither pays for the other:

| half        | entry                                                      | what                                                                        |
|:------------|:-----------------------------------------------------------|:----------------------------------------------------------------------------|
| runtime     | `@yaebal/ai`                                               | the `ai()` plugin: `ctx.ai.*` llm helpers for bots                          |
| dev tooling | `@yaebal/ai/mcp`, `@yaebal/ai/installers`, bin `yaebal-ai` | mcp server, agent installer, skills — makes ai coding agents good at yaebal |

the bin (`npx @yaebal/ai`) lazy-imports everything; importing the runtime never loads the mcp
sdk or the tui.

## the runtime half

### module map

| file            | job                                                                                                         |
|:----------------|:------------------------------------------------------------------------------------------------------------|
| `src/index.ts`  | `ai()` plugin factory, `AiOptions`, `AiApi` (`ctx.ai`), per-call options, typing keep-alive                 |
| `src/model.ts`  | `AiModel` contract + adapters: `openaiCompatible`, `anthropicModel`, `aiSdk`, `customModel`, `resolveModel` |
| `src/stream.ts` | the streaming engine: `streamToChat`, `StreamTarget`, `targetOf`                                            |
| `src/memory.ts` | conversation memory on `@yaebal/sklad` `StorageAdapter`                                                     |
| `src/limits.ts` | `"20/h"` rate specs, sliding-window limiter, `AiLimitError`                                                 |
| `src/sse.ts`    | minimal server-sent-events reader (shared by both fetch adapters)                                           |

### invariants (do not break these)

- **`AiModel` is the contract**, not any vendor sdk. `stream()` is the only required method;
  `generate()` falls back to collecting the stream. the vercel ai sdk is an optional peer,
  loaded lazily inside `aiSdk()` only — never import `"ai"` at module top level.
  `resolveModel` duck-types ai-sdk models by `specificationVersion`.
- **streaming picks the mechanism per chat**: `sendMessageDraft` in private chats (empty text
  first — telegram renders its native "Thinking…" placeholder), throttled `editMessageText`
  with a `▍` cursor everywhere else. drafts are a private-chat-only bot api feature.
- **`parseMode` applies at finalization only.** in-flight previews are always plain text (a
  half-open `**bold` must never 400 the stream), and a finalization 400 "can't parse entities"
  falls back to resending plain — text is never lost.
- **preview ticks are cosmetic and non-fatal**: a failed tick (flood limit, race) is swallowed
  and the next tick catches up. finalization errors propagate.
- **overflow consumes the raw buffer tail.** when a >`maxLength` buffer is split, the head
  parts come from `@yaebal/split` but the remaining buffer is `buffer.slice(consumed)` on the
  raw string — assigning the split part's *text* back to the buffer loses the boundary
  whitespace and glues the next chunk onto the tail (this was a real bug, caught by tests).
- memory is keyed per user per chat by default, windowed (32), storage-pluggable; `memory: false`
  makes calls stateless. limits throw `AiLimitError` with `retryAfterMs` — handlers catch it.
- the plugin attaches via `derive` and needs nothing beyond `Context` (`Plugin<Context, AiControl>`);
  it composes with everything downstream.

## the dev-tooling half

### skills — the single source of truth

`packages/ai/skills/<slug>/SKILL.md` (frontmatter `name: yaebal-<slug>`, `description`). nine
exist: `write-bot`, `pick-plugin`, `author-plugin`, `test-bot`, `keyboards-and-callbacks`,
`flows`, `ai-features`, `deploy`, `debug`. everything else is generated from them:

```text
skills/*  ──build-plugin.mjs──▶  packages/ai/claude-plugin/   (marketplace plugin)
          ──installers──▶        .claude/skills/ per project  (claude installer target)
          ──rulesDigest()──▶     AGENTS.md / .cursor rules / copilot instructions (compact digest)
```

adding a skill = drop a directory with a SKILL.md, run `pnpm --filter @yaebal/ai generate`,
done — the installer, digest playbook list and claude plugin pick it up automatically. keep
skills accurate the same way the originals were written: verify every identifier against real
package sources before mentioning it; a hallucinating anti-hallucination playbook is worse
than none.

### mcp server (`src/mcp/`)

stdio only (`npx -y @yaebal/ai mcp`), built on `@modelcontextprotocol/sdk` + zod. six tools:
`get_api_method`, `get_api_type` (exact signatures from `@yaebal/types/schema.json` — the
schema is imported via the package export, never copied), `list_plugins`, `get_plugin_doc`,
`search_docs`, `get_example`. data comes from `data/*.json`, generated from the monorepo by
`scripts/build-data.mjs` and shipped in the npm package.

### installer (`src/installers/`, `src/cli.ts`)

`npx @yaebal/ai` — zero-dependency tui multi-select (hand-rolled, `src/installers/tui.ts`)
with per-agent detection. nine targets in `targets.ts`: claude, cursor, codex, opencode,
copilot, windsurf, zed, gemini, agents-md. write rules:

- markdown rules files are managed via `<!-- yaebal:start/end -->` marker blocks —
  `upsertSection` is idempotent, re-runs replace only the managed block.
- json configs (`.mcp.json`, `.cursor/mcp.json`, `opencode.json`, …) are merged, never
  clobbered; unparseable json becomes a `kind: "note"` manual step instead of a write.
- `installAgents(cwd, ids)` is the programmatic api (`@yaebal/ai/installers`) — create-yaebal
  uses it for its `--ai` axis, so the agent list can never drift between the two.

### generated artifacts (checked in, drift-tested)

| artifact                                      | generator                  | drift guard                                        |
|:----------------------------------------------|:---------------------------|:---------------------------------------------------|
| `packages/ai/data/*.json`                     | `scripts/build-data.mjs`   | `src/mcp.test.ts` (catalog membership)             |
| `packages/ai/claude-plugin/`                  | `scripts/build-plugin.mjs` | `src/installers.test.ts` (byte-equal skill copies) |
| `.claude-plugin/marketplace.json` (repo root) | `scripts/build-plugin.mjs` | —                                                  |

`pnpm --filter @yaebal/ai generate` rebuilds all three. the marketplace manifest must live at
the repo root (claude code spec); the plugin body lives under `packages/ai/claude-plugin/` and
the manifest points at it via `"source": "./packages/ai/claude-plugin"`. do not confuse either
with `.claude/` (this repo's own dev config, unrelated).

## integrations shipped

- **create-yaebal** — `--ai <ids|all|none>` flag, config-file key `ai`, tui multi-select step;
  calls `installAgents` after scaffold and before `git init` so agent files land in the first
  commit.
- **examples/ai-chat** — runnable demo (ollama by default, any openai-compatible provider via
  env). listed in both readme tables + the docs examples catalog.
- **docs** — `/docs/plugins/ai/` (runtime), `/docs/llms/` (tooling: installer matrix, mcp
  reference, marketplace), llms.txt / llms-full.txt entries, nav + seo + catalog rows.
- registered in root `README.md`, `docs/ARCHITECTURE.md` §2, `AGENTS.md` layout.

## verification snapshot (as of this doc)

`pnpm typecheck` clean · `pnpm test` all suites `fail 0` (@yaebal/ai 30/30) · `biome check .`
clean · `pnpm docs:check` 0 errors · mcp server smoke-tested over real stdio json-rpc ·
installer smoke-tested against a scratch dir and via a real `create-yaebal --ai` run ·
claude plugin validated (plugin-validator: pass).

## not done yet (the roadmap)

in rough priority order:

1. **tool calling** — let the model call typed bot tools (send a keyboard, look something up)
   with a multi-step loop. design constraint: keep `AiModel` the contract; tool support should
   be an optional capability on the request/adapter, with the ai-sdk bridge mapping to its
   native tools and the fetch adapters implementing openai/anthropic wire formats.
2. **structured output** — typed `generate<T>(schema)` via standard-schema (zod/valibot/arktype),
   so bots can ask for json and get a typed value.
3. **multimodal input** — feed `ctx` photos/voice to vision/transcription models; `@yaebal/files`
   already handles downloads. voice → text → reply is the killer demo.
4. **more skills** — candidates by user demand: `media` (files/media-group/media-cache),
   `i18n`, `payments`, `morda-ui`, `ops` (broadcast/cron/panel/analytics), `mini-app`.
   remember: adding one is cheap (see above), keeping it accurate is the work.
5. **guardrails beyond limits** — moderation hook before/after the model, token budgets
   (needs usage plumbed through streaming adapters), distributed rate limiting on sklad.
6. **`check_code` mcp tool** — lint a yaebal snippet for the antipatterns the skills warn
   about (`use()` for plugins, missing `.js` specifiers, invented callback_data).
7. **429 retry on finalization** — final sends currently propagate a flood error; an
   `retry_after`-aware single retry (or `@yaebal/again` composition guidance) would be kinder.
8. **usage reporting** — `AiReply.usage` is populated by `generate()` adapters but not by
   streams; anthropic/openai both emit usage events in-stream, currently dropped.

## traps for the next agent

- run `pnpm build` in `packages/ai` before testing — tests run over compiled `lib/`, and
  examples typecheck against built `.d.ts` (stale lib = lying errors).
- the test glob must stay `node --test lib/*.test.js` (unquoted; `lib` alone silently no-ops
  on node 25). mcp/installer tests therefore live in top-level `src/*.test.ts` files, not in
  subdirectories.
- `assert.equal(x, undefined)` and `assert.ok(x === undefined)` permanently narrow `x` via
  asserts signatures — later property access types as `never`. use
  `assert.equal(typeof x, "undefined")`.
- `@yaebal/test`'s `createTestEnv` does not wrap `bot.api` — never call `bot.start()` in
  tests; drive updates through actors.
- edits reject forum-topic ids: `editMessageText` params use `ctx.businessRouting()`, new
  messages use `ctx.routing()`. the `StreamTarget` interface encodes this — keep it.
- draft ids must be non-zero; a fresh id per finalized part prevents the old text animating
  into the new part's preview.
- readmes feed `data/plugins.json` and example readmes feed `data/examples.json` — editing
  those means regenerating, or the drift tests fail (that is the point).
