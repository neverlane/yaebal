// GENERATED FILE — do not edit by hand.
// source of truth: examples/README.md ("## bots" and "## patterns to copy" tables).
// regenerate with: node apps/docs/scripts/generate-examples-catalog.mjs

export interface ExampleCatalogEntry {
	name: string;
	package: string;
	focus: string;
	run: string;
}

export const EXAMPLES_CATALOG: readonly ExampleCatalogEntry[] = [
	{
		"name": "core-echo",
		"package": "@yaebal/example-core-echo",
		"focus": "bare @yaebal/core: middleware, filter narrowing, format, raw typed api.call",
		"run": "pnpm --filter @yaebal/example-core-echo dev"
	},
	{
		"name": "basic",
		"package": "@yaebal/example-basic",
		"focus": "whole-stack tour on yaebal: session, keyboard, callback-data, morda, i18n, scenes, prompt, filters, fmt, retry, throttle, cache",
		"run": "pnpm --filter @yaebal/example-basic dev"
	},
	{
		"name": "again",
		"package": "@yaebal/example-again",
		"focus": "awaited retry, retry_after, transient failures, retry metrics",
		"run": "pnpm --filter @yaebal/example-again dev"
	},
	{
		"name": "ai-chat",
		"package": "@yaebal/example-ai-chat",
		"focus": "@yaebal/ai: streamed replies (drafts in private, edits in groups), conversation memory, AiLimitError handling",
		"run": "pnpm --filter @yaebal/example-ai-chat dev"
	},
	{
		"name": "throttle",
		"package": "@yaebal/example-throttle",
		"focus": "outbound buckets, priorities, cancellation, scheduler metrics",
		"run": "pnpm --filter @yaebal/example-throttle dev"
	},
	{
		"name": "broadcast",
		"package": "@yaebal/example-broadcast",
		"focus": "typed broadcast jobs, pause, resume, cancel, retry, progress",
		"run": "pnpm --filter @yaebal/example-broadcast dev"
	},
	{
		"name": "cron",
		"package": "@yaebal/example-cron",
		"focus": "intervals, cron expressions with per-job tz, retries + backoff, timeoutMs, overlap: \"wait\", catch-up via a persisted store, ctx.cron, cronAdmin ops commands",
		"run": "pnpm --filter @yaebal/example-cron dev"
	},
	{
		"name": "keyboard",
		"package": "@yaebal/example-keyboard",
		"focus": "inline and reply keyboard builders, every button type, request user/chat/managed bot",
		"run": "pnpm --filter @yaebal/example-keyboard dev"
	},
	{
		"name": "auto-answer",
		"package": "@yaebal/example-auto-answer",
		"focus": "\"deadline\" default racing a handler's own alert, fallback ack on a forgotten handler, skipAutoAnswer(), filter()",
		"run": "pnpm --filter @yaebal/example-auto-answer dev"
	},
	{
		"name": "guards",
		"package": "@yaebal/example-guards",
		"focus": "safe guard+getChatMember pattern, membership() caching, guardOr answering a denial, bot's own permission check, anonymous admin/owner",
		"run": "pnpm --filter @yaebal/example-guards dev"
	},
	{
		"name": "commands",
		"package": "@yaebal/example-commands",
		"focus": "typed command registry: localized menus, scopes, aliases, hidden commands, diff-based sync",
		"run": "pnpm --filter @yaebal/example-commands dev"
	},
	{
		"name": "pagination",
		"package": "@yaebal/example-pagination",
		"focus": "lazy sources (count + limit+1 probing), item buttons with onSelect, typed payload, button() menu morphing and back-navigation, ownership filter",
		"run": "pnpm --filter @yaebal/example-pagination dev"
	},
	{
		"name": "session",
		"package": "@yaebal/example-session",
		"focus": "session v2: dirty-checked saves, file storage, two independent sessions (key + keyBy.user), ttl() fields, clearSession, migrations",
		"run": "pnpm --filter @yaebal/example-session dev"
	},
	{
		"name": "simple",
		"package": "@yaebal/example-simple",
		"focus": "toml route config plus typescript handlers",
		"run": "pnpm --filter @yaebal/example-simple dev"
	},
	{
		"name": "onboarding",
		"package": "@yaebal/example-onboarding",
		"focus": "first-run product tour, force restart, dismiss, opt-out",
		"run": "pnpm --filter @yaebal/example-onboarding dev"
	},
	{
		"name": "feature-flags",
		"package": "@yaebal/example-feature-flags",
		"focus": "percentage rollout, kill-switch rule, chat-type targeting, multivariate (A/B/n) flag, per-bucket + global overrides with ttl, envProvider, whenFlag branch, flagsAdmin ops commands",
		"run": "pnpm --filter @yaebal/example-feature-flags dev"
	},
	{
		"name": "audit-log",
		"package": "@yaebal/example-audit-log",
		"focus": "correlated, redacted-by-default structured logging, applyRedaction, memorySink, chatSink, auditAdmin ops commands",
		"run": "pnpm --filter @yaebal/example-audit-log dev"
	},
	{
		"name": "analytics",
		"package": "@yaebal/example-analytics",
		"focus": "typed event catalog, autoTrack (commands/callbacks/messages), ctx.identify, context() enricher, multiple adapters, analyticsAdmin ops commands",
		"run": "pnpm --filter @yaebal/example-analytics dev"
	},
	{
		"name": "rich-messages",
		"package": "@yaebal/example-rich-messages",
		"focus": "rich blocks, markdown/html builders, fake streaming draft, rich message readback",
		"run": "pnpm --filter @yaebal/example-rich-messages dev"
	},
	{
		"name": "panel",
		"package": "@yaebal/example-panel",
		"focus": "operator dashboard, media viewer, callbacks, outgoing replies, realtime events",
		"run": "pnpm --filter @yaebal/example-panel dev"
	},
	{
		"name": "commerce-suite",
		"package": "@yaebal/example-commerce-suite",
		"focus": "shop bot with session cart, i18n, pagination, commands, callback-data, ratelimiter",
		"run": "pnpm --filter @yaebal/example-commerce-suite dev"
	},
	{
		"name": "dialog-quest",
		"package": "@yaebal/example-dialog-quest",
		"focus": "morda cockpit, scene wizard, prompt, conversation, session profile",
		"run": "pnpm --filter @yaebal/example-dialog-quest dev"
	},
	{
		"name": "state-machine",
		"package": "@yaebal/example-state-machine",
		"focus": "typed events driving transitions, a guard you can trip interactively, per-state onEnter hooks, reset()",
		"run": "pnpm --filter @yaebal/example-state-machine dev"
	},
	{
		"name": "morda-jsx",
		"package": "@yaebal/example-morda-jsx",
		"focus": "jsx screens with hooks: persisted useState/useEffect, useDialogData, widgets (Toggle/Select/Counter/Pagination), onText input",
		"run": "pnpm --filter @yaebal/example-morda-jsx dev"
	},
	{
		"name": "media-studio",
		"package": "@yaebal/example-media-studio",
		"focus": "albums, file metadata + links, file_id introspection, media cache, svg previews, entity-aware long message splitting + caption strategy",
		"run": "pnpm --filter @yaebal/example-media-studio dev"
	},
	{
		"name": "modular-router",
		"package": "@yaebal/example-modular-router",
		"focus": "typed define*() file-based routes (commands/on/hears/use), a nested _guard.ts, syncCommands, watchRoutes hot-reload",
		"run": "pnpm --filter @yaebal/example-modular-router dev"
	},
	{
		"name": "webhook-edge",
		"package": "@yaebal/example-webhook-edge",
		"focus": "serve() on node, sequentialize + dedupe, setWebhook / getWebhookInfo, secret token, path routing",
		"run": "pnpm --filter @yaebal/example-webhook-edge dev"
	},
	{
		"name": "runner-workers",
		"package": "@yaebal/example-runner-workers",
		"focus": "concurrent polling and worker thread offload",
		"run": "pnpm --filter @yaebal/example-runner-workers dev"
	},
	{
		"name": "testing-lab",
		"package": "@yaebal/example-testing-lab",
		"focus": "bot factory plus actor-driven tests",
		"run": "pnpm --filter @yaebal/example-testing-lab test"
	},
	{
		"name": "inline-search",
		"package": "@yaebal/example-inline-search",
		"focus": "core + @yaebal/contexts layering: contextFor, inline.answer(), pagination offset, chosen-result analytics",
		"run": "pnpm --filter @yaebal/example-inline-search dev"
	},
	{
		"name": "payments-stars",
		"package": "@yaebal/example-payments-stars",
		"focus": "telegram stars invoices, pre-checkout approval, successful payment, refund",
		"run": "pnpm --filter @yaebal/example-payments-stars dev"
	},
	{
		"name": "mini-app",
		"package": "@yaebal/example-mini-app",
		"focus": "HMAC + Ed25519 initData validation, Authorization: tma backend, answerWebAppQuery, web_app_data, direct/attachment-menu links",
		"run": "pnpm --filter @yaebal/example-mini-app dev"
	}
];

export interface PatternCatalogEntry {
	pattern: string;
	copyFrom: string;
}

export const PATTERN_CATALOG: readonly PatternCatalogEntry[] = [
	{
		"pattern": "bare core, no plugins",
		"copyFrom": "core-echo"
	},
	{
		"pattern": "core + contexts by hand",
		"copyFrom": "inline-search"
	},
	{
		"pattern": "single-file product demo",
		"copyFrom": "basic"
	},
	{
		"pattern": "plugin in isolation",
		"copyFrom": "again, throttle, keyboard, auto-answer, guards, commands, onboarding, rich-messages, state-machine"
	},
	{
		"pattern": "production operator tooling",
		"copyFrom": "broadcast, panel, webhook-edge, runner-workers"
	},
	{
		"pattern": "business workflow",
		"copyFrom": "commerce-suite, payments-stars, inline-search"
	},
	{
		"pattern": "multi-step ux",
		"copyFrom": "dialog-quest, testing-lab"
	},
	{
		"pattern": "media-heavy workflow",
		"copyFrom": "media-studio"
	},
	{
		"pattern": "large codebase routing",
		"copyFrom": "modular-router, simple"
	}
];
