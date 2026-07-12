<script lang="ts">
	import Code from "$lib/Code.svelte";
	import Try from "$lib/Try.svelte";

	const install = `pnpm add @yaebal/analytics`;

	const catalog = `import { p } from "@yaebal/analytics";

const events = {
  // "true" — declared, but any properties allowed (no schema to enforce)
  onboarding_completed: true,
  // a schema — required/optional fields checked at both compile time and runtime
  purchase: {
    props: p.object({ amount: p.number(), currency: p.optional(p.string()) }),
    sample: 0.5,          // only half of these reach adapters — see "privacy & sampling"
    redact: ["email"],    // stripped from this event's properties specifically
    description: "a completed checkout",
  },
};`;

	const adapters = `import { clickhouseAdapter, httpAdapter, plausibleAdapter, postHogAdapter, sqliteAdapter } from "@yaebal/analytics";
import { PostHog } from "posthog-node";
import { DatabaseSync } from "node:sqlite";

analytics({
  events,
  adapters: [
    postHogAdapter(new PostHog(process.env.POSTHOG_KEY!)),
    plausibleAdapter({ domain: "mybot.example" }),
    sqliteAdapter(new DatabaseSync("analytics.db")),
    clickhouseAdapter(clickhouseClient, { batchSize: 50 }),
    httpAdapter("https://collector.example/events", { headers: { authorization: "Bearer ..." } }),
  ],
  onError: (error, event) => console.error("analytics failed", event.name, error),
});`;

	const clickhouseDdl = `import { clickhouseSchema } from "@yaebal/analytics";

await clickhouseClient.command({ query: clickhouseSchema() });`;

	const privacy = `analytics({
  events,
  adapters: [postHogAdapter(posthog)],
  // hash userId/chatId before any adapter sees them — stable per id (funnels still group
  // correctly), not reversible by casual inspection, NOT a security control (small id spaces
  // are brute-forceable). pass a function instead (e.g. HMAC with a secret) for anything stronger.
  anonymize: "hash",
  // strip a property from every event, on top of any catalog entry's own \`redact\`
  redact: ["ip"],
  // consulted with the RAW (pre-anonymize) ids — an opt-out list keyed by real telegram ids
  // still works. a throwing/rejecting predicate fails OPEN, so a buggy check can't blackhole
  // every event.
  shouldTrack: (event) => !optedOut.has(event.userId),
  // load-shedding, not a stable per-user rollout — 10% of calls reach adapters, decided
  // fresh per call. a catalog entry's own \`sample\` overrides this for that event.
  sample: 0.1,
});`;

	const bridge = `import { analytics, createAnalytics, fromEvent } from "@yaebal/analytics";

const events = createAnalytics({ adapters: [postHogAdapter(posthog)] });

bot.install(analytics(events)); // ctx.track(...) now shares events's adapters

const jobs = new Broadcast({
  // ...
  onEvent: (event) => events.track(fromEvent("broadcast", event)),
});`;

	const flush = `const events = analytics({ adapters: [clickhouseAdapter(client)] });
bot.install(events); // flush() is now wired to bot.onStop automatically

// only needed off a real Bot (a bare Composer, or bot.onStop never firing in a
// webhook/serverless deployment):
someOtherShutdownHook(() => events.flush());`;

	const testing = `import { createTestEnv } from "@yaebal/test";
import { analytics, memoryAdapter } from "@yaebal/analytics";

const store = memoryAdapter();

const bot = new Composer<Context>()
  .install(analytics({ adapters: [store] }))
  .command("start", (ctx) => {
    ctx.track("start");
    return ctx.reply("hi");
  });

await createTestEnv(bot).createUser().sendCommand("start");
// store.events => [{ name: "start", userId: ..., timestamp: ..., ... }]`;
</script>

<svelte:head>
	<title>@yaebal/analytics - yaebal</title>
</svelte:head>

<h1>@yaebal/analytics</h1>
<p class="lead">
	typed event tracking and funnels, straight from middleware:
	<code>ctx.track("purchase", {'{'} amount: 9 {'}'})</code> fans out to whatever sinks you configure
	— posthog, plausible, your own sqlite/clickhouse table, a generic http collector, or a console
	log for local dev. event names and their properties are checked against a catalog you declare
	once, the same way <a href="/docs/plugins/feature-flags/"><code>@yaebal/feature-flags</code></a>
	types flag keys — a typo'd event name or a missing required property is a compile error, not a
	silent gap in your funnel three months later.
</p>

<h2>install</h2>
<Code code={install} title="terminal" lang="sh" />

