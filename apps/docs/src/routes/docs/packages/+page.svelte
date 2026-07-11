<script lang="ts">
	import Code from "$lib/Code.svelte";

	const install = `# install everything (workspace bootstrap)
pnpm install

# or add individual packages to your project
pnpm add @yaebal/core @yaebal/session @yaebal/keyboard`;

	const core = [
		["yaebal", "/docs/yaebal/", "batteries-included entry — core + auto-generated contexts + common plugins, one import"],
		["@yaebal/core", "/docs/core/", "Bot, Composer, context, filter queries, media helpers — the engine everything else builds on"],
		["@yaebal/types", "/docs/types/", "full Telegram Bot API types, code-generated from our own parser of the live docs; single source of truth for all interfaces"],
		["@yaebal/contexts", "/docs/contexts/", "per-update context classes with auto-generated shortcut methods (ctx.reply, ctx.sendPhoto, …)"],
	];

	const plugins: [string, string, string][] = [
		["@yaebal/fmt", "/docs/plugins/fmt/", "html`` / md`` tagged templates → entities, with auto-escaped interpolation"],
		["@yaebal/rich", "/docs/plugins/rich/", "sendRichMessage / sendRichMessageDraft: block builder, streaming drafts, full read-side coverage"],
		["@yaebal/filters", "/docs/plugins/filters/", "composable, type-narrowing update filters: and / or / not, commands, deep links, media, async"],
		["@yaebal/guards", "/docs/plugins/guards/", "reusable bot.guard() predicates: isAdmin, isPrivate, isGroup, hasMembership, hasPermission"],
		["@yaebal/conversation", "/docs/plugins/conversation/", "await-style multi-step dialogs (coroutine, no replay)"],
		["@yaebal/again", "/docs/plugins/again/", "awaited retry on structured retry_after / transient 5xx errors"],
		["@yaebal/session", "/docs/plugins/session/", "typed sessions: dirty-checked saves, lazy mode, multi-session, ttl fields, migrations"],
		["@yaebal/sklad", "/docs/plugins/sklad/", "zero-dep storage adapters: memory (ttl/lru), redis, sqlite, cloudflare kv, json file"],
		["@yaebal/cache", "/docs/plugins/cache/", "ctx.cache.get/set/wrap — ttl memoization for api calls and data, dedupes concurrent misses"],
		["@yaebal/keyboard", "/docs/plugins/keyboard/", "fluent inline & reply keyboard builders"],
		["@yaebal/callback-data", "/docs/plugins/callback-data/", "typed callback_data pack / unpack"],
		["@yaebal/payments", "/docs/plugins/payments/", "typed invoice builder (stars / external providers), pre-checkout & successful-payment hooks, star subscriptions"],
		["@yaebal/link-preview", "/docs/plugins/link-preview/", "fluent builder for link_preview_options"],
		["@yaebal/auto-answer", "/docs/plugins/auto-answer/", "auto-clears the callback-query loading spinner, no manual answerCallbackQuery call"],
		["@yaebal/typing", "/docs/plugins/typing/", "ctx.typing(fn) keeps the \"is typing…\" indicator alive for an async call, no manual sendChatAction"],
		["@yaebal/morda", "/docs/plugins/morda/", "dialogs engine + jsx/hooks (react-for-telegram)"],
		["@yaebal/i18n", "/docs/plugins/i18n/", "typed ctx.t (keys + params), Intl plurals, language_code detection"],
		["@yaebal/scenes", "/docs/plugins/scenes/", "durable wizards: typed state, ask() validation, navigation, sub-scenes, ttl"],
		["@yaebal/onboarding", "/docs/plugins/onboarding/", "declarative first-run tutorials with inline controls"],
		["@yaebal/prompt", "/docs/plugins/prompt/", "ask a question, await the next message as the answer"],
		["@yaebal/router", "/docs/plugins/router/", "file-based routing from a routes/ directory"],
		["@yaebal/toml", "/docs/plugins/toml/", "declarative toml routes with a typescript handler registry"],
		["@yaebal/throttle", "/docs/plugins/throttle/", "priority outbound scheduler with global/private/group buckets"],
		["@yaebal/files", "/docs/plugins/files/", "inspect, link, stream and download Telegram files"],
		["@yaebal/file-id", "/docs/plugins/file-id/", "parse and re-serialize file_id / file_unique_id strings"],
		["@yaebal/ratelimiter", "/docs/plugins/ratelimiter/", "drop updates from users who send too many requests"],
		["@yaebal/broadcast", "/docs/plugins/broadcast/", "typed broadcast jobs with storage, retry, progress and controls"],
		["@yaebal/cron", "/docs/plugins/cron/", "typed cron jobs: declarative schedules, overlap control, graceful shutdown"],
		["@yaebal/web", "/docs/plugins/web/", "webhooks on any runtime — edge, node/bun/deno servers, serverless, and fetch frameworks; adapters, sequentialize, dedupe, lifecycle"],
		["@yaebal/panel", "/docs/plugins/panel/", "framework-agnostic operator panel with media, keyboards and events"],
		["@yaebal/analytics", "/docs/plugins/analytics/", "ctx.track(event, properties) with pluggable sinks: posthog, plausible, sqlite, clickhouse"],
		["@yaebal/audit-log", "/docs/plugins/audit-log/", "structured logging of updates and api calls — sinks, formatters, filters, sampling"],
		["@yaebal/media-group", "/docs/plugins/media-group/", "collect albums into one handler call or ctx.mediaGroup"],
		["@yaebal/split", "/docs/plugins/split/", "long text as multiple messages — entities survive the split"],
		["@yaebal/commands", "/docs/plugins/commands/", "one registry for handlers + the / command menu — localized, scoped, diff-synced"],
		["@yaebal/pagination", "/docs/plugins/pagination/", "paginated lists over any source — lazy fetch, item buttons, typed payload"],
		["@yaebal/media-cache", "/docs/plugins/media-cache/", "upload once, reuse the file_id — self-heals when telegram rejects it"],
		["@yaebal/preview", "/docs/plugins/preview/", "render telegram-style chats to a standalone SVG string (experimental)"],
	];

	const scaling: [string, string, string][] = [
		["@yaebal/runner", "/docs/runner/", "concurrent update processing with per-chat sequentialization"],
		["@yaebal/workers", "/docs/workers/", "worker_threads pool to offload CPU-heavy tasks from handlers"],
		["@yaebal/test", "/docs/plugins/test/", "testing utilities — mock api with real hooks & error simulation, update factories for every update kind, webhook helpers"],
		["create-yaebal", "/docs/scaffolding/", "project scaffolder — pnpm create yaebal"],
	];
