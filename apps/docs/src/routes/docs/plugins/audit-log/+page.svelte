<script lang="ts">
	import Code from "$lib/Code.svelte";
	import Try from "$lib/Try.svelte";

	const install = `pnpm add @yaebal/audit-log`;

	const redact = `import { auditLog } from "@yaebal/audit-log";

bot.install(
  auditLog({
    redact: {
      // paths are masked regardless of key name — for hiding message content itself,
      // not just known secrets (secret_token, phone_number, ... are masked by default,
      // wherever they occur, with no config at all).
      paths: ["update.message.text", "params.text"],
      maxStringLength: 500, // default 2000; 0 disables truncation
      stripBinary: true, // default — media buffers become "[binary N bytes]"
    },
  }),
);

// redact: false turns masking off outright — not recommended for anything that ships logs
// off-box.`;

	const options = `import { auditLog, textFormatter } from "@yaebal/audit-log";

bot.install(
  auditLog({
    formatter: textFormatter, // default is jsonFormatter (structured, sink-friendly)
    filter: (event) => event.kind !== "api.result", // drop the noisiest kind entirely
    sample: (event) => (event.kind === "api.error" ? 1 : 0.1), // keep every error, sample the rest
    onError: (error, event, stage) => console.error(\`audit \${stage} failed\`, error, event),
  }),
);`;

	const sampleKey = `import { auditLog, byChatId } from "@yaebal/audit-log";

// deterministic sampling: an entire chat's trace is kept or dropped together, instead of
// a random per-event coin-flip cutting a trace mid-update.
bot.install(auditLog({ sample: 0.1, sampleKey: byChatId }));`;

	const sinks = `import type { AuditSink } from "@yaebal/audit-log";
import { auditLog, consoleSink, fileSink, memorySink } from "@yaebal/audit-log";

function sqliteSink(db: SqliteLike): AuditSink {
  const insert = db.prepare("INSERT INTO audit_log (kind, method, at) VALUES (?, ?, ?)");
  return {
    write(_entry, event) {
      insert.run(event.kind, "method" in event ? event.method : event.updateType, event.timestamp);
    },
  };
}

bot.install(
  auditLog({
    sinks: [
      sqliteSink(db),
      fileSink("./logs/audit.jsonl"), // rotates at 10MB by default
      memorySink({ limit: 500 }), // a ring buffer — pair with a /status endpoint
      consoleSink(),
    ],
  }),
);`;

	const chat = `import { auditLog, chatSink } from "@yaebal/audit-log";

bot.install(
  auditLog({
    sinks: [
      consoleSink(),
      // ships errors straight into an admin chat via the bot's own sendMessage — no
      // separate log aggregator needed to get paged. deduped and rate-limited; never
      // loops on its own traffic even under a permissive minLevel.
      chatSink(bot, { chatId: process.env.ADMIN_CHAT_ID!, minLevel: "error" }),
    ],
  }),
);`;

	const admin = `import { auditAdmin, auditLog } from "@yaebal/audit-log";

const audit = auditLog();
bot.install(audit);
bot.install(auditAdmin({ logger: audit, isAdmin: (ctx) => ctx.from?.id === OWNER_ID }));

// /audit        -> received/written/filtered/sampled counts + a per-stage error breakdown
// /audit flush  -> force audit.flush() now, and confirm`;

	const flush = `const audit = auditLog({ sinks: [sqliteSink(db)] });
bot.install(audit);

// autoFlush (default true) already does this on bot.onStop() for a real Bot — this is
// only for a target that doesn't expose onStop (a hand-built { use, api } pair, or
// autoFlush: false).
bot.onStop(() => audit.flush());`;

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
// mySink saw an "update" event and matching "api.call" / "api.result" events, correlated
// by a shared correlationId`;
</script>

<svelte:head>
	<title>@yaebal/audit-log - yaebal</title>
</svelte:head>

<h1>@yaebal/audit-log</h1>
<p class="lead">
	structured logging for production monitoring: every incoming update and every outgoing api call
	is turned into an <code>AuditEvent</code>, correlated back to the update that triggered it,
	masked of known secrets by default, then handed to configurable sinks — with filters and
	sampling to keep volume under control. observation-only — nothing on <code>ctx</code> changes.
