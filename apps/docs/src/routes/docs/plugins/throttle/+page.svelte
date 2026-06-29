<script lang="ts">
	import Code from "$lib/Code.svelte";

	const install = `pnpm add @yaebal/throttle`;

	const usage = `import { Bot } from "@yaebal/core";
import { throttle } from "@yaebal/throttle";

// space outgoing API calls to ≤ 30/sec (Telegram's global cap)
const bot = new Bot(process.env.BOT_TOKEN!)
  .install(throttle())
  .on("message:text", (ctx) => ctx.reply("hello!"));

bot.start();`;

	const customInterval = `// tighter limit — one call per 100 ms
bot.install(throttle({ minIntervalMs: 100 }));`;

	const directApi = `// lower-level form, useful when you only have an Api instance
throttle(bot.api, { minIntervalMs: 100 });`;

	const reserveUsage = `import { reserve } from "@yaebal/throttle";

// first call at t=1000 — fires immediately, next slot at 1034
reserve(1000, 0, 34);
// => { at: 1000, next: 1034 }

// second call arrives at t=1000 — queued to slot 1034
reserve(1000, 1034, 34);
// => { at: 1034, next: 1068 }

// call arrives after a long gap — fires immediately at t=2000
reserve(2000, 1068, 34);
// => { at: 2000, next: 2034 }`;
</script>

<svelte:head>
	<title>@yaebal/throttle — yaebal</title>
</svelte:head>

<h1>@yaebal/throttle</h1>
<p class="lead">
	space out outgoing API calls to stay within Telegram's rate limits — calls are delayed, never
	dropped.
</p>

<h2>install</h2>
<Code code={install} title="terminal" lang="sh" />

<h2>usage</h2>
<p>
	install <code>throttle()</code> on the bot. it attaches a <code>before</code> hook to the API
	layer that enforces a minimum gap between consecutive outgoing calls.
</p>
<Code code={usage} title="bot.ts" />

<h2>custom interval</h2>
<Code code={customInterval} title="bot.ts" />
<p>
	the direct API-hook form remains available when you are wiring a standalone
	<code>Api</code> instance instead of a bot:
</p>
<Code code={directApi} title="api.ts" />

<h2>api</h2>
<table>
	<thead>
		<tr><th>export</th><th>signature</th><th>description</th></tr>
	</thead>
	<tbody>
		<tr>
			<td><code>throttle</code></td>
			<td><code>(options?: ThrottleOptions) =&gt; BotPlugin</code><br /><code>(api: Api, options?: ThrottleOptions) =&gt; void</code></td>
			<td>creates an installable bot plugin or installs the throttle hook on an <code>Api</code> directly</td>
		</tr>
		<tr>
			<td><code>reserve</code></td>
			<td><code>(now: number, next: number, interval: number) =&gt; \&#123; at: number; next: number \&#125;</code></td>
			<td>pure slot-reservation function — exported for testing</td>
		</tr>
		<tr>
			<td><code>ThrottleOptions</code></td>
			<td>interface</td>
			<td>options bag passed to <code>throttle()</code></td>
		</tr>
	</tbody>
</table>

<h3>ThrottleOptions</h3>
<table>
	<thead>
		<tr><th>field</th><th>type</th><th>default</th><th>description</th></tr>
	</thead>
	<tbody>
		<tr>
			<td><code>minIntervalMs</code></td>
			<td><code>number</code></td>
			<td><code>34</code></td>
			<td>minimum milliseconds between outgoing API calls (~30 calls/sec, Telegram's global cap)</td>
		</tr>
	</tbody>
</table>

<h2>how slot reservation works</h2>
<p>
	<code>reserve(now, next, interval)</code> returns the earliest slot at or after <code>now</code>
	that is at least <code>interval</code> ms after the previous slot. if the bot is idle, the
	next call fires at <code>now</code> with no artificial delay. if calls arrive faster than the
	interval, they queue up by advancing the next-slot pointer.
</p>
<Code code={reserveUsage} title="reserve.ts" />

<div class="note">
	<strong>calls are delayed, not dropped.</strong> every API call will eventually go through —
	throttle only adds a wait, it never discards a request. if your bot sends a large burst it
	will drain the queue over time rather than losing messages.
	<br /><br />
	<strong>this is a global outgoing rate limit.</strong> throttle operates on <code>bot.api</code>
	and applies to every method call regardless of which user triggered it. for per-user
	incoming-update limiting, use <code>@yaebal/ratelimiter</code> instead.
	<br /><br />
	<strong>the default 34 ms</strong> corresponds to Telegram's documented global cap of
	~30 messages/second. lower values risk 429 errors; the <code>@yaebal/again</code> plugin
	can handle those automatically if they occur.
</div>
