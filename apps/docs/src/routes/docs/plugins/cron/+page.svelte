<script lang="ts">
	import Code from "$lib/Code.svelte";

	const install = `pnpm add @yaebal/cron`;

	const pluginUsage = `import { cron } from "@yaebal/cron";

bot.install(
  cron({
    jobs: {
      digest: {
        schedule: "0 9 * * *", // every day at 09:00 UTC
        task: async () => {
          await bot.api.sendMessage({ chat_id: adminId, text: "good morning" });
        },
      },
      heartbeat: {
        schedule: 30_000, // every 30s
        task: () => probe.ping(),
      },
    },
  }),
);`;

	const standalone = `import { createCron } from "@yaebal/cron";

const jobs = createCron()
  .job("cleanup", "*/15 * * * *", () => cleanupExpiredSessions())
  .job("digest", "0 9 * * *", sendDailyDigest, { timeoutMs: 60_000 });

jobs.start();
// ...
await jobs.stop();`;

	const overlap = `jobs.job("sync", 5_000, syncInventory, { overlap: "wait" });
// "skip" (default) drops a run that arrives while the previous one is still going.
// "wait" queues exactly one run to fire right after the current one finishes.`;

	const timeout = `jobs.job(
  "fetchRates",
  "*/5 * * * *",
  async (ctx) => {
    const res = await fetch("https://example.com/rates", { signal: ctx.signal });
    // ...
  },
  { timeoutMs: 10_000 }, // ctx.signal aborts after 10s — cooperative
);`;

	const events = `const jobs = createCron({
  onEvent: (event) => console.log(event.type, event),
  graceful: true,
  drainTimeoutMs: 30_000,
});`;
</script>

<svelte:head>
	<title>@yaebal/cron — yaebal</title>
</svelte:head>

<h1>@yaebal/cron</h1>
<p class="lead">
	typed cron jobs for yaebal bots: declarative schedules (5-field cron expressions, <code
	>@aliases</code>, or a plain millisecond interval), overlap control, cooperative timeouts and
	graceful shutdown. <code>@yaebal/broadcast</code> is close but purpose-built for mass messaging —
	<code>cron</code> is a generic scheduler for periodic tasks; close over <code>bot.api</code> in your
	task to send anything.
</p>

<h2>install</h2>
<Code code={install} title="terminal" lang="sh" />

<h2>as a bot plugin</h2>
<p>
	jobs arm on <code>bot.onStart</code> and drain on <code>bot.onStop</code> — <code
	>await bot.stop()</code> won't resolve until any in-flight run finishes (see
	<a href="#graceful-shutdown">graceful shutdown</a>).
</p>
<Code code={pluginUsage} title="cron.ts" />

<h2>standalone (webhooks / serverless)</h2>
<p>
	for webhook and serverless deployments, where <code>bot.onStart</code>/<code>onStop</code> never
	fire, use <code>createCron()</code> and call <code>start()</code>/<code>stop()</code> yourself.
	chained <code>.job()</code> calls accumulate valid names, so <code>jobs.trigger("cleanup")</code>
	and <code>jobs.state("digest")</code> are typo-checked at compile time.
</p>
<Code code={standalone} title="standalone.ts" />

<h2>overlap</h2>
<p>
	decide what happens when a job's previous run is still going when it's due again.
</p>
<Code code={overlap} title="overlap.ts" />

<h2>cooperative timeouts</h2>
<p>
	<code>timeoutMs</code> aborts <code>ctx.signal</code> after the given time. this is cooperative —
	pass it into your own <code>fetch</code>/api calls to actually cancel work. either way the
	scheduler stops waiting on the run and re-arms the job's schedule.
</p>
<Code code={timeout} title="timeout.ts" />

<h2 id="graceful-shutdown">graceful shutdown</h2>
<p>
	<code>stop()</code> clears every timer immediately (no new runs start) and, by default, waits for
	in-flight runs to finish, up to <code>drainTimeoutMs</code> (30s). pass
	<code>{'{ graceful: false }'}</code> to return immediately instead.
</p>
<Code code={events} title="events.ts" />

<h2>schedule syntax</h2>
<table>
	<thead>
		<tr><th>form</th><th>example</th><th>meaning</th></tr>
	</thead>
	<tbody>
		<tr><td>cron expression</td><td><code>0 9 * * *</code></td><td>minute hour day-of-month month day-of-week, always UTC</td></tr>
		<tr><td>step</td><td><code>*/15 * * * *</code></td><td>every 15 minutes</td></tr>
		<tr><td>list / range</td><td><code>0 9-17 * * 1-5</code></td><td>hourly, 9-17 UTC, Mon-Fri</td></tr>
		<tr><td>alias</td><td><code>@daily</code></td><td><code>@yearly</code>/<code>@monthly</code>/<code>@weekly</code>/<code>@daily</code>/<code>@hourly</code>/<code>@midnight</code>/<code>@annually</code></td></tr>
		<tr><td>interval</td><td><code>30_000</code></td><td>a plain number of milliseconds — fires every 30s from when the job was armed</td></tr>
	</tbody>
</table>

<h2>exports</h2>
<table>
	<thead>
		<tr><th>export</th><th>kind</th><th>use</th></tr>
	</thead>
	<tbody>
		<tr><td><code>cron</code></td><td>function</td><td>installable bot plugin — wires <code>bot.onStart</code>/<code>onStop</code></td></tr>
		<tr><td><code>createCron</code></td><td>function</td><td>standalone scheduler — call <code>start()</code>/<code>stop()</code> yourself</td></tr>
		<tr><td><code>Cron</code></td><td>class</td><td>the scheduler: <code>job()</code>, <code>start()</code>, <code>stop()</code>, <code>trigger()</code>, <code>state()</code>, <code>states()</code></td></tr>
		<tr><td><code>parseCron</code></td><td>function</td><td>parse a cron expression into a pure, unit-testable <code>CronSchedule</code></td></tr>
		<tr><td><code>CronExpressionError</code></td><td>class</td><td>thrown by <code>parseCron</code>/<code>job()</code> on a malformed expression</td></tr>
		<tr><td><code>CronJobNotFoundError</code></td><td>class</td><td>thrown by <code>trigger()</code>/<code>state()</code> for an unregistered name</td></tr>
		<tr><td><code>CronTimeoutError</code></td><td>class</td><td>the reason <code>ctx.signal</code> aborts with when <code>timeoutMs</code> elapses</td></tr>
	</tbody>
</table>

<div class="note">
	<code>Cron</code> doesn't touch <code>ctx</code>, so plain <code>node:test</code> is enough for
	testing — no <code>@yaebal/test</code> actors needed: <code>await jobs.trigger("digest")</code>
	runs a job once, right now, bypassing its schedule.
</div>