</p>

<h2>install</h2>
<Code code={install} title="terminal" lang="sh" />

<h2>usage</h2>
<p>
	install <code>auditLog()</code> with <code>bot.install()</code>. by default it logs every
	incoming update (via middleware) and every outgoing api call — its params, its result, and any
	error — as structured, redacted JSON printed to <code>console.log</code>.
</p>
<Try id="audit-log-basic" title="bot.ts" />

<h2>event kinds</h2>
<p>six kinds of <code>AuditEvent</code>:</p>
<table>
	<thead>
		<tr><th>kind</th><th>hook</th><th>fields</th></tr>
	</thead>
	<tbody>
		<tr>
			<td><code>"update"</code></td>
			<td><code>bot.use</code> middleware</td>
			<td><code>updateId</code>, <code>correlationId</code>, <code>updateType</code>, <code>chatId?</code>, <code>userId?</code>, <code>durationMs</code>, <code>error?</code>, <code>update</code></td>
		</tr>
		<tr>
			<td><code>"api.call"</code></td>
			<td><code>api.before</code></td>
			<td><code>callId</code>, <code>method</code>, <code>params</code>, <code>attempt</code>, <code>updateId?</code>, <code>correlationId?</code></td>
		</tr>
		<tr>
			<td><code>"api.result"</code></td>
			<td><code>api.after</code></td>
			<td><code>callId</code>, <code>method</code>, <code>params</code>, <code>result</code>, <code>durationMs?</code>, <code>updateId?</code>, <code>correlationId?</code></td>
		</tr>
		<tr>
			<td><code>"api.error"</code></td>
			<td><code>api.onError</code></td>
			<td><code>callId</code>, <code>method</code>, <code>params</code>, <code>error</code>, <code>attempt</code>, <code>durationMs?</code>, <code>updateId?</code>, <code>correlationId?</code></td>
		</tr>
		<tr>
			<td><code>"bot.start"</code></td>
			<td><code>bot.onStart</code></td>
			<td><code>info</code></td>
		</tr>
		<tr>
			<td><code>"bot.stop"</code></td>
			<td><code>bot.onStop</code></td>
			<td>—</td>
		</tr>
	</tbody>
</table>
<p>
	every event also carries a <code>level</code> (<code>"info"</code> | <code>"warn"</code> |
	<code>"error"</code>), used by <a href="#telegram-native"><code>chatSink</code></a> to decide
	what's worth paging on.
</p>
<div class="note">
	a handler that throws still gets its <code>"update"</code> event logged — with
	<code>error</code> set to a plain, JSON-safe <code>SerializedError</code> (a bare
	<code>Error</code> stringifies to <code>"{'{}'}"</code> — this never does) — and the error still
	propagates to your normal error handling; audit logging never swallows it.
	<code>getUpdates</code> is excluded from <code>api.*</code> logging by default
	(<code>DEFAULT_EXCLUDED_METHODS</code>) since it fires every poll tick.
</div>

<h2>correlation</h2>
<p>
	every <code>api.*</code> event fired while an update is being handled carries that update's
	<code>updateId</code> and <code>correlationId</code> (plus <code>chatId</code>/<code>userId</code>
	when known) — filter a log by one <code>correlationId</code> to see the update and every api call
	it made, in order: a trace, not just a stream. built on <code>node:async_hooks</code>, wired
	automatically by <code>bot.install(auditLog())</code>; a call made outside update handling (a cron
	job, <code>bot.onStart</code>) carries no correlation. degrades gracefully — never throws — on a
	runtime without <code>AsyncLocalStorage</code>; set <code>correlate: false</code> to turn it off
	outright. <code>api.call</code> also carries a <code>callId</code> stable across retries (e.g. via
	<a href="/docs/plugins/again/"><code>@yaebal/again</code></a>) and an <code>attempt</code> number,
	and <code>api.result</code>/<code>api.error</code> carry the call's total <code>durationMs</code>.
</p>

