/**
 * static catalog of everything the scaffolder can offer: runtimes, package
 * managers, project templates and the full `@yaebal/*` plugin set.
 *
 * this module is pure data + a couple of tiny lookups. both the tui and the
 * plain prompt fallback read from here, so the two front-ends can never drift.
 */

export type Runtime = "node" | "bun" | "deno";
export type PackageManager = "npm" | "pnpm" | "yarn" | "bun" | "deno";
export type TemplateId =
	| "minimal"
	| "echo"
	| "commands"
	| "buttons"
	| "conversation"
	| "i18n"
	| "session-counter"
	| "webhook"
	| "runner"
	| "rich-message"
	| "broadcast"
	| "toml"
	| "plugin";

/**
 * where the generated bot ships. orthogonal to `TemplateId` — a deploy target
 * only adds infra files (and, for the serverless ones, takes over the
 * bootstrap the way `webhook`/`runner` templates already do). never offered
 * for `template: "plugin"` (a plugin package has nowhere to deploy).
 */
export type DeployTarget =
	| "none"
	| "docker"
	| "compose"
	| "fly"
	| "railway"
	| "cloudflare"
	| "vercel";

export interface Choice<T extends string> {
	value: T;
	label: string;
	hint: string;
}

export const RUNTIMES: Choice<Runtime>[] = [
	{ value: "node", label: "node.js", hint: "the project standard — ts via type-stripping" },
	{ value: "bun", label: "bun", hint: "fast all-in-one runtime, runs ts natively" },
	{ value: "deno", label: "deno", hint: "secure by default, native ts & web apis" },
];

export const PACKAGE_MANAGERS: Choice<PackageManager>[] = [
	{ value: "npm", label: "npm", hint: "ships with node" },
	{ value: "pnpm", label: "pnpm", hint: "fast, disk-efficient (recommended)" },
	{ value: "yarn", label: "yarn", hint: "classic / berry" },
	{ value: "bun", label: "bun", hint: "bun's built-in installer" },
	{ value: "deno", label: "deno", hint: "no install step — deno cache" },
];

export const TEMPLATES: Choice<TemplateId>[] = [
	{ value: "minimal", label: "minimal", hint: "just /start + a text echo" },
	{ value: "echo", label: "echo", hint: "echo text, photos and stickers back" },
	{ value: "commands", label: "commands", hint: "/start /help /ping with a command menu" },
	{ value: "buttons", label: "buttons", hint: "inline keyboard + typed callback_data" },
	{ value: "conversation", label: "conversation", hint: "await-style multi-step dialog" },
	{ value: "i18n", label: "i18n", hint: "multi-language bot with /lang toggle" },
	{ value: "session-counter", label: "session-counter", hint: "per-chat counter on ctx.session" },
	{ value: "webhook", label: "webhook", hint: "edge/serverless deploy via @yaebal/web" },
	{ value: "runner", label: "runner", hint: "concurrent long-polling via @yaebal/runner" },
	{
		value: "rich-message",
		label: "rich-message",
		hint: "sendRichMessage block builder + a streaming draft demo via @yaebal/rich",
	},
	{
		value: "broadcast",
		label: "broadcast",
		hint: "subscriber list + typed broadcast jobs via @yaebal/broadcast",
	},
	{
		value: "toml",
		label: "toml",
		hint: "declarative routes in bot.toml via @yaebal/toml",
	},
	{
		value: "plugin",
		label: "plugin",
		hint: "author a reusable yaebal plugin package",
	},
];

export const DEPLOYS: Choice<DeployTarget>[] = [
	{ value: "none", label: "none", hint: "just the project — deploy it however you like" },
	{
		value: "docker",
		label: "docker",
		hint: "multi-stage Dockerfile — any host that runs a container",
	},
	{
		value: "compose",
		label: "docker compose",
		hint: "Dockerfile + compose.yaml for local/vps runs",
	},
	{ value: "fly", label: "fly.io", hint: "Dockerfile + fly.toml — `fly launch` and go" },
	{
		value: "railway",
		label: "railway",
		hint: "Dockerfile + railway.json — connect the repo and deploy",
	},
	{
		value: "cloudflare",
		label: "cloudflare workers",
		hint: "wrangler.jsonc — serverless webhook, no server to run",
	},
	{ value: "vercel", label: "vercel", hint: "vercel.json + an edge function — serverless webhook" },
];

/**
 * how a plugin is wired into the generated `src/index.ts`:
 * - `install` → added to the `new Bot(token).install(expr)` chain
 * - `setup`   → a statement run against `bot.api` after the bot is built
 * - `dep`     → dependency + a commented import hint (wire it yourself)
 */
