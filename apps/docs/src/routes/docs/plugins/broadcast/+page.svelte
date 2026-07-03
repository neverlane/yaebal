<script lang="ts">
	import Code from "$lib/Code.svelte";

	const install = `pnpm add @yaebal/broadcast`;

	const fast = `import { Bot } from "@yaebal/core";
import { broadcast } from "@yaebal/broadcast";

const bot = new Bot(token);

const result = await broadcast(bot.api, subscriberIds, "hello everyone", {
  rateLimit: { limit: 25, windowMs: 1_000 },
  retry: { attempts: 5, fixedDelayMs: 1_000 },
  extra: { disable_notification: true },
  onError: (chatId, error) => {
    console.error("delivery failed", chatId, error);
  },
});

console.log(result.sent, "sent", result.skipped, "skipped", result.failed, "failed");`;

	const typed = `import { Broadcast, MemoryBroadcastStorage } from "@yaebal/broadcast";

const broadcaster = new Broadcast(bot.api, {
  storage: new MemoryBroadcastStorage(),
  concurrency: 5,
  rateLimit: { limit: 25, windowMs: 1_000 },
  onEvent: (event) => console.log(event.type),
}).type("digest", (chatId: number, text: string) =>
  bot.api.sendMessage({ chat_id: chatId, text }),
);

const job = await broadcaster.start("digest", [
  [1001, "weekly digest"],
  [1002, "weekly digest"],
]);

const result = await job.wait();`;

	const controls = `await job.pause();
await job.resume();
await job.cancel();

const snapshot = await job.snapshot();
const jobs = await broadcaster.listJobs();
const failed = await broadcaster.listDeliveries(job.id, { status: "failed" });`;

	const method = `const job = await broadcaster.queueMethod(
  "sendPhoto",
  users,
  (user) => ({
    chat_id: user.chatId,
    photo: user.photo,
    caption: "new drop",
  }),
);`;
</script>

<svelte:head>
	<title>@yaebal/broadcast — yaebal</title>
</svelte:head>

<h1>@yaebal/broadcast</h1>
<p class="lead">
	typed broadcast jobs for yaebal bots: queue many deliveries, keep progress in storage, retry
	transient failures, skip blocked users, pause/resume/cancel jobs and stream events to logs or ui.
</p>

<h2>install</h2>
<Code code={install} title="terminal" lang="sh" />

<h2>fast path</h2>
<p>
	use <code>broadcast()</code> when you want to send one text message and wait for the result. it
	creates a local worker, sends every delivery, then stops it.
</p>
<Code code={fast} title="broadcast.ts" />

<h2>typed jobs</h2>
<p>
	use <code>Broadcast</code> for reusable campaigns, background delivery, progress inspection and
	job controls. <code>type()</code> accumulates valid job names and tuple arguments through the chain,
	so <code>start("digest", ...)</code> only accepts the arguments of the registered handler.
</p>
<Code code={typed} title="typed-jobs.ts" />

<h2>controls</h2>
<p>
	every started job returns a handle. handles are small references around storage, so you can also
	call <code>broadcaster.pause(id)</code>, <code>broadcaster.resume(id)</code> and
	<code>broadcaster.cancel(id)</code> from an admin panel or command handler.
</p>
<Code code={controls} title="controls.ts" />

<h2>any method</h2>
<p>
	text messages are just the common case. <code>queueMethod()</code> builds params per target for any
	telegram bot api method, and <code>type()</code> can run fully custom async logic.
</p>
<Code code={method} title="method.ts" />

<h2>storage</h2>
<p>
	<code>MemoryBroadcastStorage</code> is for tests, examples and single-process bots. production bots
	can implement <code>BroadcastStorage</code> on top of redis, postgres, sqlite or another queue/database.
	for multi-worker delivery, make <code>claim(workerId, now, leaseMs)</code> atomic.
</p>

<h2>behavior</h2>
<table>
	<thead>
		<tr><th>feature</th><th>default</th></tr>
	</thead>
	<tbody>
		<tr><td>rate limit</td><td><code>25</code> deliveries per second</td></tr>
		<tr><td>retry budget</td><td><code>5</code> attempts per delivery</td></tr>
		<tr><td>blocked users</td><td>telegram <code>403</code> is counted as <code>skipped</code></td></tr>
		<tr><td>flood waits</td><td>telegram <code>429</code> honors <code>response_parameters.retry_after</code></td></tr>
		<tr><td>progress</td><td><code>total</code>, <code>sent</code>, <code>failed</code>, <code>skipped</code>, <code>retried</code>, <code>status</code></td></tr>
		<tr><td>events</td><td>job lifecycle, delivery lifecycle, retry, rate-limit and storage errors</td></tr>
	</tbody>
</table>

<h2>exports</h2>
<table>
	<thead>
		<tr><th>export</th><th>kind</th><th>use</th></tr>
	</thead>
	<tbody>
		<tr><td><code>broadcast</code></td><td>function</td><td>send one text campaign and wait for completion</td></tr>
		<tr><td><code>Broadcast</code></td><td>class</td><td>typed job engine with storage, worker, controls and events</td></tr>
		<tr><td><code>MemoryBroadcastStorage</code></td><td>class</td><td>in-memory storage adapter for tests and examples</td></tr>
		<tr><td><code>createBroadcast</code></td><td>function</td><td>factory wrapper around <code>new Broadcast(api, options)</code></td></tr>
		<tr><td><code>decideRetry</code></td><td>function</td><td>unit-testable retry policy helper</td></tr>
	</tbody>
</table>

<div class="note">
	see the runnable <a href="https://github.com/neverlane/yaebal/tree/master/examples/broadcast"><code>examples/broadcast</code></a>
	bot for subscribers, admin commands, progress and graceful shutdown.
</div>