</script>

<svelte:head>
	<title>packages — yaebal</title>
</svelte:head>

<h1>packages</h1>
<p class="lead">
	yaebal is a pnpm monorepo. three foundation packages, a stack of first-party plugins, plus scaling
	and tooling — all under the <code>@yaebal/*</code> npm scope, published as ESM with full TypeScript
	types.
</p>

<Code code={install} lang="sh" title="terminal" />

<h2>foundation</h2>
<table>
	<thead>
		<tr><th>package</th><th>description</th></tr>
	</thead>
	<tbody>
		{#each core as [name, href, desc]}
			<tr>
				<td><a href={href}><code>{name}</code></a></td>
				<td>{desc}</td>
			</tr>
		{/each}
	</tbody>
</table>

<h2>plugins</h2>
<p>
	each plugin is a typed composer extension. installing one enriches the context type; its
	dependencies are checked at compile time. see the <a href="/docs/plugins/">plugins overview</a>
	for a quick orientation.
</p>
<table>
	<thead>
		<tr><th>package</th><th>description</th></tr>
	</thead>
	<tbody>
		{#each plugins as [name, href, desc]}
			<tr>
				<td><a href={href}><code>{name}</code></a></td>
				<td>{desc}</td>
			</tr>
		{/each}
	</tbody>
</table>

<h2>scaling &amp; tooling</h2>
<table>
	<thead>
		<tr><th>package</th><th>description</th></tr>
	</thead>
	<tbody>
		{#each scaling as [name, href, desc]}
			<tr>
				<td><a href={href}><code>{name}</code></a></td>
				<td>{desc}</td>
			</tr>
		{/each}
	</tbody>
</table>

<div class="note">
	all packages require Node.js ≥ 20 and are ESM-only (<code>"type": "module"</code>). use
	<code>import type</code> for type-only imports — <code>verbatimModuleSyntax</code> is enabled
	across the workspace.
</div>
