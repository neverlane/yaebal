<script lang="ts">
	import Code from "$lib/Code.svelte";
	import Try from "$lib/Try.svelte";

	const install = `pnpm add @yaebal/audit-log`;

	const options = `import { auditLog, textFormatter } from "@yaebal/audit-log";

bot.install(
  auditLog({
    formatter: textFormatter, // default is jsonFormatter (structured, sink-friendly)
    filter: (event) => event.kind !== "api.result", // drop the noisiest kind entirely
    sample: (event) => (event.kind === "api.error" ? 1 : 0.1), // keep every error, sample the rest
    onSinkError: (error, event) => console.error("audit sink failed", error, event),
  }),
);`;

	const sinks = `import type { AuditSink } from "@yaebal/audit-log";
import { auditLog, consoleSink } from "@yaebal/audit-log";

function sqliteSink(db: SqliteLike): AuditSink {
  const insert = db.prepare("INSERT INTO audit_log (kind, method, at) VALUES (?, ?, ?)");
  return {
    write(_entry, event) {
      insert.run(event.kind, "method" in event ? event.method : event.updateType, event.timestamp);
    },
  };
}

bot.install(auditLog({ sinks: [sqliteSink(db), consoleSink()] }));`;

	const flush = `const audit = auditLog({ sinks: [sqliteSink(db)] });
bot.install(audit);
bot.onStop(() => audit.flush()); // drains any buffered sink before shutdown`;

	const direct = `import { auditLog } from "@yaebal/audit-log";

// skip .install() — wire hooks straight onto a { use, api } pair
auditLog(bot, { sinks: [consoleSink()] });`;

	const testing = `import { createTestEnv } from "@yaebal/test";
import { auditLog } from "@yaebal/audit-log";

const bot = new Composer<Context>();
const env = createTestEnv(bot);

// createTestEnv routes outgoing calls through env.api, not a real bot.api — hook onto that
auditLog({ use: (...mw) => bot.use(...mw), api: env.api }, { sinks: [mySink] });

bot.on("message", (ctx) => ctx.reply("hi"));
await env.createUser().sendMessage("hello");
// mySink saw an "update" event and matching "api.call" / "api.result" events`;
</script>

<svelte:head>
	<title>@yaebal/audit-log - yaebal</title>
</svelte:head>

<h1>@yaebal/audit-log</h1>
<p class="lead">
	structured logging for production monitoring: every incoming update and every outgoing api call
	is turned into an <code>AuditEvent</code> and handed to configurable sinks, with filters and
	sampling to keep volume under control. observation-only — nothing on <code>ctx</code> changes.
</p>

<h2>install</h2>
<Code code={install} title="terminal" lang="sh" />

<h2>usage</h2>
<p>
	install <code>auditLog()</code> with <code>bot.install()</code>. by default it logs every
	incoming update (via middleware) and every outgoing api call — its params, its result, and any
	error — as structured JSON printed to <code>console.log</code>.
</p>
<Try id="audit-log-basic" title="bot.ts" />

<h2>event kinds</h2>
<p>four kinds of <code>AuditEvent</code>, one per hook it taps:</p>
<table>
	<thead>
		<tr><th>kind</th><th>hook</th><th>fields</th></tr>
	</thead>
	<tbody>
		<tr>
			<td><code>"update"</code></td>
			<td><code>bot.use</code> middleware</td>
			<td><code>updateType</code>, <code>chatId?</code>, <code>userId?</code>, <code>durationMs</code>, <code>error?</code>, <code>update</code></td>
		</tr>
		<tr>
			<td><code>"api.call"</code></td>
			<td><code>api.before</code></td>
			<td><code>method</code>, <code>params</code></td>
		</tr>
		<tr>
			<td><code>"api.result"</code></td>
			<td><code>api.after</code></td>
			<td><code>method</code>, <code>params</code>, <code>result</code></td>
		</tr>
		<tr>
			<td><code>"api.error"</code></td>
			<td><code>api.onError</code></td>
			<td><code>method</code>, <code>params</code>, <code>error</code>, <code>attempt</code></td>
		</tr>
	</tbody>
</table>
<div class="note">
	a handler that throws still gets its <code>"update"</code> event logged — with
	<code>error</code> set — and the error still propagates to your normal error handling; audit
	logging never swallows it. <code>getUpdates</code> is excluded from <code>api.*</code> logging
	by default (<code>DEFAULT_EXCLUDED_METHODS</code>) since it fires every poll tick.
</div>

<h2>formatters, filters, sampling</h2>
<p>
	<code>formatter</code> shapes an event before it reaches a sink — <code>jsonFormatter</code>
	(default) passes the event through as-is for sinks that want structured fields;
	<code>textFormatter</code> renders one human-readable line. <code>filter</code> drops events
	outright; <code>sample</code> keeps only a fraction — a flat number or a per-event function, so
	you can keep every error while sampling routine calls.
</p>
<Code code={options} title="audit.ts" />

<h2>sinks</h2>
<p>
	a sink is <code>{'{ write(entry, event), flush?() }'}</code>. <code>entry</code> is whatever
	<code>formatter</code> returned; <code>event</code> is the raw <code>AuditEvent</code>, for
	sinks that want structured fields regardless of formatting (a db row, a metrics counter).
	<code>consoleSink()</code> is the default. a sink that throws or rejects never breaks request
	handling — observe failures via <code>onSinkError</code>.
