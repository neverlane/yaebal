<script lang="ts">
	import Code from "$lib/Code.svelte";

	const install = `pnpm add @yaebal/throttle`;

	const usage = `import { Bot } from "@yaebal/core";
import { autoRetry } from "@yaebal/again";
import { throttle } from "@yaebal/throttle";

const limiter = throttle(bot.api, {
  globalPerSec: 30,
  perChatPerSec: 1,
  perGroupPerMin: 20,
  perMethod: {
    sendVideo: { privateChat: { limit: 1, windowMs: 5_000 }, priority: -5 },
    answerCallbackQuery: { privateChat: false, group: false, priority: 20 },
  },
  onEvent: (event) => console.log(event.type),
});

autoRetry(bot.api, { retryAfterPaddingMs: 250 });

console.log(limiter.metrics.pending);`;

	const plugin = `const transport = throttle({ globalPerSec: 30 });

const bot = new Bot(token)
  .install(transport)
  .on("message:text", (ctx) => ctx.reply("hello!"));

transport.handle.metrics.acquired;`;

	const control = `import { withThrottle } from "@yaebal/throttle";

await bot.api.sendMessage(
  withThrottle({ chat_id, text: "urgent" }, { priority: 100 }),
);

const controller = new AbortController();
const queued = bot.api.sendMessage(
  withThrottle({ chat_id, text: "cancel me" }, { signal: controller.signal }),
);

controller.abort();
await queued;`;

	const storage = `import type { ThrottleStorage } from "@yaebal/throttle";

const redisStorage: ThrottleStorage = {
  async take(buckets, now) {
    // atomically check every bucket in Redis
    // record hits only when every bucket has room
    return { ok: true, waitMs: 0 };
  },
  async freeze(bucketKey, until) {
    // store a retry_after freeze shared by every worker
  },
};

throttle(bot.api, { storage: redisStorage });`;

	const cancel = `limiter.cancel({ method: "sendMessage" });
limiter.cancel({ bucket: \`private:\${chatId}\` });`;

	const reserveUsage = `import { reserve } from "@yaebal/throttle";

reserve(1000, 0, 34);
// => { at: 1000, next: 1034 }`;
</script>

<svelte:head>
	<title>@yaebal/throttle - yaebal</title>
</svelte:head>

<h1>@yaebal/throttle</h1>
<p class="lead">
	priority outbound scheduler with Telegram-shaped buckets, shared storage, cancellation and metrics.
</p>

<h2>install</h2>
<Code code={install} title="terminal" lang="sh" />

<h2>usage</h2>
<p>
	install it on the API layer. every outgoing request acquires all relevant buckets before it reaches
	Telegram.
</p>
<Code code={usage} title="bot.ts" />

<p>installable plugin form is available when you want a handle before the bot is started:</p>
<Code code={plugin} title="plugin.ts" />

<h2>buckets</h2>
<table>
	<thead>
		<tr><th>bucket</th><th>default</th><th>what it protects</th></tr>
	</thead>
	<tbody>
		<tr><td><code>global</code></td><td><code>30/s</code></td><td>bot-wide Telegram soft cap</td></tr>
		<tr><td><code>private:&lt;chat_id&gt;</code></td><td><code>1/s</code></td><td>one private chat</td></tr>
		<tr><td><code>group:&lt;chat_id&gt;</code></td><td><code>20/min</code></td><td>one group or supergroup</td></tr>
		<tr><td><code>method:&lt;method&gt;:...</code></td><td>custom</td><td>isolated per-method buckets from limit overrides</td></tr>
	</tbody>
</table>

<p>
	<code>getMe</code>, <code>getUpdates</code>, <code>getWebhookInfo</code>, <code>logOut</code> and
	<code>close</code> bypass throttling by default. override with <code>excludedMethods</code> or
	<code>excludeMethods</code>.
</p>

<h2>priority, abort, cancel</h2>
<p>
	request-level control is attached with a symbol, so it is not serialized into Telegram params.
</p>
<Code code={control} title="priority.ts" />
<Code code={cancel} title="cancel.ts" />

<h2>shared storage</h2>
<p>
	the default storage is in-memory and process-local. pass a storage adapter to coordinate workers,
	containers or regions. <code>take()</code> must atomically check all buckets and record the hit only
	when every bucket fits.
</p>
<Code code={storage} title="redis-storage.ts" />

<h2>metrics and events</h2>
<table>
	<thead>
		<tr><th>metric</th><th>meaning</th></tr>
	</thead>
	<tbody>
		<tr><td><code>pending</code></td><td>currently queued calls in this process</td></tr>
		<tr><td><code>acquired</code></td><td>calls that received a slot</td></tr>
		<tr><td><code>delayed</code></td><td>calls that waited at least once</td></tr>
		<tr><td><code>rejected</code></td><td>calls rejected by overflow mode or storage errors</td></tr>
		<tr><td><code>cancelled</code></td><td>calls cancelled by signal or handle.cancel()</td></tr>
		<tr><td><code>retryAfterLearned</code></td><td>structured Telegram flood-waits learned from errors</td></tr>
		<tr><td><code>totalWaitMs</code></td><td>aggregate local queue wait time</td></tr>
	</tbody>
</table>

<h2>api</h2>
<table>
	<thead>
		<tr><th>export</th><th>signature</th><th>description</th></tr>
	</thead>
	<tbody>
		<tr><td><code>throttle</code></td><td><code>(options?) =&gt; ThrottlePlugin</code><br /><code>(api, options?) =&gt; ThrottleHandle</code></td><td>install the scheduler on a bot or API</td></tr>
		<tr><td><code>createThrottleHandle</code></td><td><code>(options?) =&gt; ThrottleHandle</code></td><td>create a standalone scheduler handle</td></tr>
		<tr><td><code>memoryThrottleStorage</code></td><td><code>() =&gt; ThrottleStorage</code></td><td>process-local sliding-window storage</td></tr>
		<tr><td><code>withThrottle</code></td><td><code>(params, control) =&gt; params</code></td><td>attach priority, skip or abort signal to one request</td></tr>
		<tr><td><code>reserve</code></td><td><code>(now, next, interval) =&gt; &#123; at, next &#125;</code></td><td>legacy pure helper kept for tests and compatibility</td></tr>
	</tbody>
</table>

<h2>compatibility mode</h2>
<p>
	<code>minIntervalMs</code> still works for old code. it becomes a single global bucket with
	<code>limit: 1</code> and the provided window.
</p>
<Code code={reserveUsage} title="legacy.ts" />

<div class="note">
	<strong>pair with again.</strong> when Telegram returns <code>response_parameters.retry_after</code>,
	<code>@yaebal/core</code> exposes it on <code>TelegramError.parameters.retry_after</code>. throttle freezes
	the affected buckets, while <code>@yaebal/again</code> performs the awaited retry.
</div>
