<script lang="ts">
	import Code from "$lib/Code.svelte";
	import Try from "$lib/Try.svelte";

	const install = `pnpm add @yaebal/analytics`;

	const adapters = `import { clickhouseAdapter, plausibleAdapter, postHogAdapter, sqliteAdapter } from "@yaebal/analytics";
import { PostHog } from "posthog-node";
import { DatabaseSync } from "node:sqlite";

analytics({
  adapters: [
    postHogAdapter(new PostHog(process.env.POSTHOG_KEY!)),
    plausibleAdapter({ domain: "mybot.example" }),
    sqliteAdapter(new DatabaseSync("analytics.db")),
    clickhouseAdapter(clickhouseClient, { batchSize: 50 }),
  ],
  onError: (error, event) => console.error("analytics failed", event.name, error),
});`;

	const bridge = `import { analytics, createAnalytics, fromEvent } from "@yaebal/analytics";

const events = createAnalytics({ adapters: [postHogAdapter(posthog)] });

bot.install(analytics(events)); // ctx.track(...) now shares events's adapters

const jobs = new Broadcast({
  // ...
  onEvent: (event) => events.track(fromEvent("broadcast", event)),
});`;

	const flush = `const events = analytics({ adapters: [clickhouseAdapter(client)] });
bot.install(events);
bot.onStop(() => events.flush()); // drains a partial batch before shutdown`;

	const testing = `import { createTestEnv } from "@yaebal/test";
import { analytics, type AnalyticsAdapter } from "@yaebal/analytics";

const tracked: string[] = [];
const fake: AnalyticsAdapter = { track: (event) => void tracked.push(event.name) };

const bot = new Composer<Context>()
  .install(analytics({ adapters: [fake] }))
  .command("start", (ctx) => {
    ctx.track("start");
    return ctx.reply("hi");
  });

await createTestEnv(bot).createUser().sendCommand("start");
// tracked => ["start"]`;
</script>

<svelte:head>
	<title>@yaebal/analytics - yaebal</title>
</svelte:head>

<h1>@yaebal/analytics</h1>
<p class="lead">
	event tracking and funnels, straight from middleware: <code>ctx.track("event", {'{'} key: value
	{'}'})</code> fans out to whatever sinks you configure — posthog, plausible, your own
	sqlite/clickhouse table, or a console log for local dev. downstream tools (posthog funnels,
	plausible funnels, your own sql) turn the event stream into funnels; this package's job is just
	consistent, typed emission.
</p>

<h2>install</h2>
<Code code={install} title="terminal" lang="sh" />

<h2>usage</h2>
<p>
	install <code>analytics()</code> with <code>bot.install()</code>. it adds <code>ctx.track(name,
	properties?)</code> to every handler's context — each call resolves <code>userId</code> and
	<code>chatId</code> from the current <code>ctx</code> before handing the event to your adapters.
</p>
<Try id="analytics-track" title="bot.ts" />

<h2>adapters</h2>
<p>
	adapters take an already-constructed client and type it structurally, so this package depends
	on nothing and never dictates a driver version.
</p>
<Code code={adapters} title="analytics.ts" />
<ul>
	<li><code>postHogAdapter(client, options?)</code> — <code>client</code> is anything shaped like <code>posthog-node</code>'s <code>PostHog</code> (structural <code>capture()</code> + optional <code>flush()</code>).</li>
	<li><code>plausibleAdapter(options)</code> — posts straight to plausible's events api, no client library.</li>
	<li><code>sqliteAdapter(db, options?)</code> — <code>db</code> is <code>node:sqlite</code>'s <code>DatabaseSync</code>, <code>better-sqlite3</code>, or anything with <code>exec</code>/<code>prepare</code>. creates its table on first use.</li>
	<li><code>clickhouseAdapter(client, options?)</code> — <code>client</code> is anything shaped like <code>@clickhouse/client</code> (structural <code>insert()</code>). buffers events and batch-inserts; <code>flush()</code> drains a partial batch.</li>
	<li><code>consoleAdapter()</code> — zero-config sink for local development.</li>
</ul>
<div class="note">
	adapter failures never break tracking: <code>track()</code> is fire-and-forget, and a
	rejected/throwing adapter is routed to <code>onError</code> instead of interrupting the update.
</div>