</p>
<Code code={sinks} title="sqlite-sink.ts" />

<h2>flushing buffered sinks</h2>
<p>
	a sink that buffers writes needs a flush before shutdown. <code>auditLog()</code> returns the
	plugin function with a <code>.flush()</code> attached — wire it to <code>bot.onStop</code>, the
	same pattern as <a href="/docs/plugins/analytics/"><code>@yaebal/analytics</code></a>'s adapter
	flush.
</p>
<Code code={flush} title="shutdown.ts" />

<h2>direct install</h2>
<p>
	skip <code>.install()</code> and wire hooks straight onto any <code>{'{ use, api }'}</code>
	pair — a real <code>Bot</code>, or a hand-built stand-in.
</p>
<Code code={direct} title="direct.ts" />

<h2>api</h2>
<table>
	<thead>
		<tr><th>export</th><th>signature</th><th>description</th></tr>
	</thead>
	<tbody>
		<tr>
			<td><code>auditLog</code></td>
			<td><code>(options?) =&gt; AuditLogPlugin</code></td>
			<td>the plugin form — install with <code>bot.install()</code>; the returned function carries <code>.flush()</code></td>
		</tr>
		<tr>
			<td><code>auditLog</code></td>
			<td><code>(target: {'{ use, api }'}, options?) =&gt; AuditLogHandle</code></td>
			<td>direct-install overload — no <code>.install()</code> needed</td>
		</tr>
		<tr>
			<td><code>createAuditLogger</code></td>
			<td><code>(options?) =&gt; AuditLogger</code></td>
			<td>standalone <code>log(event)</code> / <code>flush()</code> collection point, independent of any bot</td>
		</tr>
		<tr><td><code>jsonFormatter</code></td><td><code>(event) =&gt; AuditEvent</code></td><td>default formatter — passes the event through unchanged</td></tr>
		<tr><td><code>textFormatter</code></td><td><code>(event) =&gt; string</code></td><td>one human-readable line per event</td></tr>
		<tr><td><code>consoleSink</code></td><td><code>() =&gt; AuditSink</code></td><td>default sink — prints formatted entries via <code>console.log</code></td></tr>
		<tr><td><code>DEFAULT_EXCLUDED_METHODS</code></td><td><code>readonly string[]</code></td><td><code>["getUpdates"]</code></td></tr>
	</tbody>
</table>

<h3>AuditLogOptions</h3>
<table>
	<thead>
		<tr><th>field</th><th>type</th><th>default</th><th>description</th></tr>
	</thead>
	<tbody>
		<tr><td><code>sinks</code></td><td><code>AuditSink | AuditSink[]</code></td><td><code>[consoleSink()]</code></td><td>where formatted entries go</td></tr>
		<tr><td><code>formatter</code></td><td><code>AuditFormatter</code></td><td><code>jsonFormatter</code></td><td>shape events before they reach a sink</td></tr>
		<tr><td><code>filter</code></td><td><code>(event) =&gt; boolean</code></td><td>—</td><td>drop events outright, before sampling</td></tr>
		<tr><td><code>sample</code></td><td><code>number | (event) =&gt; number</code></td><td>—</td><td>fraction of matching events actually written, <code>0</code>–<code>1</code></td></tr>
		<tr><td><code>logUpdates</code></td><td><code>boolean</code></td><td><code>true</code></td><td>log incoming updates via middleware</td></tr>
		<tr><td><code>logApiCalls</code></td><td><code>boolean</code></td><td><code>true</code></td><td>log outgoing calls via <code>api.before</code></td></tr>
		<tr><td><code>logApiResults</code></td><td><code>boolean</code></td><td><code>true</code></td><td>log successful outgoing calls via <code>api.after</code></td></tr>
		<tr><td><code>logApiErrors</code></td><td><code>boolean</code></td><td><code>true</code></td><td>log failed outgoing calls via <code>api.onError</code></td></tr>
		<tr><td><code>excludedMethods</code></td><td><code>readonly string[]</code></td><td><code>DEFAULT_EXCLUDED_METHODS</code></td><td>api methods excluded from <code>api.*</code> logging</td></tr>
		<tr><td><code>onSinkError</code></td><td><code>(error, event) =&gt; unknown</code></td><td>—</td><td>observe a sink that threw or rejected</td></tr>
		<tr><td><code>now</code></td><td><code>() =&gt; number</code></td><td><code>Date.now</code></td><td>clock override, mainly for tests</td></tr>
		<tr><td><code>random</code></td><td><code>() =&gt; number</code></td><td><code>Math.random</code></td><td>RNG override for <code>sample</code>, mainly for tests</td></tr>
	</tbody>
</table>

<h2>testing</h2>
<p>
	<code>createTestEnv</code> dispatches updates through your bot but routes outgoing calls through
	its own mock <code>env.api</code> — never a real <code>Bot.api</code>. use the direct-install
	overload and hook onto <code>env.api</code> instead of <code>bot.install()</code>.
</p>
<Code code={testing} title="audit-log.test.ts" />

<div class="note">
	<strong>pairs with analytics.</strong> <a href="/docs/plugins/analytics/"><code>@yaebal/analytics</code></a>
	tracks product events (<code>ctx.track</code>) for funnels and dashboards; <code>audit-log</code>
	is the lower-level trace of every update and every telegram api call — reach for it when you
	need to debug a specific incident or feed a log aggregator, not to build product metrics.
</div>