<h2 id="redaction">security &amp; redaction</h2>
<p>
	<strong>redacted by default.</strong> before anything reaches a sink, every event is masked: known
	secret keys (<code>secret_token</code>, <code>token</code>, <code>phone_number</code>, …) are
	replaced wherever they occur, at any depth, in <code>update</code>/<code>params</code>/
	<code>result</code>; long strings are truncated; media buffers (<code>sendPhoto</code>'s
	<code>Uint8Array</code>, …) become a <code>"[binary N bytes]"</code> placeholder instead of raw
	bytes in your logs. message text itself is <em>not</em> masked by default — audit logging needs it
	— but hiding it is one <code>paths</code> entry away.
</p>
<Code code={redact} title="audit.ts" />
<div class="note">
	an unknown/non-plain value (a class instance, a function, a stream) never crashes redaction — it
	degrades to a safe <code>"[object X]"</code> placeholder instead of throwing or attempting to
	clone something that might not tolerate it.
</div>

<h2>formatters, filters, sampling</h2>
<p>
	<code>formatter</code> shapes an event before it reaches a sink — <code>jsonFormatter</code>
	(default) passes the (already redacted) event through as-is for sinks that want structured
	fields; <code>textFormatter</code> renders one human-readable line, including the correlation
	trace and the telegram error code a bare <code>Error.message</code> would drop.
	<code>filter</code> drops events outright, before sampling or redaction; <code>sample</code> keeps
	only a fraction — a flat number or a per-event function, so you can keep every error while
	sampling routine calls.
</p>
<Code code={options} title="audit.ts" />
<p>
	<code>sampleKey</code> makes sampling deterministic instead of per-event random — events that
	share a key (e.g. a chat) are kept or dropped together, so a trace never gets cut mid-update.
	<code>byChatId</code> is a ready-made key for the common case.
</p>
<Code code={sampleKey} title="audit.ts" />
<div class="note">
	every stage — <code>filter</code>, <code>sample</code>, redaction, <code>formatter</code>, and
	each sink's <code>write</code>/<code>flush</code> — is isolated: a stage that throws or rejects is
	reported via <code>onError</code> and drops just that one event (or, for <code>flush</code>, just
	that one sink) — never the request the event came from.
</div>

<h2>sinks</h2>
<p>
	a sink is <code>{'{ write(entry, event), flush?() }'}</code>. <code>entry</code> is whatever
	<code>formatter</code> returned; <code>event</code> is the redacted <code>AuditEvent</code>, for
	sinks that want structured fields regardless of formatting (a db row, a metrics counter) —
	still masked, even if they bypass <code>entry</code>. built in, beyond <code>consoleSink()</code>
	(the default): <code>memorySink()</code> (a bounded ring buffer, handy for a <code>/status</code>
	endpoint or tests), <code>fileSink()</code> (JSONL, size-based rotation, serialized writes) and
	<code>batchSink(inner, opts)</code> (buffer-and-flush wrapper for a sink billed per call, not per
	row).
</p>
<Code code={sinks} title="sinks.ts" />

<h2 id="telegram-native">telegram-native: chatSink &amp; auditAdmin</h2>
<p>
	<code>chatSink</code> ships events straight into an admin chat via the bot's own
	<code>sendMessage</code> — no separate log aggregator to stand up just to get paged when
	something breaks. gated to <code>minLevel</code> (default: errors only), deduped by event
	signature, and rate-limited, so a failure storm sends one alert, not one message per occurrence —
	and it never loops on its own traffic, even under a permissive <code>minLevel</code>.
</p>
<Code code={chat} title="bot.ts" />
<p>
	<code>auditAdmin</code> is a telegram-native ops surface for the running counters
	<code>auditLog()</code> tracks — no dashboard or metrics scrape needed to ask "is the audit
	pipeline healthy" from a chat. isolated via <code>Composer.filter</code> (the same pattern
	<a href="/docs/plugins/feature-flags/"><code>flagsAdmin</code></a> uses), not <code>guard</code> —
	a rejected <code>isAdmin</code> check continues the outer chain instead of halting it.
</p>
<Code code={admin} title="bot.ts" />

