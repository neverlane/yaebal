<script lang="ts">
	import { EXAMPLES_CATALOG, PATTERN_CATALOG } from "$lib/examples-catalog";
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

	// playground <Try> ids that map cleanly onto one example bot's topic — curated by
	// hand (the README table doesn't carry this), kept small and only where the match
	// is genuinely tight. the full try-id registry lives in $lib/examples.ts.
	const TRY_LINKS: Record<string, string[]> = {
		broadcast: ["broadcast-queue"],
		cron: ["cron-admin", "cron-digest"],
		keyboard: ["keyboard-callback", "reply-keyboard"],
		"auto-answer": ["auto-answer-deadline", "auto-answer-skip"],
		guards: ["guards-private"],
		pagination: ["pagination-list", "pagination-select"],
		session: ["session-counter", "session-v2"],
		"feature-flags": ["feature-flags-override", "feature-flags-variants"],
		"audit-log": ["audit-log-basic"],
		analytics: ["analytics-admin", "analytics-auto-capture", "analytics-track"],
		"rich-messages": ["rich-ai"],
		"dialog-quest": ["wizard-form", "conversation-prompt", "conversation-wizard", "scenes-buttons", "scenes-wizard"],
		"state-machine": ["state-machine-order"],
		"webhook-edge": ["webhook-ready"],
		"inline-search": ["inline-mode"],
		"payments-stars": ["payments-stars"],
	};
</script>

<svelte:head>
	<title>examples — yaebal</title>
</svelte:head>

<h1>examples</h1>
<p class="lead">
	{EXAMPLES_CATALOG.length} runnable bots in the <a href={GH}>monorepo</a> under
	<code>examples/</code>. each one is a private workspace package wired to local source, so it
	doubles as a live public api smoke test. the table below is generated straight from
	<a href={`${GH}/README.md`}>examples/README.md</a> — it can't drift out of sync with the repo.
</p>

<Code code={run} lang="sh" title="terminal" />

<div class="note">
	for the full plugin coverage matrix, see <a href={`${GH}/README.md`}>examples/readme.md</a>.
	for a standalone project, use <a href="/docs/scaffolding/">create-yaebal</a>.
</div>

<h2>playground quick tours</h2>
<p>these snippets run in-browser with mock telegram updates, then can switch to live mode with a token.</p>
<Try id="keyboard-callback" title="keyboard.ts" />
<Try id="fmt-html" title="formatting.ts" />
<Try id="media-poll" title="media-poll.ts" />

<h2>example catalog</h2>
<p>
	roughly ordered simple → advanced: a bare-core echo bot first, single-plugin demos in the
	middle, multi-plugin product bots last.
</p>
<div class="table-scroll">
<table>
	<thead>
		<tr><th>example</th><th>package</th><th>focus</th><th>run</th><th>try it</th></tr>
	</thead>
	<tbody>
		{#each EXAMPLES_CATALOG as item}
			<tr>
				<td><a href={`${GH}/${item.name}`}>{item.name}</a></td>
				<td><code>{item.package}</code></td>
				<td>{item.focus}</td>
				<td><code>{item.run}</code></td>
				<td>
					{#if TRY_LINKS[item.name]}
						{#each TRY_LINKS[item.name] as id, i}
							{#if i > 0}, {/if}<a href="/playground?ex={id}">{id}</a>
						{/each}
					{:else}
						—
					{/if}
				</td>
			</tr>
		{/each}
	</tbody>
</table>
</div>

<h2>patterns to copy</h2>
<table>
	<thead>
		<tr><th>pattern</th><th>copy from</th></tr>
	</thead>
	<tbody>
		{#each PATTERN_CATALOG as p}
			<tr><td>{p.pattern}</td><td>{p.copyFrom}</td></tr>
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
	.table-scroll {
		overflow-x: auto;
	}
</style>