export type WireKind = "install" | "setup" | "dep";

export interface PluginDef {
	/** key used on the cli (`--plugins a,b`) and in prompts */
	id: string;
	/** npm package added to dependencies */
	dep: string;
	/** one-line description shown in pickers */
	hint: string;
	wire: WireKind;
	/** import line emitted at the top of the file */
	import: string;
	/** expression for `.install(...)` when wire === "install" */
	install?: string;
	/** statement appended after bot creation when wire === "setup" */
	setup?: string;
	/** recommended in the default selection */
	recommended?: boolean;
	/**
	 * commented-out alternatives appended right after the install/setup line —
	 * shows real, importable adapter names for plugins that ship more than one
	 * backend, without pulling their peer deps in or risking a compile error
	 * (it's a comment, never live code).
	 */
	showcase?: string;
}

/**
 * the full plugin catalog — every published `@yaebal/*` plugin is supported.
 *
 * `install`/`setup` plugins generate fully-wired, type-checking code; `dep`
 * plugins are added to package.json with a commented import so the starter
 * never ships code that doesn't compile, while still pulling the package in.
 */
export const PLUGINS: PluginDef[] = [
	// ── wired: installed into the bot chain ───────────────────────────────
	{
		id: "session",
		dep: "@yaebal/session",
		hint: "per-chat state on ctx.session",
		wire: "install",
		import: 'import { session } from "@yaebal/session";',
		install: "session({ initial: () => ({ count: 0 }) })",
		recommended: true,
	},
	{
		id: "i18n",
		dep: "@yaebal/i18n",
		hint: "typed ctx.t + per-chat locale",
		wire: "install",
		import: 'import { i18n } from "@yaebal/i18n";',
		install: 'i18n({ defaultLocale: "en", locales: { en: { hi: "hi there!" } } })',
	},
	{
		id: "ratelimiter",
		dep: "@yaebal/ratelimiter",
		hint: "drop floods of incoming updates",
		wire: "install",
		import: 'import { ratelimiter } from "@yaebal/ratelimiter";',
		install: "ratelimiter()",
	},
	{
		id: "auto-answer",
		dep: "@yaebal/auto-answer",
		hint: "auto-clears the callback-query loading spinner",
		wire: "install",
		import: 'import { autoAnswer } from "@yaebal/auto-answer";',
		install: "autoAnswer()",
	},
	{
		id: "typing",
		dep: "@yaebal/typing",
		hint: "ctx.typing(fn) keeps the typing indicator alive for an async call",
		wire: "install",
		import: 'import { typing } from "@yaebal/typing";',
		install: "typing()",
	},
	{
		id: "files",
		dep: "@yaebal/files",
		hint: "ctx.files: inspect, stream & download telegram files",
		wire: "install",
		import: 'import { files } from "@yaebal/files";',
		install: "files()",
	},
	{
		id: "rich",
		dep: "@yaebal/rich",
		hint: "ctx.sendRichMessage / ctx.richMessageDraft — telegram's block-tree messages",
		wire: "install",
		import: 'import { rich } from "@yaebal/rich";',
		install: "rich()",
	},
	{
		id: "prompt",
		dep: "@yaebal/prompt",
		hint: "ctx.prompt — ask & await one reply",
		wire: "install",
		import: 'import { prompt } from "@yaebal/prompt";',
		install: "prompt()",
	},
	{
		id: "analytics",
		dep: "@yaebal/analytics",
		hint: "ctx.track(event, properties) — posthog/plausible/sqlite/clickhouse sinks",
		wire: "install",
		import: 'import { analytics, consoleAdapter } from "@yaebal/analytics";',
		install: "analytics({ adapters: [consoleAdapter()] })",
		showcase: `// swap consoleAdapter() for a real sink — each adapter takes a client instance:
// import { postHogAdapter } from "@yaebal/analytics";   adapters: [postHogAdapter(posthogClient)]
// import { plausibleAdapter } from "@yaebal/analytics"; adapters: [plausibleAdapter({ domain: "mybot.example" })]
// import { sqliteAdapter } from "@yaebal/analytics";    adapters: [sqliteAdapter(db)]
// import { clickhouseAdapter } from "@yaebal/analytics"; adapters: [clickhouseAdapter(clickhouseClient)]`,
	},
	{
		id: "audit-log",
		dep: "@yaebal/audit-log",
		hint: "structured logging of updates & api calls — formatters, filters, sampling",
		wire: "install",
		import: 'import { auditLog } from "@yaebal/audit-log";',
		install: "auditLog()",
	},
	{
		id: "cron",
		dep: "@yaebal/cron",
		hint: "typed cron jobs — declarative schedule, graceful shutdown",
		wire: "install",
		import: 'import { cron } from "@yaebal/cron";',
		install: 'cron({ jobs: { heartbeat: { schedule: 60_000, task: () => console.log("tick") } } })',
	},
	{
		id: "cache",
		dep: "@yaebal/cache",
		hint: "ctx.cache.get/set/wrap — ttl memoization for api calls and data",
		wire: "install",
		import: 'import { cache } from "@yaebal/cache";',
		install: "cache({ ttl: 60_000 })",
	},
	{
		id: "feature-flags",
		dep: "@yaebal/feature-flags",
		hint: "ctx.flags.isEnabled/getVariant(key) — typed rollout + targeting, LaunchDarkly/GrowthBook/env adapters",
		wire: "install",
		import: 'import { featureFlags } from "@yaebal/feature-flags";',
		install:
			'featureFlags({ flags: { "new-ui": { default: false, rules: [{ percentage: 25 }] } } })',
		showcase: `// consult a remote provider before the local catalog — providers win, local rules are the fallback:
// import { launchDarklyAdapter } from "@yaebal/feature-flags";
// featureFlags({ flags: { ... }, provider: launchDarklyAdapter(ldClient) })
// import { growthBookAdapter } from "@yaebal/feature-flags";
// featureFlags({ flags: { ... }, provider: growthBookAdapter(gbClient) })`,
	},
	{
		id: "payments",
		dep: "@yaebal/payments",
		hint: "typed invoice builder + pre-checkout/successful-payment hooks (stars & subscriptions)",
		wire: "install",
		import: 'import { payments } from "@yaebal/payments";',
		install: "payments({ onPreCheckout: () => true })",
	},
	{
		id: "mini-app",
		dep: "@yaebal/mini-app",
		hint: "ctx.miniApp.validate(initData) — telegram Mini Apps initData validation + web_app_data helpers",
		wire: "install",
		import: 'import { miniApp } from "@yaebal/mini-app";',
		install: "miniApp({ botToken: process.env.BOT_TOKEN! })",
	},
	{
		id: "split",
		dep: "@yaebal/split",
		hint: "ctx.sendLong / ctx.replyLong — long text as multiple messages, entities included",
		wire: "install",
		import: 'import { splitter } from "@yaebal/split";',
		install: "splitter()",
	},
	// ── wired: api transformers applied after build ───────────────────────
	{
		id: "again",
		dep: "@yaebal/again",
		hint: "awaited retry on structured retry_after / 5xx",
		wire: "setup",
		import: 'import { autoRetry } from "@yaebal/again";',
		setup: "autoRetry(bot.api);",
		recommended: true,
	},
	{
		id: "throttle",
		dep: "@yaebal/throttle",
		hint: "priority outbound scheduler with Telegram buckets",
		wire: "setup",
		import: 'import { throttle } from "@yaebal/throttle";',
		setup: "throttle(bot.api);",
	},
	// ── dep-only: pulled in + commented import, wire to taste ──────────────
	{
		id: "fmt",
		dep: "@yaebal/fmt",
		hint: "html`` / md`` tagged templates",
		wire: "dep",
		import: 'import { html, md } from "@yaebal/fmt";',
		recommended: true,
	},
	{
		id: "keyboard",
		dep: "@yaebal/keyboard",
		hint: "fluent inline & reply keyboards",
		wire: "dep",
		import: 'import { InlineKeyboard, Keyboard } from "@yaebal/keyboard";',
	},
	{
		id: "filters",
		dep: "@yaebal/filters",
		hint: "composable type-narrowing filters (and/or/not, deep links, async)",
		wire: "dep",
		import: 'import { and, command, deeplink, isPrivate, or, regex } from "@yaebal/filters";',
	},
	{
		id: "guards",
		dep: "@yaebal/guards",
		hint: "reusable bot.guard() predicates: isAdmin, isPrivate, isGroup, hasMembership, hasPermission",
		wire: "dep",
		import: 'import { hasPermission, isAdmin, isGroup, isPrivate } from "@yaebal/guards";',
	},
	{
		id: "callback-data",
		dep: "@yaebal/callback-data",
		hint: "typed callback_data pack/unpack",
		wire: "dep",
		import: 'import { callbackData, field } from "@yaebal/callback-data";',
	},
	{
		id: "link-preview",
		dep: "@yaebal/link-preview",
		hint: "fluent builder for link_preview_options",
		wire: "dep",
		import: 'import { linkPreview } from "@yaebal/link-preview";',
	},
	{
		id: "commands",
		dep: "@yaebal/commands",
		hint: "command registry + telegram menu",
		wire: "dep",
		import: 'import { commands } from "@yaebal/commands";',
	},
	{
		id: "conversation",
		dep: "@yaebal/conversation",
		hint: "await-style multi-step dialogs",
		wire: "dep",
		import: 'import { conversation } from "@yaebal/conversation";',
	},
	{
		id: "scenes",
		dep: "@yaebal/scenes",
		hint: "durable step-by-step wizards",
		wire: "dep",
		import: 'import { ask, defineScene, scenes } from "@yaebal/scenes";',
	},
	{
		id: "state-machine",
		dep: "@yaebal/state-machine",
		hint: "declarative finite-state machines: typed events, guarded transitions",
		wire: "dep",
		import: 'import { defineMachine, stateMachine } from "@yaebal/state-machine";',
	},
	{
		id: "onboarding",
		dep: "@yaebal/onboarding",
		hint: "declarative first-run product tours",
		wire: "dep",
		import: 'import { createOnboarding } from "@yaebal/onboarding";',
	},
	{
		id: "morda",
		dep: "@yaebal/morda",
		hint: "declarative windows & stack navigation",
		wire: "dep",
		import: 'import { dialogs, button, back, switchTo } from "@yaebal/morda";',
	},
	{
		id: "router",
		dep: "@yaebal/router",
		hint: "file-system style update routing",
		wire: "dep",
		import: 'import { routeFromFile } from "@yaebal/router";',
	},
	{
		id: "pagination",
		dep: "@yaebal/pagination",
		hint: "paginated lists: lazy sources, item buttons, typed payload",
		wire: "dep",
		import: 'import { pagination } from "@yaebal/pagination";',
	},
	{
		id: "media-group",
		dep: "@yaebal/media-group",
		hint: "collect albums into one call or ctx.mediaGroup",
		wire: "dep",
		import: 'import { mediaGroup } from "@yaebal/media-group";',
	},
	{
		id: "media-cache",
		dep: "@yaebal/media-cache",
		hint: "upload once, reuse the file_id — self-heals stale ids",
		wire: "dep",
		import: 'import { mediaCache } from "@yaebal/media-cache";',
	},
	{
		id: "file-id",
		dep: "@yaebal/file-id",
		hint: "parse file_id/file_unique_id — dc, access hash, dedupe keys",
		wire: "dep",
		import: 'import { FileId } from "@yaebal/file-id";',
	},
	{
		id: "broadcast",
		dep: "@yaebal/broadcast",
		hint: "typed broadcast jobs with progress, retry and controls",
		wire: "dep",
		import: 'import { Broadcast } from "@yaebal/broadcast";',
	},
	{
		id: "toml",
		dep: "@yaebal/toml",
		hint: "declarative toml routes + handler registry",
		wire: "dep",
		import: 'import { installToml } from "@yaebal/toml";',
	},
	{
		id: "runner",
		dep: "@yaebal/runner",
		hint: "concurrent update processing (run())",
		wire: "dep",
		import: 'import { run } from "@yaebal/runner";',
	},
	{
		id: "panel",
		dep: "@yaebal/panel",
		hint: "operator panel — view chats and reply from the browser, over your own http server",
		wire: "dep",
		import:
			'import { MemoryPanelStore, panelHandler, recorder, recordOutgoing } from "@yaebal/panel";',
	},
	{
		id: "web",
		dep: "@yaebal/web",
		hint: "run on edge/web via webhooks",
		wire: "dep",
		import: 'import { webhook, serve } from "@yaebal/web";',
	},
	{
		id: "workers",
		dep: "@yaebal/workers",
		hint: "offload cpu-heavy work to a pool",
		wire: "dep",
		import: 'import { createPool } from "@yaebal/workers";',
	},
];

export const PLUGIN_IDS: string[] = PLUGINS.map((p) => p.id);

export function findPlugin(id: string): PluginDef | undefined {
	return PLUGINS.find((p) => p.id === id);
}

export function isRuntime(v: string): v is Runtime {
	return v === "node" || v === "bun" || v === "deno";
}

export function isPackageManager(v: string): v is PackageManager {
	return v === "npm" || v === "pnpm" || v === "yarn" || v === "bun" || v === "deno";
}

export function isTemplate(v: string): v is TemplateId {
	return TEMPLATES.some((t) => t.value === v);
}

export function isDeploy(v: string): v is DeployTarget {
	return DEPLOYS.some((d) => d.value === v);
}
