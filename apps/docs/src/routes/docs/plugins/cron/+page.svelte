<script lang="ts">
	import Code from "$lib/Code.svelte";
	import Try from "$lib/Try.svelte";

	const install = `pnpm add @yaebal/cron`;

	const pluginUsage = `import { cron } from "@yaebal/cron";

bot.install(
  cron({
    tz: "Europe/Moscow", // default zone for every job below; UTC if omitted
    jobs: {
      digest: {
        schedule: "0 9 * * *", // every day at 09:00 local
        task: async () => {
          await bot.api.sendMessage({ chat_id: adminId, text: "good morning" });
        },
        retries: 2,
        timeoutMs: 10_000,
      },
      heartbeat: {
        schedule: 30_000, // every 30s
        task: () => probe.ping(),
      },
    },
  }),
);

// the plugin also decorates ctx.cron — any handler can reach trigger/pause/resume/states/nextRuns
bot.command("run-digest", async (ctx) => {
  await ctx.reply(\`digest: \${await ctx.cron.trigger("digest")}\`);
});`;

	const standalone = `import { createCron } from "@yaebal/cron";

const jobs = createCron()
  .job("cleanup", "*/15 * * * *", () => cleanupExpiredSessions())
  .job("digest", "0 9 * * *", sendDailyDigest, { timeoutMs: 60_000 });

jobs.start();
// ...
await jobs.stop();`;

	const admin = `import { cron, cronAdmin } from "@yaebal/cron";

bot
  .install(cron({ jobs: { digest: { schedule: "0 9 * * *", task: sendDailyDigest } } }))
  .install(cronAdmin({ isAdmin: (ctx) => ctx.from?.id === adminId }));

// /cron                — every job's state: paused/running, run/failure counts, next & last run
// /cron run digest      — trigger a job immediately, respecting its overlap policy
// /cron pause digest     — stop its automatic schedule (trigger() still works)
// /cron resume digest    — restart it
// /cron next digest      — preview its next 3 scheduled fire times`;

	const tz = `cron({
  tz: "Europe/Moscow", // default zone for every job — UTC if omitted
  jobs: {
    // inherits the "Europe/Moscow" default above
    digest: { schedule: "0 9 * * *", task: sendDailyDigest },
    // overrides it per job
    nyReport: { schedule: "0 17 * * *", task: sendReport, tz: "America/New_York" },
  },
});
// resolved per-instant via Intl — DST-correct, no timezone database bundled.
// a wall-clock time that's skipped on a spring-forward day is simply never matched.`;

	const retries = `jobs.job(
  "syncInventory",
  "*/5 * * * *",
  async (ctx) => {
    // ctx.attempt is 1 on the first try, 2 on the first retry, ...
    await fetch("https://example.com/inventory", { signal: ctx.signal });
  },
  {
    retries: 2, // up to 2 extra attempts after the first failure
    retryDelayMs: (attempt) => attempt * 1_000, // 1s, then 2s
    timeoutMs: 10_000, // races the task; the scheduler stops waiting either way
  },
);
// only the FINAL attempt counts toward state().failures and calls onError —
// an eventual success after retries is not a failure.`;

	const overlap = `jobs.job("sync", 5_000, syncInventory, { overlap: "wait" });
// "skip"  (default) drops a run that arrives while the previous one is still going.
// "wait"  queues exactly one run to fire right after the current one finishes.
// "allow" fires concurrently — no skipping or queueing at all.`;

	const catchUp = `import { fileStorage } from "@yaebal/sklad/file";

const jobs = createCron({ store: fileStorage("./cron-state.json") })
  .job("digest", "0 9 * * *", sendDailyDigest, { catchUp: true });
// with catchUp + a store, a missed occurrence (the process was down at 09:00) fires
// once at the next start() instead of silently vanishing until tomorrow.
// store only needs get/set (delete optional), sync or async — any @yaebal/sklad
// adapter (MemoryStorage, redisStorage, sqliteStorage, kvStorage, fileStorage) works.`;

	const lock = `const jobs = createCron({
  // one instance wins per job name; the rest skip that fire with reason: "lock"
  acquireLock: async (name) => {
    const acquired = await redis.set(\`lock:\${name}\`, "1", "NX", "PX", 30_000);
    return acquired ? () => redis.del(\`lock:\${name}\`) : false;
  },
}).job("digest", "0 9 * * *", sendDailyDigest);
// no backend bundled — wire it to redis, postgres advisory locks, or whatever your fleet has.
// a throwing/rejecting hook is treated as "denied", never as a scheduler crash.`;

	const management = `jobs.pause("digest");             // stop its automatic schedule; trigger() still works
jobs.resume("digest");            // re-arm it
jobs.reschedule("digest", "0 8 * * *"); // swap the schedule in place, re-arms immediately
jobs.remove("digest");            // unregister it and clear its timer
jobs.nextRuns("digest", 3);       // preview the next 3 fire times, without arming anything`;

	const events = `const jobs = createCron({
  onEvent: (event) => console.log(event.type, event),
  graceful: true,
  drainTimeoutMs: 30_000,
});
// scheduled / run_started / run_completed / run_failed / run_retry /
// run_skipped (reason: "overlap" | "lock") / run_timeout / store_error / schedule_error
// every event carries \`at\`; run-scoped ones carry \`run\`/\`attempt\` too.`;

	const testing = `import { createCron } from "@yaebal/cron";
import { installTestClock } from "@yaebal/test";

const jobs = createCron().job("digest", 60_000, sendDigest);
await jobs.trigger("digest"); // run it once, right now, bypassing the schedule — resolves "ran"

// schedule-driven behavior (start(), timers, retry delays): drive the virtual clock
const clock = installTestClock();
try {
  jobs.start();
  await clock.advance(60_000);
  assert.equal(jobs.state("digest")?.runs, 1);
} finally {
  clock.restore();
}`;
</script>

