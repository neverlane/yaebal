<script lang="ts">
	import Code from "$lib/Code.svelte";

	const install = `# install everything (workspace bootstrap)
pnpm install

# or add individual packages to your project
pnpm add @yaebal/core @yaebal/session @yaebal/keyboard`;

	const core = [
		["yaebal", "/docs/yaebal/", "batteries-included entry — core + auto-generated contexts + common plugins, one import"],
		["@yaebal/core", "/docs/core/", "Bot, Composer, context, filter queries, media helpers — the engine everything else builds on"],
		["@yaebal/types", "/docs/types/", "full Telegram Bot API types, code-generated from the ark0f schema; single source of truth for all interfaces"],
		["@yaebal/contexts", "/docs/contexts/", "per-update context classes with auto-generated shortcut methods (ctx.reply, ctx.sendPhoto, …)"],
	];

	const plugins: [string, string, string][] = [
		["@yaebal/fmt", "/docs/plugins/fmt/", "html`` / md`` tagged templates → entities, with auto-escaped interpolation"],
		["@yaebal/filters", "/docs/plugins/filters/", "composable, type-narrowing update filters (and / or / not)"],
		["@yaebal/conversation", "/docs/plugins/conversation/", "await-style multi-step dialogs (coroutine, no replay)"],
		["@yaebal/again", "/docs/plugins/again/", "auto-retry on 429 / flood-wait / transient 5xx errors"],
		["@yaebal/session", "/docs/plugins/session/", "per-chat session with pluggable storage adapters"],
		["@yaebal/keyboard", "/docs/plugins/keyboard/", "fluent inline & reply keyboard builders"],
		["@yaebal/callback-data", "/docs/plugins/callback-data/", "typed callback_data pack / unpack"],
		["@yaebal/morda", "/docs/plugins/morda/", "dialogs engine + jsx/hooks (react-for-telegram)"],
		["@yaebal/i18n", "/docs/plugins/i18n/", "per-chat locale, ctx.t / ctx.changeLanguage"],
		["@yaebal/scenes", "/docs/plugins/scenes/", "step-by-step wizards over multiple messages"],
		["@yaebal/prompt", "/docs/plugins/prompt/", "ask a question, await the next message as the answer"],
		["@yaebal/router", "/docs/plugins/router/", "file-based routing from a routes/ directory"],
		["@yaebal/throttle", "/docs/plugins/throttle/", "rate-limit outgoing API calls"],
		["@yaebal/files", "/docs/plugins/files/", "resolve and download Telegram files"],
		["@yaebal/ratelimiter", "/docs/plugins/ratelimiter/", "drop updates from users who send too many requests"],
		["@yaebal/broadcast", "/docs/plugins/broadcast/", "send a message to many chats"],
		["@yaebal/web", "/docs/plugins/web/", "run your bot on edge/web runtimes (Cloudflare Workers, Deno, Bun) via webhooks"],
		["@yaebal/panel", "/docs/plugins/panel/", "operator panel — view chats and reply from the browser"],
		["@yaebal/media-group", "/docs/plugins/media-group/", "collect album updates into one handler"],
		["@yaebal/split", "/docs/plugins/split/", "break long messages into Telegram-sized chunks"],
		["@yaebal/commands", "/docs/plugins/commands/", "one registry for handlers + the / command menu"],
		["@yaebal/pagination", "/docs/plugins/pagination/", "paginated lists with inline prev/next buttons"],
		["@yaebal/media-cache", "/docs/plugins/media-cache/", "reuse a file_id instead of re-uploading the same file"],
		["@yaebal/preview", "/docs/plugins/preview/", "render telegram-style chats to a standalone SVG string (experimental)"],
	];

	const scaling: [string, string, string][] = [
		["@yaebal/runner", "/docs/runner/", "concurrent update processing with per-chat sequentialization"],
		["@yaebal/workers", "/docs/workers/", "worker_threads pool to offload CPU-heavy tasks from handlers"],
		["@yaebal/test", "/docs/plugins/test/", "testing utilities — mock api, update & context factories, middleware runner"],
		["create-yaebal", "/docs/scaffolding/", "project scaffolder — pnpm create yaebal my-bot"],
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
