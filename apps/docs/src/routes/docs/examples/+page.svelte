<script lang="ts">
	import Code from "$lib/Code.svelte";

	const GH = "https://github.com/neverlane/yaebal/tree/master/examples";

	const run = `# from a clone of the monorepo
pnpm install

# copy the env template, then add your token(s)
cp examples/panel/.env.example examples/panel/.env

# run with reload (reads .env)
pnpm --filter @yaebal/example-panel dev`;

	const basic = [
		["/start", "a formatted greeting with an inline keyboard (keyboard + callback-data)"],
		["/count", "a per-chat counter (session)"],
		["/menu", "a two-window dialog with stack navigation (morda)"],
		["/photo", "sends a photo by url (media)"],
		["/lang", "toggles the locale and replies in it (i18n)"],
		["/register", "a name → age wizard (scenes)"],
		["/name", "asks once and handles the reply (prompt)"],
	];

	const panelTour: [string, string][] = [
		["send text", "appears live in the panel; the bot echoes it back"],
		["send a photo / document / voice", "rendered inline — image, download link, or audio player"],
		["send an album", "grouped into one media bubble"],
		["reply from the panel", "delivered via sendMessage; 📎 uploads send as sendPhoto / sendDocument / …"],
	];
</script>

<svelte:head>
	<title>examples — yaebal</title>
</svelte:head>

<h1>examples</h1>
<p class="lead">
	runnable, single-file bots in the <a href={GH}>monorepo</a> under <code>examples/</code>. each is a
	workspace package wired to the local source, so it's also a live smoke test of the public API.
	clone, drop a token in <code>.env</code>, and run.
</p>

<Code code={run} lang="sh" title="terminal" />
<p>
	want a standalone project instead of the monorepo? scaffold one with
	<a href="/docs/scaffolding/">create-yaebal</a> — <code>pnpm create yaebal my-bot</code>.
</p>

<h2>basic <span class="muted">— a plugin tour</span></h2>
<p>
	a single bot wiring most of the first-party plugins. each command demonstrates one of them.
	source: <a href={`${GH}/basic`}>examples/basic</a>.
</p>
<table>
	<thead>
		<tr><th>command</th><th>what it shows</th></tr>
	</thead>
	<tbody>
		{#each basic as [cmd, desc]}
			<tr><td><code>{cmd}</code></td><td>{desc}</td></tr>
		{/each}
	</tbody>
</table>
<p>run it: <code>pnpm --filter @yaebal/example-basic dev</code> (needs <code>BOT_TOKEN</code>).</p>

<h2>panel <span class="muted">— operator dashboard</span></h2>
<p>
	the <a href="/docs/plugins/panel/">panel</a> end-to-end: a live operator dashboard with media in
	both directions, served on a native node server. it exercises the recorder, outgoing-reply logging,
	the login page, realtime SSE and the media proxy. source: <a href={`${GH}/panel`}>examples/panel</a>.
</p>
<table>
	<thead>
		<tr><th>try</th><th>what happens</th></tr>
	</thead>
	<tbody>
		{#each panelTour as [action, result]}
			<tr><td>{action}</td><td>{result}</td></tr>
		{/each}
	</tbody>
</table>
<p>
	run it: <code>pnpm --filter @yaebal/example-panel dev</code> (needs <code>BOT_TOKEN</code> +
	<code>PANEL_TOKEN</code>), then open <code>http://localhost:3000</code> and paste the panel token.
</p>

<div class="note">
	examples are <code>private</code> workspace packages — they're not published to npm. they exist to
	run locally and to keep the public API honest as the framework evolves.
</div>

<style>
	.muted {
		color: var(--muted, #888);
		font-weight: 400;
		font-size: 0.8em;
	}
</style>
