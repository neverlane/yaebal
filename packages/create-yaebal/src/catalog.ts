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
	| "broadcast";

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
		hint: "per-chat locale + ctx.t",
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
		id: "files",
		dep: "@yaebal/files",
		hint: "ctx.files: resolve & download telegram files",
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
		hint: "composable type-narrowing filters",
		wire: "dep",
		import: 'import { and, command, isPrivate, regex, text } from "@yaebal/filters";',
	},
	{
		id: "callback-data",
		dep: "@yaebal/callback-data",
		hint: "typed callback_data pack/unpack",
		wire: "dep",
		import: 'import { callbackData } from "@yaebal/callback-data";',
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
		hint: "finite-state scene flows",
		wire: "dep",
		import: 'import { scenes } from "@yaebal/scenes";',
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
		hint: "paginated inline lists",
		wire: "dep",
		import: 'import { pagination } from "@yaebal/pagination";',
	},
	{
		id: "media-group",
		dep: "@yaebal/media-group",
		hint: "collect album updates into one call",
		wire: "dep",
		import: 'import { mediaGroup } from "@yaebal/media-group";',
	},
	{
		id: "media-cache",
		dep: "@yaebal/media-cache",
		hint: "reuse file_id instead of re-uploading",
		wire: "dep",
		import: 'import { mediaCache } from "@yaebal/media-cache";',
	},
	{
		id: "broadcast",
		dep: "@yaebal/broadcast",
		hint: "typed broadcast jobs with progress, retry and controls",
		wire: "dep",
		import: 'import { Broadcast } from "@yaebal/broadcast";',
	},
	{
		id: "split",
		dep: "@yaebal/split",
		hint: "split long text across messages",
		wire: "dep",
		import: 'import { split } from "@yaebal/split";',
	},
	{
		id: "runner",
		dep: "@yaebal/runner",
		hint: "concurrent update processing (run())",
		wire: "dep",
		import: 'import { run } from "@yaebal/runner";',
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