<svelte:head>
	<title>@yaebal/cron — yaebal</title>
</svelte:head>

<h1>@yaebal/cron</h1>
<p class="lead">
	typed cron jobs for yaebal bots: declarative schedules (5/6-field cron expressions, <code
	>@aliases</code>, or a plain millisecond interval), per-job timezones, retries with backoff,
	overlap control, cooperative timeouts, catch-up after downtime, a distributed-lock hook for
	multi-instance deployments, runtime job management, and a chat-native <code>/cron</code> admin
	surface — with graceful shutdown throughout. <code>@yaebal/broadcast</code> is close but
	purpose-built for mass messaging — <code>cron</code> is a generic scheduler for periodic tasks;
	close over <code>bot.api</code> in your task to send anything.
</p>

<h2>install</h2>
<Code code={install} title="terminal" lang="sh" />

<h2>as a bot plugin</h2>
<p>
	jobs arm on <code>bot.onStart</code> and drain on <code>bot.onStop</code> — <code
	>await bot.stop()</code> won't resolve until any in-flight run finishes (see
	<a href="#graceful-shutdown">graceful shutdown</a>). the plugin also decorates <code
	>ctx.cron</code> with the same handle, so any handler can reach <code>trigger</code>/<code
	>pause</code>/<code>states</code> without a separate import.
</p>
<Try id="cron-digest" title="bot.ts" />
<Code code={pluginUsage} title="bot.ts" />

<h2>standalone (webhooks / serverless)</h2>
<p>
	for webhook and serverless deployments, where <code>bot.onStart</code>/<code>onStop</code> never
	fire, use <code>createCron()</code> and call <code>start()</code>/<code>stop()</code> yourself.
	chained <code>.job()</code> calls accumulate valid names, so <code>jobs.trigger("cleanup")</code>
	and <code>jobs.state("digest")</code> are typo-checked at compile time.
</p>
<Code code={standalone} title="standalone.ts" />

<h2>admin commands</h2>
<p>
	<code>cronAdmin</code> installs a telegram-native ops surface for the jobs <code>cron()</code>
	added — list every job's state, trigger one on demand, pause/resume its schedule, or preview
	upcoming runs — straight from a chat, gated by an <code>isAdmin</code> check you provide.
	isolated via <code>Composer.filter</code> (not <code>guard</code>) — a rejected check continues
	the <em>outer</em> chain instead of halting it, so installing this doesn't gate any handler
	registered elsewhere on the same composer.
</p>
<Try id="cron-admin" title="bot.ts" />
<Code code={admin} title="bot.ts" />