<h2>a unified collection point</h2>
<p>
	plugins like <code>@yaebal/broadcast</code> already emit their own event stream
	(<code>onEvent</code>). build a standalone client with <code>createAnalytics()</code> and feed
	both <code>ctx.track</code> and other plugins' events into the same adapters with
	<code>fromEvent</code>.
</p>
<Code code={bridge} title="events.ts" />

<h2>flushing buffered adapters</h2>
<p>
	buffered adapters (like <code>clickhouseAdapter</code>) need a flush before shutdown so the
	last partial batch isn't lost. <code>analytics()</code> returns the plugin function with a
	<code>.flush()</code> attached — wire it to <code>bot.onStop</code>, the same pattern as
	<a href="/docs/plugins/media-group/"><code>@yaebal/media-group</code></a>'s album flush.
</p>
<Code code={flush} title="shutdown.ts" />

<h2>api</h2>
<table>
	<thead>
		<tr><th>export</th><th>signature</th><th>description</th></tr>
	</thead>
	<tbody>
		<tr>
			<td><code>analytics</code></td>
			<td><code>(source: AnalyticsOptions | Analytics) =&gt; AnalyticsPlugin</code></td>
			<td>installs <code>ctx.track</code>; the returned function also carries <code>.flush()</code></td>
		</tr>
		<tr>
			<td><code>createAnalytics</code></td>
			<td><code>(options: AnalyticsOptions) =&gt; Analytics</code></td>
			<td>standalone collection point, independent of any bot or <code>ctx</code></td>
		</tr>
		<tr>
			<td><code>fromEvent</code></td>
			<td><code>(prefix, event: {'{ type: string }'}) =&gt; TrackInput</code></td>
			<td>shapes a foreign <code>{'{ type }'}</code> event stream into a trackable input</td>
		</tr>
		<tr><td><code>postHogAdapter</code></td><td><code>(client, options?) =&gt; AnalyticsAdapter</code></td><td>forwards events to a <code>posthog-node</code>-shaped client</td></tr>
		<tr><td><code>plausibleAdapter</code></td><td><code>(options) =&gt; AnalyticsAdapter</code></td><td>posts to plausible's events api</td></tr>
		<tr><td><code>sqliteAdapter</code></td><td><code>(db, options?) =&gt; AnalyticsAdapter</code></td><td>appends events as rows to sqlite</td></tr>
		<tr><td><code>clickhouseAdapter</code></td><td><code>(client, options?) =&gt; AnalyticsAdapter</code></td><td>buffers and batch-inserts into clickhouse</td></tr>
		<tr><td><code>consoleAdapter</code></td><td><code>() =&gt; AnalyticsAdapter</code></td><td>logs events to <code>console.log</code></td></tr>
	</tbody>
</table>

<h3>AnalyticsControl interface</h3>
<table>
	<thead>
		<tr><th>method</th><th>returns</th><th>description</th></tr>
	</thead>
	<tbody>
		<tr>
			<td><code>track(name, properties?)</code></td>
			<td><code>void</code></td>
			<td>fire-and-forget event, tagged with the current <code>userId</code>/<code>chatId</code></td>
		</tr>
	</tbody>
</table>

<h3>AnalyticsOptions</h3>
<table>
	<thead>
		<tr><th>field</th><th>type</th><th>default</th><th>description</th></tr>
	</thead>
	<tbody>
		<tr><td><code>adapters</code></td><td><code>AnalyticsAdapter[]</code></td><td>—</td><td>every configured sink</td></tr>
		<tr><td><code>onError</code></td><td><code>(error, event) =&gt; unknown</code></td><td>—</td><td>observe adapter failures without breaking tracking</td></tr>
		<tr><td><code>now</code></td><td><code>() =&gt; number</code></td><td><code>Date.now</code></td><td>clock override, mainly for tests</td></tr>
	</tbody>
</table>

<h2>testing</h2>
<p>
	an <code>AnalyticsAdapter</code> is a plain object — pass a fake one in tests and assert on
	what it captured. drive the bot with <code>@yaebal/test</code> as usual.
</p>
<Code code={testing} title="analytics.test.ts" />

<div class="note">
	<strong>pairs with broadcast.</strong> <code>@yaebal/broadcast</code>'s <code>onEvent</code> and
	<code>ctx.track</code> can both feed the same <code>Analytics</code> client — see
	<a href="/docs/plugins/broadcast/"><code>@yaebal/broadcast</code></a> and the bridge example
	above.
</div>
