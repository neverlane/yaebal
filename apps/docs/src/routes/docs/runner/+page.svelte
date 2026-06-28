<script lang="ts">
	import Code from "$lib/Code.svelte";

	const install = `pnpm add @yaebal/runner`;

	const basic = `import { run } from "@yaebal/runner";

// instead of bot.start(): drive the bot concurrently
const handle = run(bot, { concurrency: 50 });

// later, drain in-flight work and stop:
process.once("SIGINT", () => handle.stop());`;

	const seq = `import { run, chatKey } from "@yaebal/runner";

run(bot, {
  concurrency: 100,
  sequentializeBy: chatKey,          // default — chat id, falling back to actor's user id
  limit: 100,                        // getUpdates batch size
  timeout: 30,                       // long-poll seconds
  allowedUpdates: ["message"],       // telegram allowed_updates
  onError: (err, update) => log.error(update?.update_id, err),
});

// undefined disables ordering entirely (everything parallel):
run(bot, { sequentializeBy: () => undefined });`;

	const scheduler = `import { createScheduler } from "@yaebal/runner";

const s = createScheduler(8);                 // bound concurrency to 8
s.submit("chat-42", () => doWork());          // same key → strict order; different keys → parallel
s.submit(undefined, () => fireAndForget());   // null/undefined key → unordered

await s.whenBelow(4);                          // backpressure: wait until < 4 in flight
console.log(s.size());                         // queued + running
await s.idle();                               // resolves when everything drains`;
</script>

<svelte:head>
	<title>@yaebal/runner — yaebal</title>
</svelte:head>

<h1>@yaebal/runner</h1>
<p class="lead">concurrent update processing — per-chat order preserved, unrelated chats in parallel</p>

<h2>install</h2>
<Code code={install} title="terminal" lang="sh" />

<h2>usage</h2>
<p>
	<code>run(bot)</code> replaces <code>bot.start()</code>. it polls <code>getUpdates</code> in batches
	and dispatches to a bounded pool, so one slow handler no longer blocks the whole queue. it returns
	a <code>RunnerHandle</code> whose <code>stop()</code> halts polling and waits for in-flight updates
	to drain.
</p>
<Code code={basic} title="bot.ts" />

<h2>per-chat ordering</h2>
<p>
	updates that share a key run strictly in submit order and never overlap, so per-chat state
	(sessions) stays race-free; unrelated chats run in parallel up to <code>concurrency</code>. the
	default key comes from <code>chatKey</code>, which resolves the chat id from any update type and
	falls back to the actor's user id (callback queries, inline queries, poll answers). pass your own
	<code>sequentializeBy</code> to change it, or return <code>undefined</code> to disable ordering.
</p>
<Code code={seq} title="options.ts" />

<h2>the scheduler</h2>
<p>
	the core is a reusable bounded-concurrency scheduler with per-key sequentialization, exported as
	<code>createScheduler(concurrency)</code> in case you want it directly — for outbound jobs,
	migrations, anything that needs ordered-by-key parallelism with backpressure.
</p>
<Code code={scheduler} title="scheduler.ts" />

<h2>api</h2>
<table>
	<thead><tr><th>export</th><th>signature</th><th>description</th></tr></thead>
	<tbody>
		<tr><td><code>run</code></td><td><code>(bot: RunnerBot, options?: RunnerOptions) =&gt; RunnerHandle</code></td><td>drive the bot with concurrent polling</td></tr>
		<tr><td><code>createScheduler</code></td><td><code>(concurrency: number) =&gt; Scheduler</code></td><td>bounded-concurrency, per-key-ordered queue</td></tr>
		<tr><td><code>chatKey</code></td><td><code>(update: Update) =&gt; number | undefined</code></td><td>default sequentialization key (chat id → user id)</td></tr>
		<tr><td><code>RunnerOptions</code></td><td>interface</td><td>see below</td></tr>
		<tr><td><code>RunnerHandle</code></td><td><code>&#123; stop(): Promise&lt;void&gt; &#125;</code></td><td>stop polling, drain in-flight</td></tr>
		<tr><td><code>RunnerBot</code></td><td>interface</td><td>the bot surface <code>run</code> needs (<code>api.getUpdates</code>, <code>handleUpdate</code>)</td></tr>
		<tr><td><code>Scheduler</code></td><td>interface</td><td><code>submit</code> / <code>idle</code> / <code>whenBelow</code> / <code>size</code></td></tr>
	</tbody>
</table>

<h3>RunnerOptions</h3>
<table>
	<thead><tr><th>field</th><th>type</th><th>default</th><th>description</th></tr></thead>
	<tbody>
		<tr><td><code>concurrency</code></td><td><code>number</code></td><td><code>50</code></td><td>max updates processed at once</td></tr>
		<tr><td><code>sequentializeBy</code></td><td><code>(update) =&gt; PropertyKey | undefined</code></td><td><code>chatKey</code></td><td>key whose updates stay ordered; <code>undefined</code> result = no ordering</td></tr>
		<tr><td><code>limit</code></td><td><code>number</code></td><td><code>100</code></td><td>getUpdates batch size</td></tr>
		<tr><td><code>timeout</code></td><td><code>number</code></td><td><code>30</code></td><td>long-poll timeout (seconds)</td></tr>
		<tr><td><code>allowedUpdates</code></td><td><code>string[]</code></td><td>—</td><td>restrict update types</td></tr>
		<tr><td><code>onError</code></td><td><code>(error, update?) =&gt; void</code></td><td>—</td><td>handler / polling error callback</td></tr>
	</tbody>
</table>

<h3>Scheduler</h3>
<table>
	<thead><tr><th>method</th><th>signature</th><th>description</th></tr></thead>
	<tbody>
		<tr><td><code>submit</code></td><td><code>(key: PropertyKey | undefined, task: () =&gt; Promise&lt;void&gt;) =&gt; void</code></td><td>queue a task; tasks sharing a non-null key run in submit order</td></tr>
		<tr><td><code>idle</code></td><td><code>() =&gt; Promise&lt;void&gt;</code></td><td>resolves once nothing is queued or running</td></tr>
		<tr><td><code>whenBelow</code></td><td><code>(n: number) =&gt; Promise&lt;void&gt;</code></td><td>resolves once fewer than <code>n</code> tasks are queued/running (backpressure)</td></tr>
		<tr><td><code>size</code></td><td><code>() =&gt; number</code></td><td>tasks currently queued or running</td></tr>
	</tbody>
</table>

<div class="note">
	<strong>i/o-bound by default.</strong> the runner already saturates the event loop for i/o-bound
	handlers, which is most bots. for genuinely CPU-heavy work, offload it with
	<a href="/docs/workers/">@yaebal/workers</a>.
</div>
