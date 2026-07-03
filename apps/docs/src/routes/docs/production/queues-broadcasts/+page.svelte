<script lang="ts">
	import Code from "$lib/Code.svelte";
	import Try from "$lib/Try.svelte";

	const broadcast = `import { BroadcastClient } from "@yaebal/broadcast";

const broadcasts = new BroadcastClient({
  rateLimit: { limit: 25, windowMs: 1000 },
  retry: { attempts: 5, baseDelayMs: 1000, retryAfterPaddingMs: 250 },
});

broadcasts.type("text", async (chatId: number, text: string) => {
  await bot.api.call("sendMessage", { chat_id: chatId, text });
});

const job = await broadcasts.start("text", users.map((u) => [u.chatId, "hello"] as const));
await job.wait();`;

	const worker = `process.once("SIGTERM", async () => {
  await broadcasts.stop?.();
  await bot.stop();
});`;
</script>

<svelte:head><title>queues and broadcasts — yaebal</title></svelte:head>

<h1>queues and broadcasts</h1>
<p class="lead">large outbound flows need durable jobs, bounded retry and recipient accounting.</p>

<h2>why a queue</h2>
<ul>
	<li>restarts should not lose progress.</li>
	<li>429s should slow the campaign, not break the bot for everyone.</li>
	<li>403 recipients should be skipped and removed from future sends.</li>
	<li>operators need pause, resume, cancel and progress.</li>
	<li>workers need leases so two processes do not send the same delivery.</li>
</ul>

<h2>typed jobs</h2>
<Code code={broadcast} title="broadcast.ts" />
<Try id="broadcast-queue" title="broadcast-playground.ts" />

<h2>storage model</h2>
<table>
	<thead><tr><th>record</th><th>contains</th></tr></thead>
	<tbody>
		<tr><td>job</td><td>type, status, totals, metadata, timestamps</td></tr>
		<tr><td>delivery</td><td>args, attempts, due time, lock, status, error/result</td></tr>
		<tr><td>event</td><td>optional audit trail for operators and metrics</td></tr>
	</tbody>
</table>

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