<h2>timezones</h2>
<p>
	set <code>tz</code> globally (every job's default) or per job (overriding it). resolved
	per-instant via <code>Intl</code> — DST-correct, no timezone database bundled: a skipped
	spring-forward hour is simply never matched, a repeated fall-back hour fires once. millisecond
	intervals ignore <code>tz</code> — they're anchored on absolute time, not wall-clock fields.
</p>
<Code code={tz} title="bot.ts" />

<h2>retries &amp; cooperative timeouts</h2>
<p>
	<code>timeoutMs</code> races the task against a timer and aborts <code>ctx.signal</code> —
	cooperative, so pass it into your own <code>fetch</code>/api calls to actually cancel work.
	either way the scheduler stops waiting, fails the run, and re-arms — a task that never resolves
	can never wedge the schedule. <code>retries</code>/<code>retryDelayMs</code> re-run a failed (or
	timed-out) attempt before giving up; only the final attempt counts toward <code
	>state().failures</code> and calls <code>onError</code>.
</p>
<Code code={retries} title="bot.ts" />

<h2>overlap</h2>
<p>decide what happens when a job's previous run is still going when it's due again.</p>
<Code code={overlap} title="overlap.ts" />

<h2>catch-up after downtime</h2>
<p>
	with a <code>store</code> configured, a job with <code>catchUp: true</code> fires once at
	<code>start()</code> if its schedule had an occurrence due between the last recorded run and
	now — so a restart during a deploy window doesn't silently drop a day's digest.
</p>
<Code code={catchUp} title="bot.ts" />

<h2>distributed locks</h2>
<p>
	<code>acquireLock</code> gates each fire behind a lock you control — for a fleet running several
	instances of the same bot, so a job only actually executes on one of them. no backend is
	bundled; wire it to whatever your infrastructure already has.
</p>
<Code code={lock} title="bot.ts" />

<h2>runtime management</h2>
<p>manage jobs after the scheduler is already running — e.g. from an admin command.</p>
<Code code={management} title="bot.ts" />

<h2 id="graceful-shutdown">graceful shutdown &amp; events</h2>
<p>
	<code>stop()</code> clears every timer immediately (no new runs start) and, by default, waits
	for in-flight runs — and any queued <code>overlap: "wait"</code> follow-up they spawn — to
	finish, up to <code>drainTimeoutMs</code> (30s), then aborts <code>ctx.signal</code> on anything
	still going. pass <code>{'{ graceful: false }'}</code> to abort and return immediately instead.
</p>
<Code code={events} title="events.ts" />

<h2>schedule syntax</h2>
<table>
	<thead>
		<tr><th>form</th><th>example</th><th>meaning</th></tr>
	</thead>
	<tbody>
		<tr><td>cron expression</td><td><code>0 9 * * *</code></td><td>minute hour day-of-month month day-of-week</td></tr>
		<tr><td>with seconds</td><td><code>30 0 9 * * *</code></td><td>optional 6th leading field — 09:00:30 every day</td></tr>
		<tr><td>step</td><td><code>*/15 * * * *</code></td><td>every 15 minutes</td></tr>
		<tr><td>list / range</td><td><code>0 9-17 * * 1-5</code></td><td>hourly, 9-17, Mon-Fri</td></tr>
		<tr><td>names</td><td><code>0 9 * jan mon-fri</code></td><td><code>JAN</code>–<code>DEC</code> / <code>SUN</code>–<code>SAT</code>, case-insensitive</td></tr>
		<tr><td>alias</td><td><code>@daily</code></td><td><code>@yearly</code>/<code>@monthly</code>/<code>@weekly</code>/<code>@daily</code>/<code>@hourly</code>/<code>@midnight</code>/<code>@annually</code>/<code>@reboot</code></td></tr>
		<tr><td>interval</td><td><code>30_000</code></td><td>a plain number of milliseconds — fires every 30s from when the job was armed</td></tr>
	</tbody>
</table>
<div class="note">
	an expression that can never match (<code>0 0 31 2 *</code> — February never has 31 days) is
	rejected at registration, not discovered later. <code>@reboot</code> fires once when the
	scheduler starts and never arms a timer.
</div>

<h2>exports</h2>
<table>
	<thead>
		<tr><th>export</th><th>kind</th><th>use</th></tr>
	</thead>
	<tbody>
		<tr><td><code>cron</code></td><td>function</td><td>installable bot plugin — wires <code>bot.onStart</code>/<code>onStop</code>, decorates <code>ctx.cron</code></td></tr>
		<tr><td><code>createCron</code></td><td>function</td><td>standalone scheduler — call <code>start()</code>/<code>stop()</code> yourself</td></tr>
		<tr><td><code>cronAdmin</code></td><td>function</td><td><code>/cron</code> ops commands, gated by <code>isAdmin</code></td></tr>
		<tr><td><code>Cron</code></td><td>class</td><td>the scheduler — see the api table below</td></tr>
		<tr><td><code>parseCron</code></td><td>function</td><td>parse an expression into a pure, unit-testable <code>CronSchedule</code></td></tr>
		<tr><td><code>CronExpressionError</code></td><td>class</td><td>thrown by <code>parseCron</code>/<code>job()</code> on a malformed or unsatisfiable expression, or an unrecognized <code>tz</code></td></tr>
		<tr><td><code>CronJobExistsError</code></td><td>class</td><td>thrown by <code>job()</code> for a name registered twice</td></tr>
		<tr><td><code>CronJobNotFoundError</code></td><td>class</td><td>thrown by <code>trigger()</code>/<code>pause()</code>/… for an unregistered name</td></tr>
		<tr><td><code>CronTimeoutError</code></td><td>class</td><td>the reason <code>ctx.signal</code> aborts with when <code>timeoutMs</code> elapses</td></tr>
		<tr><td><code>CronStoppedError</code></td><td>class</td><td>the reason <code>ctx.signal</code> aborts with when <code>stop()</code>'s drain window elapses</td></tr>
	</tbody>
</table>

<h3>Cron methods</h3>
<table>
	<thead>
		<tr><th>method</th><th>returns</th><th>description</th></tr>
	</thead>
	<tbody>
		<tr><td><code>job(name, schedule, task, options?)</code></td><td><code>Cron</code></td><td>register a job; chainable, accumulates typed names</td></tr>
		<tr><td><code>start()</code> / <code>stop(options?)</code></td><td><code>this</code> / <code>Promise&lt;void&gt;</code></td><td>arm / disarm every job</td></tr>
		<tr><td><code>trigger(name)</code></td><td><code>Promise&lt;"ran" | "skipped"&gt;</code></td><td>run now, respecting overlap — never disturbs the schedule</td></tr>
		<tr><td><code>pause(name)</code> / <code>resume(name)</code></td><td><code>void</code></td><td>stop/restart automatic firing; <code>trigger()</code> still works while paused</td></tr>
		<tr><td><code>reschedule(name, schedule)</code></td><td><code>void</code></td><td>replace the schedule in place, re-arms immediately</td></tr>
		<tr><td><code>remove(name)</code></td><td><code>boolean</code></td><td>unregister and clear its timer</td></tr>
		<tr><td><code>nextRuns(name, count)</code></td><td><code>Date[]</code></td><td>preview upcoming fire times, without arming anything</td></tr>
		<tr><td><code>state(name)</code> / <code>states()</code></td><td><code>CronJobState | undefined</code> / <code>CronJobState[]</code></td><td>paused, running, run/failure counts, next/last run, last error</td></tr>
	</tbody>
</table>

<h2>testing</h2>
<p>
	<code>Cron</code> doesn't touch <code>ctx</code> — <code>createCron()</code> + <code
	>trigger()</code> is enough for most job logic. for schedule-driven behavior, drive
	<a href="/docs/plugins/test/"><code>@yaebal/test</code></a>'s virtual clock instead of real
	<code>sleep()</code>; <code>cronAdmin()</code> touches <code>ctx</code>, so test it through a
	real bot and <code>createTestEnv</code>.
</p>
<Code code={testing} title="cron.test.ts" />

<div class="note">
	<strong>pairs with sklad.</strong> <code>store</code> only needs <code>get</code>/<code
	>set</code> (sync or async) — the same shape as
	<a href="/docs/plugins/sklad/"><code>@yaebal/sklad</code></a>'s <code>StorageAdapter&lt;T&gt;</code>,
	so any of its adapters work without an explicit dependency on the package.
</div>

<div class="note">
	<strong>no panel widget.</strong> <a href="/docs/plugins/panel/"><code>@yaebal/panel</code></a> is
	a chat-inbox ui without a plugin/widget extension point, so job management ships as <code
	>cronAdmin</code>'s bot commands instead of a panel page — it works with or without the panel
	installed, and on every runtime yaebal supports (including edge/serverless).
</div>
