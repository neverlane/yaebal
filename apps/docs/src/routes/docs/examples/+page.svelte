<script lang="ts">
	import Code from "$lib/Code.svelte";
	import Try from "$lib/Try.svelte";

	const GH = "https://github.com/neverlane/yaebal/tree/master/examples";

	const run = `# from a clone of the monorepo
pnpm install

# copy an env template, then add BOT_TOKEN
cp examples/commerce-suite/.env.example examples/commerce-suite/.env

# run with reload
pnpm --filter @yaebal/example-commerce-suite dev`;

	const test = `# smoke-test every example workspace
pnpm -r --filter "./examples/*" run test

# run the actor-driven test example only
pnpm --filter @yaebal/example-testing-lab test`;

	const examples = [
		{
			name: "basic",
			focus: "whole-stack plugin tour",
			plugins: "again, callback-data, filters, fmt, i18n, keyboard, morda, prompt, scenes, session, throttle",
			run: "pnpm --filter @yaebal/example-basic dev",
		},
		{
			name: "again",
			focus: "awaited retry and retry metrics",
			plugins: "again",
			run: "pnpm --filter @yaebal/example-again dev",
		},
		{
			name: "throttle",
			focus: "outbound buckets, priorities, cancellation",
			plugins: "again, throttle",
			run: "pnpm --filter @yaebal/example-throttle dev",
		},
		{
			name: "broadcast",
			focus: "typed delivery jobs and controls",
			plugins: "broadcast",
			run: "pnpm --filter @yaebal/example-broadcast dev",
		},
		{
			name: "keyboard",
			focus: "every inline and reply keyboard feature",
			plugins: "keyboard",
			run: "pnpm --filter @yaebal/example-keyboard dev",
		},
		{
			name: "commands",
			focus: "typed command registry: localized menus, scopes, hidden commands, diff sync",
			plugins: "commands, session",
			run: "pnpm --filter @yaebal/example-commands dev",
		},
		{
			name: "simple",
			focus: "toml routes plus handler registry",
			plugins: "toml",
			run: "pnpm --filter @yaebal/example-simple dev",
		},
		{
			name: "onboarding",
			focus: "first-run tour, dismiss, opt-out",
			plugins: "onboarding",
			run: "pnpm --filter @yaebal/example-onboarding dev",
		},
		{
			name: "rich-messages",
			focus: "rich blocks and draft streaming",
			plugins: "rich",
			run: "pnpm --filter @yaebal/example-rich-messages dev",
		},
		{
			name: "panel",
			focus: "operator dashboard and media timeline",
			plugins: "again, panel",
			run: "pnpm --filter @yaebal/example-panel dev",
		},
		{
			name: "commerce-suite",
			focus: "shop bot with cart, catalog and locale",
			plugins: "callback-data, commands, filters, fmt, i18n, keyboard, pagination, ratelimiter, session",
			run: "pnpm --filter @yaebal/example-commerce-suite dev",
		},
		{
			name: "dialog-quest",
			focus: "cockpit menu, wizard, prompt and support flow",
			plugins: "conversation, morda, prompt, scenes, session",
			run: "pnpm --filter @yaebal/example-dialog-quest dev",
		},
		{
			name: "media-studio",
			focus: "albums, files, cache, previews and long reports",
			plugins: "files, media-cache, media-group, preview, split",
			run: "pnpm --filter @yaebal/example-media-studio dev",
		},
		{
			name: "modular-router",
			focus: "file-based routes for larger bots",
			plugins: "keyboard, router",
			run: "pnpm --filter @yaebal/example-modular-router dev",
		},
		{
			name: "webhook-edge",
			focus: "fetch webhook handler and local node adapter",
			plugins: "keyboard, web",
			run: "pnpm --filter @yaebal/example-webhook-edge dev",
		},
		{
			name: "runner-workers",
			focus: "concurrent polling and worker offload",
			plugins: "runner, workers",
			run: "pnpm --filter @yaebal/example-runner-workers dev",
		},
		{
			name: "testing-lab",
			focus: "bot factory with actor-driven tests",
			plugins: "callback-data, keyboard, session, test",
			run: "pnpm --filter @yaebal/example-testing-lab test",
		},
		{
			name: "inline-search",
			focus: "inline query results and chosen-result analytics",
			plugins: "fmt",
			run: "pnpm --filter @yaebal/example-inline-search dev",
		},
		{
			name: "payments-stars",
			focus: "stars invoices, pre-checkout, refund",
			plugins: "callback-data, keyboard",
			run: "pnpm --filter @yaebal/example-payments-stars dev",
		},
	];

	const packs = [
		["state and ui", "basic, commerce-suite, dialog-quest, testing-lab"],
		["media", "media-studio, rich-messages, keyboard"],
		["ops", "again, throttle, broadcast, panel, runner-workers, webhook-edge"],
		["telegram surface", "inline-search, payments-stars, onboarding, commands"],
		["large project layout", "modular-router, simple"],
	];
</script>

<svelte:head>
	<title>examples — yaebal</title>
</svelte:head>

<h1>examples</h1>
<p class="lead">
	runnable bots in the <a href={GH}>monorepo</a> under <code>examples/</code>. each one is a private
	workspace package wired to local source, so it doubles as a live public api smoke test.
</p>

<Code code={run} lang="sh" title="terminal" />

<div class="note">
	for a complete plugin coverage matrix, see <a href={`${GH}/README.md`}>examples/readme.md</a>.
	for a standalone project, use <a href="/docs/scaffolding/">create-yaebal</a>.
</div>

<h2>playground quick tours</h2>
<p>these snippets run in-browser with mock telegram updates, then can switch to live mode with a token.</p>
<Try id="keyboard-callback" title="keyboard.ts" />
<Try id="fmt-html" title="formatting.ts" />
<Try id="media-poll" title="media-poll.ts" />

<h2>example catalog</h2>
<table>
	<thead>
		<tr><th>example</th><th>focus</th><th>plugins</th><th>run</th></tr>
	</thead>
	<tbody>
		{#each examples as item}
			<tr>
				<td><a href={`${GH}/${item.name}`}>{item.name}</a></td>
				<td>{item.focus}</td>
				<td>{item.plugins}</td>
				<td><code>{item.run}</code></td>
			</tr>
		{/each}
	</tbody>
</table>

<h2>recipe packs</h2>
<table>
	<thead>
		<tr><th>need</th><th>copy from</th></tr>
	</thead>
	<tbody>
		{#each packs as [need, names]}
			<tr><td>{need}</td><td>{names}</td></tr>
		{/each}
	</tbody>
</table>

<h2>tests</h2>
<p>
	every example has a <code>test</code> script. most examples typecheck as no-network smoke tests;
	<code>testing-lab</code> runs real actor-driven tests with <code>@yaebal/test</code>.
</p>
<Code code={test} lang="sh" title="terminal" />

<div class="note">
	plugin packages keep focused tests under <code>packages/*/src/*.test.ts</code>; examples prove the
	public imports still compose in real bot shapes.
</div>

<style>
	td code {
		white-space: nowrap;
	}
</style>