<h2>usage</h2>
<p>
	install <code>analytics()</code> with <code>bot.install()</code>. it adds
	<code>ctx.track(name, properties?)</code> and <code>ctx.identify(properties)</code> to every
	handler's context — each call resolves <code>userId</code>/<code>chatId</code> from the current
	<code>ctx</code> before handing the event to your adapters. skip the <code>events</code> catalog
	entirely to keep <code>ctx.track</code> fully untyped (any <code>string</code> name, any
	properties).
</p>
<Try id="analytics-track" title="bot.ts" />

<h2>the typed catalog</h2>
<p>
	<code>p</code> is a tiny, zero-dependency runtime validator —
	<code>p.string()</code> / <code>p.number()</code> / <code>p.boolean()</code> /
	<code>p.optional(field)</code> / <code>p.object({'{...}'})</code>. it exists to give
	<code>ctx.track</code> both compile-time property checking and a runtime guard against a
	malformed call; reach for <code>zod</code>/<code>valibot</code> and hand-write a
	<code>PropsSchema</code> (<code>{'{ parse(value) }'}</code>) if you need more than that.
</p>
<Code code={catalog} title="events.ts" />
<div class="note">
	a malformed <code>track()</code> call (wrong property type, missing required property, or — when
	a catalog was declared — an event name that isn't in it) is reported to <code>onError</code> and
	dropped, never thrown into your handler and never silently forwarded to adapters.
</div>

<h2>auto-capture</h2>
<p>
	emit events for common update kinds with no manual <code>ctx.track</code> call:
	<code>autoTrack: ["commands", "callback_queries", "messages"]</code>. each kind emits a
	<strong>fixed</strong> event name with the dynamic bit as a <em>property</em> —
	<code>command_used</code> + <code>{'{ command: "start" }'}</code>,
	<code>callback_query</code> + <code>{'{ data: "..." }'}</code>,
	<code>message_received</code> + <code>{'{ contentType: "text" }'}</code> — never an event name
	per command/callback payload, which would blow up your adapters' event schemas. a command
	message is only counted once even with both <code>"commands"</code> and <code>"messages"</code>
	enabled.
</p>
<Try id="analytics-auto-capture" title="bot.ts" />

<h2>adapters</h2>
<p>
	adapters take an already-constructed client and type it structurally, so this package depends
	on nothing and never dictates a driver version.
</p>
<Code code={adapters} title="analytics.ts" />
<ul>
	<li><code>postHogAdapter(client, options?)</code> — <code>client</code> is anything shaped like <code>posthog-node</code>'s <code>PostHog</code> (structural <code>capture()</code> + optional <code>identify()</code>/<code>flush()</code>). a custom <code>distinctId()</code> keeps <code>userId</code> reachable as a property, since it's no longer posthog's own identity.</li>
	<li><code>plausibleAdapter(options)</code> — posts straight to plausible's events api, no client library. plausible dedupes "unique visitors" by hashing IP + user-agent; without a real per-user IP, every event from a bot process would look like the same visitor, so this adapter sends a deterministic synthetic <code>X-Forwarded-For</code> derived from <code>userId</code>/<code>chatId</code> instead. only scalar properties reach plausible — an object/array value is dropped rather than corrupting the breakdown.</li>
	<li><code>sqliteAdapter(db, options?)</code> — <code>db</code> is <code>node:sqlite</code>'s <code>DatabaseSync</code>, <code>better-sqlite3</code>, or anything with <code>exec</code>/<code>prepare</code>. creates its table (and a <code>(name, created_at)</code> index) on first use — see <code>sqliteSchema()</code> to run the DDL yourself. supports <code>query()</code>, so <code>analyticsAdmin()</code> works against it directly.</li>
	<li><code>clickhouseAdapter(client, options?)</code> — <code>client</code> is anything shaped like <code>@clickhouse/client</code> (structural <code>insert()</code>). buffers and batch-inserts (<code>batchSize</code>, <code>intervalMs</code>, <code>maxRetries</code>, <code>maxBuffered</code>, <code>onDrop</code>) — a failed insert <strong>retries with backoff instead of losing the batch</strong>. clickhouse has no auto-migration like sqlite's <code>db.exec</code>, so run <code>clickhouseSchema()</code>'s DDL yourself once.</li>
	<li><code>httpAdapter(url, options?)</code> — POST batches of events as JSON to any HTTP collector (umami, a mixpanel-compatible batch endpoint, your own). same batching/retry/backpressure as <code>clickhouseAdapter</code>.</li>
	<li><code>memoryAdapter()</code> — an in-memory sink: for tests and small bots that want <code>/stats</code> without a database. supports <code>query()</code>.</li>
	<li><code>consoleAdapter()</code> — zero-config sink for local development.</li>
</ul>
<Code code={clickhouseDdl} title="migrate.ts" />
<div class="note">
	adapter failures never break tracking: <code>track()</code> is fire-and-forget, and a
	rejected/throwing adapter is routed to <code>onError</code> instead of interrupting the update.
	<code>onError</code> itself is never allowed to break tracking either — if it throws, the error
	is swallowed after one <code>console.warn</code> rather than propagating out of
	<code>ctx.track()</code>/<code>flush()</code>.
</div>

<h2>privacy &amp; sampling</h2>
<p>
	<code>userId</code>/<code>chatId</code> are personal data the moment they leave your process —
	a cloud posthog/plausible instance is a third party. <code>analytics()</code> has first-class
	controls instead of leaving this to you.
</p>
<Code code={privacy} title="analytics.ts" />

<h2>an in-chat admin surface</h2>
<p>
	<code>analyticsAdmin({'{ isAdmin, adapter }'})</code> — a telegram-native ops surface for events
	<code>analytics()</code> tracks, the same pattern as
	<a href="/docs/plugins/feature-flags/"><code>@yaebal/feature-flags</code></a>'s
	<code>flagsAdmin</code>. <code>/analytics</code> reports total events and top event names over
	the last 24h; <code>/analytics 1h</code> | <code>7d</code> | <code>30d</code> switch the window.
	pair it with <code>memoryAdapter</code>, <code>sqliteAdapter</code>, or
	<code>clickhouseAdapter</code> — <code>posthogAdapter</code>/<code>plausibleAdapter</code> don't
	implement <code>query()</code>, so use their own dashboards instead.
</p>
<Try id="analytics-admin" title="bot.ts" />

<h2>flushing on shutdown</h2>
<p>
	buffered adapters (<code>clickhouseAdapter</code>, <code>httpAdapter</code>) hold events in
	memory between batches. <code>analytics()</code> wires <code>flush()</code> to
	<code>bot.onStop</code> <strong>automatically</strong> when installed on a <code>Bot</code> —
	<code>bot.stop()</code> won't resolve until the drain completes. on a bare <code>Composer</code>
	or a webhook/serverless deployment where <code>bot.onStop</code> never fires, call
	<code>.flush()</code> yourself.
</p>
<Code code={flush} title="shutdown.ts" />

<h2>a unified collection point</h2>
<p>
	plugins like <a href="/docs/plugins/broadcast/"><code>@yaebal/broadcast</code></a> already emit
	their own event stream (<code>onEvent</code>). build a standalone client with
	<code>createAnalytics()</code> and feed both <code>ctx.track</code> and other plugins' events
	into the same adapters with <code>fromEvent</code>.
</p>
<Code code={bridge} title="events.ts" />
<div class="note">
	<code>events</code>/<code>context</code>/<code>autoTrack</code> only apply when
	<code>analytics()</code> builds its own client from an <code>AnalyticsOptions</code> config — a
	shared client passed in already has its own (or no) catalog, and has no <code>ctx</code> for
	<code>context</code>/<code>autoTrack</code> to hook into.
</div>

<h2>api</h2>
<table>
	<thead>
		<tr><th>export</th><th>signature</th><th>description</th></tr>
	</thead>
	<tbody>
		<tr>
			<td><code>analytics</code></td>
			<td><code>(source: AnalyticsOptions | Analytics) =&gt; AnalyticsPlugin</code></td>
			<td>installs <code>ctx.track</code>/<code>ctx.identify</code>; the returned function also carries <code>.flush()</code></td>
		</tr>
		<tr>
			<td><code>createAnalytics</code></td>
			<td><code>(options: AnalyticsOptions) =&gt; Analytics</code></td>
			<td>standalone collection point, independent of any bot or <code>ctx</code></td>
		</tr>
		<tr>
			<td><code>analyticsAdmin</code></td>
			<td><code>(options: AnalyticsAdminOptions) =&gt; (composer) =&gt; composer</code></td>
			<td>telegram-native <code>/analytics</code> reports, gated by <code>isAdmin</code></td>
		</tr>
		<tr>
			<td><code>fromEvent</code></td>
			<td><code>(prefix, event: {'{ type: string }'}) =&gt; TrackInput</code></td>
			<td>shapes a foreign <code>{'{ type }'}</code> event stream into a trackable input</td>
		</tr>
		<tr>
			<td><code>p</code></td>
			<td><code>{'{ string, number, boolean, optional, object }'}</code></td>
			<td>tiny runtime validator for a catalog entry's <code>props</code> schema</td>
		</tr>
		<tr>
			<td><code>batched</code></td>
			<td><code>(send, options) =&gt; Batched</code></td>
			<td>the batch/retry/backpressure primitive <code>clickhouseAdapter</code>/<code>httpAdapter</code> share</td>
		</tr>
		<tr><td><code>postHogAdapter</code></td><td><code>(client, options?) =&gt; AnalyticsAdapter</code></td><td>forwards events to a <code>posthog-node</code>-shaped client</td></tr>
		<tr><td><code>plausibleAdapter</code></td><td><code>(options) =&gt; AnalyticsAdapter</code></td><td>posts to plausible's events api</td></tr>
		<tr><td><code>sqliteAdapter</code></td><td><code>(db, options?) =&gt; AnalyticsAdapter</code></td><td>appends events as rows to sqlite; <code>sqliteSchema()</code> exports the DDL</td></tr>
		<tr><td><code>clickhouseAdapter</code></td><td><code>(client, options?) =&gt; AnalyticsAdapter</code></td><td>buffers and batch-inserts into clickhouse; <code>clickhouseSchema()</code> exports the DDL</td></tr>
		<tr><td><code>httpAdapter</code></td><td><code>(url, options?) =&gt; AnalyticsAdapter</code></td><td>POSTs batches of events as JSON to any collector</td></tr>
		<tr><td><code>memoryAdapter</code></td><td><code>() =&gt; MemoryAdapter</code></td><td>in-memory sink with <code>events</code>/<code>identities</code>/<code>query()</code>/<code>clear()</code></td></tr>
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
			<td>fire-and-forget event, tagged with the current <code>userId</code>/<code>chatId</code>; name/properties checked against the catalog when one was given</td>
		</tr>
		<tr>
			<td><code>identify(properties)</code></td>
			<td><code>void</code></td>
			<td>person-level properties for the current update's user; no-op without a <code>ctx.from</code></td>
		</tr>
	</tbody>
</table>

<h3>AnalyticsOptions</h3>
<table>
	<thead>
		<tr><th>field</th><th>type</th><th>default</th><th>description</th></tr>
	</thead>
	<tbody>
		<tr><td><code>events</code></td><td><code>EventsCatalog</code></td><td>—</td><td>event names + property schemas; omit for a fully untyped <code>ctx.track</code></td></tr>
		<tr><td><code>adapters</code></td><td><code>AnalyticsAdapter[]</code></td><td>—</td><td>every configured sink</td></tr>
		<tr><td><code>onError</code></td><td><code>(error, event) =&gt; unknown</code></td><td>—</td><td>observe adapter/validation failures without breaking tracking</td></tr>
		<tr><td><code>now</code></td><td><code>() =&gt; number</code></td><td><code>Date.now</code></td><td>clock override, mainly for tests</td></tr>
		<tr><td><code>sample</code></td><td><code>number</code></td><td><code>1</code></td><td>fraction of calls that reach adapters (load-shedding, not a stable rollout)</td></tr>
		<tr><td><code>shouldTrack</code></td><td><code>(event) =&gt; MaybePromise&lt;boolean&gt;</code></td><td>—</td><td>consent/opt-out gate; fails open</td></tr>
		<tr><td><code>anonymize</code></td><td><code>"hash" | (id, kind) =&gt; string | number</code></td><td>—</td><td>replace <code>userId</code>/<code>chatId</code> before adapters see them</td></tr>
		<tr><td><code>redact</code></td><td><code>string[]</code></td><td>—</td><td>property keys stripped from every event</td></tr>
		<tr><td><code>context</code></td><td><code>(ctx) =&gt; MaybePromise&lt;object&gt;</code></td><td>—</td><td>extra properties merged onto every <code>ctx.track</code> call</td></tr>
		<tr><td><code>autoTrack</code></td><td><code>AutoTrackKind[]</code></td><td>—</td><td><code>"commands" | "callback_queries" | "messages"</code></td></tr>
	</tbody>
</table>

<h2>testing</h2>
<p>
	<code>memoryAdapter()</code> replaces hand-rolling a
	<code>{'{ track: (e) => events.push(e) }'}</code> fake in every test. drive the bot with
	<a href="/docs/plugins/test/"><code>@yaebal/test</code></a> as usual.
</p>
<Code code={testing} title="analytics.test.ts" />

<div class="note">
	<strong>pairs with broadcast.</strong> <code>@yaebal/broadcast</code>'s <code>onEvent</code> and
	<code>ctx.track</code> can both feed the same <code>Analytics</code> client — see
	<a href="/docs/plugins/broadcast/"><code>@yaebal/broadcast</code></a> and the bridge example
	above.
</div>
