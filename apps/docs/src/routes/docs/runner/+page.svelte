<script lang="ts">
	import Code from "$lib/Code.svelte";

	const install = `pnpm add @yaebal/runner`;

	const basic = `import { run } from "@yaebal/runner";

// instead of bot.start(): drive the bot concurrently
const handle = run(bot, { concurrency: 50 });

// later, drain in-flight work and stop:
await handle.stop();`;

	const seq = `run(bot, {
  concurrency: 100,
  sequentializeBy: (u) => u.message?.chat.id,  // default: chat id
  limit: 100,         // getUpdates batch size
  timeout: 30,        // long-poll seconds
  onError: (err, update) => log.error(err),
});`;

	const scheduler = `import { createScheduler } from "@yaebal/runner";

const s = createScheduler(8);
s.submit("chat-42", () => doWork());  // same key → strict order; different keys → parallel
await s.idle();                        // resolves when everything drains`;
</script>

<svelte:head>
	<title>@yaebal/runner — yaebal</title>
</svelte:head>

<h1>@yaebal/runner</h1>
<p class="lead">
	process updates <strong>concurrently</strong> instead of the built-in sequential long-poll —
	while keeping each chat's updates in order, so sessions stay safe.
</p>

<h2>install</h2>
<Code code={install} title="terminal" lang="sh" />

<h2>usage</h2>
<p>
	<code>run(bot)</code> replaces <code>bot.start()</code>. It polls in batches and dispatches to a
	bounded pool, so a slow handler no longer blocks the whole queue.
</p>
<Code code={basic} title="bot.ts" />

<h2>per-chat ordering</h2>
<p>
	Updates that share a key — the chat id by default — run strictly in submit order and never overlap,
	so per-chat state (sessions) is race-free. Unrelated chats run in parallel up to
	<code>concurrency</code>.
</p>
<Code code={seq} title="options.ts" />

<h2>options</h2>
<table>
	<thead>
		<tr><th>option</th><th>default</th><th>meaning</th></tr>
	</thead>
	<tbody>
		<tr><td><code>concurrency</code></td><td><code>50</code></td><td>max updates processed at once</td></tr>
		<tr><td><code>sequentializeBy</code></td><td>chat id</td><td>key whose updates stay ordered; <code>undefined</code> = no ordering</td></tr>
		<tr><td><code>limit</code></td><td><code>100</code></td><td>getUpdates batch size</td></tr>
		<tr><td><code>timeout</code></td><td><code>30</code></td><td>long-poll seconds</td></tr>
		<tr><td><code>allowedUpdates</code></td><td>—</td><td>restrict update types</td></tr>
		<tr><td><code>onError</code></td><td>—</td><td>handler / polling error callback</td></tr>
	</tbody>
</table>

<h2>the scheduler</h2>
<p>
	The core is a reusable bounded-concurrency scheduler with per-key sequentialization — exported in
	case you want it directly.
</p>
<Code code={scheduler} title="scheduler.ts" />

<div class="note">
	Workers help only when handlers are CPU-bound. Most bots are I/O-bound, and this runner already
	saturates the event loop. For genuinely heavy CPU work, offload it with
	<a href="/docs/workers/">@yaebal/workers</a>.
</div>