<h2>flushing &amp; lifecycle</h2>
<p>
	a sink that buffers writes needs a flush before shutdown. with a real <code>Bot</code>,
	<code>auditLog()</code> wires this up automatically — <code>autoFlush</code> (default
	<code>true</code>) calls <code>.flush()</code> on <code>bot.onStop()</code>, and
	<code>"bot.start"</code>/<code>"bot.stop"</code> events are logged the same way
	(<code>logLifecycle</code>, default <code>true</code>). both are feature-detected: a target with
	no <code>onStart</code>/<code>onStop</code> (a hand-built <code>{'{ use, api }'}</code> pair)
	simply skips them.
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
			<td>the plugin form — install with <code>bot.install()</code>; the returned function carries <code>.flush()</code> and <code>.stats()</code></td>
		</tr>
		<tr>
			<td><code>auditLog</code></td>
			<td><code>(target: {'{ use, api }'}, options?) =&gt; AuditLogHandle</code></td>
			<td>direct-install overload — no <code>.install()</code> needed</td>
		</tr>
		<tr>
			<td><code>createAuditLogger</code></td>
			<td><code>(options?) =&gt; AuditLogger</code></td>
			<td>standalone <code>log(event)</code> / <code>flush()</code> / <code>stats()</code>, independent of any bot</td>
		</tr>
		<tr><td><code>auditAdmin</code></td><td><code>(options) =&gt; Plugin</code></td><td>telegram-native <code>/audit</code> ops command</td></tr>
		<tr><td><code>jsonFormatter</code></td><td><code>(event) =&gt; AuditEvent</code></td><td>default formatter — passes the (redacted) event through unchanged</td></tr>
		<tr><td><code>textFormatter</code></td><td><code>(event) =&gt; string</code></td><td>one human-readable line per event, including the correlation trace</td></tr>
		<tr><td><code>prettyFormatter</code></td><td><code>(event) =&gt; string</code></td><td>indented multi-line JSON</td></tr>
		<tr><td><code>consoleSink</code></td><td><code>() =&gt; AuditSink</code></td><td>default sink — prints formatted entries via <code>console.log</code></td></tr>
		<tr><td><code>memorySink</code></td><td><code>(options?) =&gt; MemorySink</code></td><td>bounded in-process ring buffer</td></tr>
		<tr><td><code>fileSink</code></td><td><code>(path, options?) =&gt; AuditSink</code></td><td>JSONL to disk, size-based rotation</td></tr>
		<tr><td><code>batchSink</code></td><td><code>(inner, options?) =&gt; AuditSink</code></td><td>buffer-and-flush wrapper around another sink</td></tr>
		<tr><td><code>chatSink</code></td><td><code>(target, options) =&gt; AuditSink</code></td><td>ships events into an admin chat via the bot</td></tr>
		<tr><td><code>applyRedaction</code></td><td><code>(value, options?) =&gt; value</code></td><td>the redaction pass, exported standalone</td></tr>
		<tr><td><code>serializeError</code></td><td><code>(error) =&gt; SerializedError</code></td><td>normalizes any thrown value into a json-safe shape</td></tr>
		<tr><td><code>byChatId</code></td><td><code>(event) =&gt; string | number | undefined</code></td><td>a ready-made <code>sampleKey</code></td></tr>
		<tr><td><code>DEFAULT_EXCLUDED_METHODS</code></td><td><code>readonly string[]</code></td><td><code>["getUpdates"]</code></td></tr>
		<tr><td><code>DEFAULT_SECRET_KEYS</code></td><td><code>readonly string[]</code></td><td>the default redaction denylist</td></tr>
	</tbody>
</table>

