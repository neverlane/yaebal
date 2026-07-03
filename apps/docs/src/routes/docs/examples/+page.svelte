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

	const again = [
		["/start", "explains the auto-retry example"],
		["/burst", "sends a burst; structured retry_after waits are awaited and retried"],
		["/stats", "prints retry counts grouped by reason"],
	];

	const throttle = [
		["/start", "explains the outbound scheduler example"],
		["/burst", "queues multiple messages behind the per-chat bucket"],
		["/priority", "queues low-priority work and an urgent message"],
		["/cancel", "aborts a queued request before it drains"],
		["/metrics", "prints live scheduler metrics"],
	];

	const broadcast = [
		["/start", "subscribes the current chat to the demo audience"],
		["/broadcast text", "queues a typed broadcast job for all subscribers"],
		["/status", "prints recent jobs, events and worker metrics"],
		["/pause job_id", "pauses a queued or running job"],
		["/resume job_id", "resumes a paused job"],
		["/cancel job_id", "cancels a job"],
	];

	const panelTour: [string, string][] = [
		["/start", "inline keyboard preview, avatar sidebar and callback buttons"],
		["press a button", "callback event row plus the bot response"],
		["send photo / album / video / voice", "media viewer, album grid, styled video card and voice waveform"],
		["reply from the panel", "delivered via sendMessage; uploads infer sendPhoto / sendVideo / sendVoice / sendDocument"],
	];

	const keyboard = [
		["/start", "text, style, url, row — the basics, and reply_markup taking the builder directly"],
		["/gallery", "every remaining inline button: webApp, login, switchInline*, copyText"],
		["/grid", "buttons built from an array with add() + columns()"],
		["/contact", "reply keyboard: requestContact, requestLocation, requestPoll, webApp"],
		["/profile", "reply keyboard: requestUsers, requestChat, requestManagedBot"],
		["/hide", "Keyboard.remove()"],
		["/ask", "Keyboard.forceReply(), with a handler that recognizes the reply"],
	];

	const onboarding = [
		["/start", "starts or resumes the welcome flow"],
		["/tour", "force-restarts the tour after completion"],
		["/status", "reads ctx.onboarding.welcome state"],
		["/disable", "calls ctx.onboarding.disableAll()"],
		["/enable", "reenables and undismisses the flow"],
	];

	const rich = [
		["/start", "document() with a heading, bold/link inline marks, and a blockquote"],
		["/report", "table()/cell(), a checkbox list(), and a collapsible details()"],
		["/media", "image()/video()/audio() blocks with captions"],
		["/ask <question>", "streams a fake answer via RichMessageDraft (thinking() → pushes → commit())"],
	];

	const simple = [
		["/start", "a reply defined directly in bot.toml"],
		["/ping", "a named typescript handler from the registry"],
		["ping", "a hears route that replies pong"],
		["profile callback", "a callback_query route backed by a named handler"],
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

<h2>simple <span class="muted">— toml routes</span></h2>
<p>
	a compact bot powered by <a href="/docs/plugins/toml/">@yaebal/toml</a>: routes live in
	<code>bot.toml</code>, complex logic stays in the typescript handler registry. source:
	<a href={`${GH}/simple`}>examples/simple</a>.
</p>
<table>
	<thead>
		<tr><th>try</th><th>what it shows</th></tr>
	</thead>
	<tbody>
		{#each simple as [action, desc]}
			<tr><td><code>{action}</code></td><td>{desc}</td></tr>
		{/each}
	</tbody>
</table>
<p>run it: <code>pnpm --filter @yaebal/example-simple dev</code> (needs <code>BOT_TOKEN</code>).</p>

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

<h2>again <span class="muted">— awaited retry</span></h2>
<p>
	<a href="/docs/plugins/again/">@yaebal/again</a> in isolation: structured
	<code>response_parameters.retry_after</code>, bounded retry budget and retry metrics. source:
	<a href={`${GH}/again`}>examples/again</a>.
</p>
<table>
	<thead>
		<tr><th>command</th><th>what it shows</th></tr>
	</thead>
	<tbody>
		{#each again as [cmd, desc]}
			<tr><td><code>{cmd}</code></td><td>{desc}</td></tr>
		{/each}
	</tbody>
</table>
<p>run it: <code>pnpm --filter @yaebal/example-again dev</code> (needs <code>BOT_TOKEN</code>).</p>

<h2>throttle <span class="muted">— outbound scheduler</span></h2>
<p>
	<a href="/docs/plugins/throttle/">@yaebal/throttle</a> with Telegram buckets, per-method
	priorities, request cancellation and metrics. source:
	<a href={`${GH}/throttle`}>examples/throttle</a>.
</p>
<table>
	<thead>
		<tr><th>command</th><th>what it shows</th></tr>
	</thead>
	<tbody>
		{#each throttle as [cmd, desc]}
			<tr><td><code>{cmd}</code></td><td>{desc}</td></tr>
		{/each}
	</tbody>
</table>
<p>run it: <code>pnpm --filter @yaebal/example-throttle dev</code> (needs <code>BOT_TOKEN</code>).</p>

<h2>broadcast <span class="muted">— typed delivery jobs</span></h2>
<p>
	<a href="/docs/plugins/broadcast/">@yaebal/broadcast</a> with typed job definitions, local
	storage, retry, progress, pause/resume/cancel and graceful shutdown. source:
	<a href={`${GH}/broadcast`}>examples/broadcast</a>.
</p>
<table>
	<thead>
		<tr><th>command</th><th>what it shows</th></tr>
	</thead>
	<tbody>
		{#each broadcast as [cmd, desc]}
			<tr><td><code>{cmd}</code></td><td>{desc}</td></tr>
		{/each}
	</tbody>
</table>
<p>run it: <code>pnpm --filter @yaebal/example-broadcast dev</code> (needs <code>BOT_TOKEN</code>).</p>

<h2>keyboard <span class="muted">— every button type</span></h2>
<p>
	a tour of every <a href="/docs/plugins/keyboard/">@yaebal/keyboard</a> feature: inline and
	reply keyboards, every button type, styling, dynamic buttons via <code>add()</code>/<code>columns()</code>,
	request user/chat/managed-bot, and <code>Keyboard.remove()</code>/<code>Keyboard.forceReply()</code>.
	source: <a href={`${GH}/keyboard`}>examples/keyboard</a>.
</p>
<table>
	<thead>
		<tr><th>command</th><th>what it shows</th></tr>
	</thead>
	<tbody>
		{#each keyboard as [cmd, desc]}
			<tr><td><code>{cmd}</code></td><td>{desc}</td></tr>
		{/each}
	</tbody>
</table>
<p>run it: <code>pnpm --filter @yaebal/example-keyboard dev</code> (needs <code>BOT_TOKEN</code>).</p>

<h2>onboarding <span class="muted">— product tour</span></h2>
<p>
	the <a href="/docs/plugins/onboarding/">onboarding</a> plugin in isolation: typed flow controls,
	inline next/skip/exit buttons, completion hooks, force restart and opt-out. source:
	<a href={`${GH}/onboarding`}>examples/onboarding</a>.
</p>
<table>
	<thead>
		<tr><th>command</th><th>what it shows</th></tr>
	</thead>
	<tbody>
		{#each onboarding as [cmd, desc]}
			<tr><td><code>{cmd}</code></td><td>{desc}</td></tr>
		{/each}
	</tbody>
</table>
<p>run it: <code>pnpm --filter @yaebal/example-onboarding dev</code> (needs <code>BOT_TOKEN</code>).</p>

<h2>rich-messages <span class="muted">— sendRichMessage / sendRichMessageDraft</span></h2>
<p>
	a tour of <a href="/docs/plugins/rich/">@yaebal/rich</a>: block/inline builders, sending a
	document, streaming a fake answer via <code>RichMessageDraft</code>, and reading
	<code>message.rich_message</code> back with <code>richMessageToPlainText</code>. source:
	<a href={`${GH}/rich-messages`}>examples/rich-messages</a>.
</p>
<table>
	<thead>
		<tr><th>command</th><th>what it shows</th></tr>
	</thead>
	<tbody>
		{#each rich as [cmd, desc]}
			<tr><td><code>{cmd}</code></td><td>{desc}</td></tr>
		{/each}
	</tbody>
</table>
<p>run it: <code>pnpm --filter @yaebal/example-rich-messages dev</code> (needs <code>BOT_TOKEN</code>).</p>

<h2>panel <span class="muted">— operator dashboard</span></h2>
<p>
	the <a href="/docs/plugins/panel/">panel</a> end-to-end: a live operator dashboard with avatars,
	media viewer, keyboard previews, callbacks, event rows, outgoing logging, login, realtime SSE and
	the media proxy. source: <a href={`${GH}/panel`}>examples/panel</a>.
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
