<script lang="ts">
	import Code from "$lib/Code.svelte";

	const stack = `import { createBot } from "yaebal";
import { autoRetry } from "@yaebal/again";
import { throttle } from "@yaebal/throttle";
import { ratelimiter } from "@yaebal/ratelimiter";

export const bot = createBot(process.env.BOT_TOKEN!)
  .install(ratelimiter({ limit: 5, windowMs: 1000 }))
  .install(throttle({ globalPerSec: 25, perChatPerSec: 1, perGroupPerMin: 20 }))
  .install(autoRetry({ maxRetries: 5, maxDelayMs: 30_000, retryAfterPaddingMs: 250 }));`;

	const scaffold = `pnpm create yaebal my-bot --plugins ratelimiter,throttle,again`;

	const paid = `import { createBot } from "yaebal";

const bot = createBot(process.env.BOT_TOKEN!);
const chatId = 123456789;
const text = "campaign message";

await bot.api.call("sendMessage", {
  chat_id: chatId,
  text,
  allow_paid_broadcast: true,
});`;
</script>

<svelte:head><title>rate limits — yaebal</title></svelte:head>

<h1>rate limits</h1>
<p class="lead">avoid 429s by separating inbound abuse control, outbound scheduling and retry.</p>

<h2>the three layers</h2>
<table>
	<thead><tr><th>layer</th><th>package</th><th>job</th></tr></thead>
	<tbody>
		<tr><td>inbound</td><td><a href="/docs/plugins/ratelimiter/"><code>@yaebal/ratelimiter</code></a></td><td>drop spammy users before expensive handlers run</td></tr>
		<tr><td>outbound</td><td><a href="/docs/plugins/throttle/"><code>@yaebal/throttle</code></a></td><td>schedule telegram api calls through safe buckets</td></tr>
		<tr><td>retry</td><td><a href="/docs/plugins/again/"><code>@yaebal/again</code></a></td><td>honor <code>retry_after</code> and transient 5xx/network failures</td></tr>
	</tbody>
</table>
<p>
	installation order here doesn't matter between these three specifically — <code>throttle</code>
	and <code>autoRetry</code> hook into <code>bot.api</code> directly (not the middleware chain), and
	<code>ratelimiter</code> only needs to run before your handlers, which it does as long as it's
	installed before them.
</p>
<Code code={stack} title="rate-limit-stack.ts" />
<p>
	<a href="/docs/scaffolding/">create-yaebal</a> can wire all three in at scaffold time instead of
	installing them by hand:
</p>
<Code code={scaffold} lang="sh" title="terminal" />

<h2>safe defaults</h2>
<ul>
	<li>treat 30 messages/sec bot-wide as a ceiling, not a target — that's <code>throttle</code>'s own default.</li>
	<li>keep one private chat near 1 message/sec unless you have a specific reason.</li>
	<li>serialize per-chat updates when handlers mutate state — see <a href="/docs/runner/">@yaebal/runner</a> for polling at scale.</li>
	<li>for broadcasts, use a durable queue instead of a raw <code>for</code> loop — see <a href="/docs/production/queues-broadcasts/">queues and broadcasts</a>.</li>
	<li>always record 403 recipients and remove them from future campaigns.</li>
</ul>

<h2>paid broadcast</h2>
<p>
	telegram supports <code>allow_paid_broadcast</code> for high-throughput paid sends, bypassing the
	usual per-chat pacing. still keep retry and accounting: stars balance, failed recipients and
	permanent skips are business data either way.
</p>
<Code code={paid} title="paid-broadcast.ts" />

<h2>failure policy</h2>
<table>
	<thead><tr><th>error</th><th>response</th></tr></thead>
	<tbody>
		<tr><td><code>429 retry_after</code></td><td>sleep, retry, and slow the queue — <code>autoRetry</code> and <code>throttle</code> both read <code>retry_after</code> automatically</td></tr>
		<tr><td><code>403 forbidden</code></td><td>skip permanently and mark recipient inactive</td></tr>
		<tr><td><code>400 bad request</code></td><td>usually a payload bug; fail the job and alert</td></tr>
		<tr><td><code>5xx</code> / network</td><td>bounded retry with exponential backoff</td></tr>
	</tbody>
</table>