<h3>AuditLogOptions</h3>
<table>
	<thead>
		<tr><th>field</th><th>type</th><th>default</th><th>description</th></tr>
	</thead>
	<tbody>
		<tr><td><code>sinks</code></td><td><code>AuditSink | AuditSink[]</code></td><td><code>[consoleSink()]</code></td><td>where formatted entries go; an empty array throws at construction</td></tr>
		<tr><td><code>formatter</code></td><td><code>AuditFormatter</code></td><td><code>jsonFormatter</code></td><td>shape events before they reach a sink</td></tr>
		<tr><td><code>filter</code></td><td><code>(event) =&gt; boolean</code></td><td>—</td><td>drop events outright, before sampling</td></tr>
		<tr><td><code>sample</code></td><td><code>number | (event) =&gt; number</code></td><td>—</td><td>fraction of matching events actually written, <code>0</code>–<code>1</code></td></tr>
		<tr><td><code>sampleKey</code></td><td><code>(event) =&gt; string | number | undefined</code></td><td>—</td><td>make sampling deterministic (see <code>byChatId</code>)</td></tr>
		<tr><td><code>redact</code></td><td><code>RedactOptions | false</code></td><td>on, defaults below</td><td>mask secrets/text/binaries before a sink sees an event</td></tr>
		<tr><td><code>onError</code></td><td><code>(error, event, stage) =&gt; unknown</code></td><td>—</td><td>observe a pipeline stage that threw or rejected</td></tr>
		<tr><td><code>logUpdates</code></td><td><code>boolean</code></td><td><code>true</code></td><td>log incoming updates via middleware</td></tr>
		<tr><td><code>logApiCalls</code></td><td><code>boolean</code></td><td><code>true</code></td><td>log outgoing calls via <code>api.before</code></td></tr>
		<tr><td><code>logApiResults</code></td><td><code>boolean</code></td><td><code>true</code></td><td>log successful outgoing calls via <code>api.after</code></td></tr>
		<tr><td><code>logApiErrors</code></td><td><code>boolean</code></td><td><code>true</code></td><td>log failed outgoing calls via <code>api.onError</code></td></tr>
		<tr><td><code>logLifecycle</code></td><td><code>boolean</code></td><td><code>true</code></td><td>log <code>bot.start</code>/<code>bot.stop</code> when the target exposes them</td></tr>
		<tr><td><code>excludedMethods</code></td><td><code>readonly string[]</code></td><td><code>DEFAULT_EXCLUDED_METHODS</code></td><td>api methods excluded from <code>api.*</code> logging; trailing <code>*</code> matches by prefix</td></tr>
		<tr><td><code>includeMethods</code></td><td><code>readonly string[]</code></td><td>—</td><td>if set, only these methods (same prefix syntax) are logged</td></tr>
		<tr><td><code>correlate</code></td><td><code>boolean</code></td><td><code>true</code></td><td>correlate <code>api.*</code> events with the triggering update</td></tr>
		<tr><td><code>autoFlush</code></td><td><code>boolean</code></td><td><code>true</code></td><td>flush automatically on <code>bot.onStop()</code></td></tr>
		<tr><td><code>now</code></td><td><code>() =&gt; number</code></td><td><code>Date.now</code></td><td>clock override, mainly for tests</td></tr>
		<tr><td><code>random</code></td><td><code>() =&gt; number</code></td><td><code>Math.random</code></td><td>RNG override for <code>sample</code>, mainly for tests</td></tr>
	</tbody>
</table>

<h3>RedactOptions</h3>
<table>
	<thead>
		<tr><th>field</th><th>type</th><th>default</th><th>description</th></tr>
	</thead>
	<tbody>
		<tr><td><code>paths</code></td><td><code>string[]</code></td><td>—</td><td>dot-paths masked regardless of key name (<code>"*"</code> matches any key at that depth)</td></tr>
		<tr><td><code>secretKeys</code></td><td><code>string[]</code></td><td><code>DEFAULT_SECRET_KEYS</code></td><td>replaces the default denylist entirely</td></tr>
		<tr><td><code>maxStringLength</code></td><td><code>number</code></td><td><code>2000</code></td><td>truncate longer strings; <code>0</code> disables</td></tr>
		<tr><td><code>stripBinary</code></td><td><code>boolean</code></td><td><code>true</code></td><td>replace binary payloads with a byte-length placeholder</td></tr>
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
	is the lower-level, correlated trace of every update and every telegram api call — reach for it
	when you need to debug a specific incident or feed a log aggregator, not to build product metrics.
</div>
