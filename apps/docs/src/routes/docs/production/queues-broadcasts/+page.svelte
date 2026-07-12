<script lang="ts">
	import Code from "$lib/Code.svelte";
	import Try from "$lib/Try.svelte";

	const broadcast = `import { createBot } from "yaebal";
import { createBroadcast } from "@yaebal/broadcast";

const bot = createBot(process.env.BOT_TOKEN!);
const users: { chatId: number }[] = [];

// the default MemoryBroadcastStorage doesn't survive a restart — see "storage"
// below before running this against a real audience.
const broadcasts = createBroadcast(bot.api, {
  rateLimit: { limit: 25, windowMs: 1000 },
  retry: { attempts: 5, baseDelayMs: 1000, retryAfterPaddingMs: 250 },
}).type("text", async (chatId: number, text: string) => {
  await bot.api.call("sendMessage", { chat_id: chatId, text });
});

const job = await broadcasts.start("text", users.map((u) => [u.chatId, "hello"] as const));
await job.wait();`;

	const storage = `import type { BroadcastStorage } from "@yaebal/broadcast";
import { createBroadcast } from "@yaebal/broadcast";

// unlike session (which plugs into any @yaebal/sklad adapter), broadcast
// persistence is its own interface — implement it against your database once,
// and every job/delivery/event survives a restart and can be shared across
// worker processes (each claim carries a lease so two workers can't double-send).
declare const myDurableStorage: BroadcastStorage;

const broadcasts = createBroadcast(undefined as never, {
  storage: myDurableStorage,
  leaseMs: 30_000,
  workerId: process.env.HOSTNAME ?? "worker-1",
});`;

	const controls = `import { createBroadcast } from "@yaebal/broadcast";

declare const broadcasts: ReturnType<typeof createBroadcast>;

const job = await broadcasts.start("text", [] as const);

await job.pause();
await job.resume();
await job.cancel();

const snapshot = await job.snapshot();
snapshot.sent; // BroadcastSnapshot — result totals plus the underlying job state
snapshot.job.status;`;

	const events = `import { createBroadcast } from "@yaebal/broadcast";

const broadcasts = createBroadcast(undefined as never, {
  onEvent(event) {
    if (event.type === "delivery_failed") {
      console.warn("broadcast delivery failed", event.delivery.args[0], event.error);
    }
    if (event.type === "job_completed") {
      console.log("broadcast", event.job.id, "done:", event.job.status);
    }
  },
});`;

	const worker = `declare const broadcasts: { stop(options?: { drain?: boolean }): Promise<void> };
declare const bot: { stop(): Promise<void> };

process.once("SIGTERM", async () => {
  // drain: true waits for in-flight sends (or their leases) instead of
  // abandoning them mid-delivery.
  await broadcasts.stop({ drain: true });
  await bot.stop();
});`;
</script>

<svelte:head><title>queues and broadcasts — yaebal</title></svelte:head>

<h1>queues and broadcasts</h1>
<p class="lead">large outbound flows need durable jobs, bounded retry and recipient accounting.</p>

<h2>why a queue</h2>
<ul>
	<li>restarts should not lose progress — needs a durable <code>storage</code>, not the default in-memory one.</li>
	<li>429s should slow the campaign, not break the bot for everyone.</li>
	<li>403 recipients should be skipped and removed from future sends.</li>
	<li>operators need pause, resume, cancel and progress.</li>
	<li>workers need leases so two processes do not send the same delivery.</li>
</ul>

<h2>typed jobs</h2>
<p>
	<code>createBroadcast(bot.api, options)</code> returns a <code>Broadcast</code> client. register
	one or more delivery types with <code>.type(name, action)</code>, then <code>.start(name,
	items)</code> to enqueue a job — the local worker loop (<code>autoRun</code>, on by default)
	starts draining it immediately.
</p>
<Code code={broadcast} title="broadcast.ts" />
<Try id="broadcast-queue" title="broadcast-playground.ts" />

<h2>storage</h2>
<p>
	the built-in <code>MemoryBroadcastStorage</code> is the default and is fine for a single
	short-lived process. anything that must survive a restart or run behind more than one worker
	needs a real <code>BroadcastStorage</code> implementation — jobs, deliveries and an optional
	event log, backed by whatever database you already run.
</p>
<Code code={storage} title="storage.ts" />
<table>
	<thead><tr><th>record</th><th>contains</th></tr></thead>
	<tbody>
		<tr><td>job</td><td>type, status, totals, metadata, timestamps</td></tr>
		<tr><td>delivery</td><td>args, attempts, due time, lock, status, error/result</td></tr>
		<tr><td>event</td><td>optional audit trail for operators and metrics — see <code>onEvent</code> below</td></tr>
	</tbody>
</table>

<h2>pause, resume, cancel</h2>
<p><code>start()</code> resolves to a job handle — hand it to an admin command or a panel button.</p>
<Code code={controls} title="controls.ts" />

<h2>audit events</h2>
<p>
	<code>onEvent</code> fires for every state transition — job lifecycle, each delivery attempt,
	rate-limit backoff, storage errors — typed as a discriminated union on <code>event.type</code>.
</p>
<Code code={events} title="events.ts" />

<h2>shutdown</h2>
<p>stop accepting work, let in-flight sends finish or release their leases, then exit.</p>
<Code code={worker} title="shutdown.ts" />

<h2>operator checklist</h2>
<ul>
	<li>rate limit below telegram's ceiling unless paid broadcast is explicitly enabled.</li>
	<li>store original audience query or snapshot for auditability.</li>
	<li>surface skipped recipients separately from failed transient sends.</li>
	<li>make every job id visible in logs, metrics and panel actions.</li>
	<li>test first with <a href="/docs/plugins/test/">@yaebal/test</a> and a tiny audience.</li>
</ul>
