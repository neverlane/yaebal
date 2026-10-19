<script lang="ts">
	import Code from "$lib/Code.svelte";

	const install = `pnpm add @yaebal/otel @opentelemetry/api`;

	const usage = `import { NodeSDK } from "@opentelemetry/sdk-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { Bot } from "@yaebal/core";
import { otel } from "@yaebal/otel";

// the sdk registers the async context manager that links child spans to their update
new NodeSDK({ serviceName: "my-bot", traceExporter: new OTLPTraceExporter() }).start();

// install first, so the update span wraps every other plugin
const bot = new Bot(process.env.BOT_TOKEN!).install(otel());

bot.command("report", async (ctx) => {
  const rows = await ctx.otel.record("db.query", () => db.report()); // a child span
  ctx.otel.setAttributes({ "report.rows": rows.length });
  await ctx.send(render(rows)); // telegram.api/sendMessage, a child of the update
});

await bot.start();`;

	const tree = `telegram.update/message          CONSUMER  update_id, update_type, chat.id, chat.type, user.id
├── db.query                     INTERNAL  (ctx.otel.record)
└── telegram.api/sendMessage     CLIENT    method, chat.id, error_code on failure`;

	const options = `bot.install(
  otel({
    tracer: trace.getTracer("my-bot"),          // default: the global provider's "@yaebal/otel"
    recordApiParams: true,                      // params as a json attribute — off by default
    attributes: (ctx) => ({ "tenant.id": tenantOf(ctx) }),
  }),
);`;

	const bare = `import { createApi } from "@yaebal/core";
import { instrumentApi } from "@yaebal/otel";

// a client without a bot — e.g. a broadcast worker
const api = instrumentApi(createApi(process.env.BOT_TOKEN!));`;
</script>

<svelte:head>
	<title>@yaebal/otel — yaebal</title>
</svelte:head>

<h1>@yaebal/otel</h1>
<p class="lead">
	opentelemetry tracing: every update becomes a span, every bot api call made while handling it a
	child span — so a slow handler, a flood wait or a failing method is one trace away in jaeger,
	grafana tempo, honeycomb, axiom or any other otel backend.
</p>

<h2>install</h2>
<Code code={install} title="terminal" lang="sh" />
<p>
	the only dependency is <code>@opentelemetry/api</code> — bring your own sdk and exporter, the
	same ones the rest of your services use.
</p>

<h2>usage</h2>
<Code code={usage} title="bot.ts" />
<p>a trace for one update:</p>
<Code code={tree} title="trace" lang="text" />

<h2>what lands on ctx</h2>
<table>
	<thead><tr><th>field</th><th>does</th></tr></thead>
	<tbody>
		<tr><td><code>ctx.otel.span</code></td><td>the update's span</td></tr>
		<tr><td><code>ctx.otel.record(name, fn)</code></td><td>runs <code>fn</code> in a child span — ended for you, marked failed if it throws</td></tr>
		<tr><td><code>ctx.otel.setAttributes(attrs)</code></td><td>adds attributes to the update span</td></tr>
	</tbody>
</table>

<h2>options</h2>
<Code code={options} title="bot.ts" />
<table>
	<thead><tr><th>option</th><th>default</th><th>does</th></tr></thead>
	<tbody>
		<tr><td><code>tracer</code></td><td><code>trace.getTracer("@yaebal/otel")</code></td><td>the tracer to record with</td></tr>
		<tr><td><code>recordApiParams</code></td><td><code>false</code></td><td>attach each call's params as <code>telegram.params</code> — json, uploads named instead of inlined, cut at 4096 chars. off by default because params carry user text</td></tr>
		<tr><td><code>attributes</code></td><td>—</td><td><code>(ctx) =&gt; Attributes</code> added to every update span</td></tr>
	</tbody>
</table>

<h2>behavior</h2>
<ul>
	<li>
		a handler that throws marks the update span <code>ERROR</code> with the exception recorded,
		then rethrows to <code>bot.onError</code> as usual. a failed api call does the same on its
		own span, plus <code>telegram.error_code</code>; each retry attempt (with
		<a href="/docs/plugins/again/"><code>@yaebal/again</code></a>) is its own span.
	</li>
	<li>the bot token never reaches a span — only method names and, opt-in, params.</li>
	<li>
		without an async context manager (no sdk registered) api spans still record, but as roots
		instead of children of their update.
	</li>
</ul>

<h2>without a bot</h2>
<Code code={bare} title="worker.ts" />

<h2>related</h2>
<ul>
	<li><a href="/docs/plugins/audit-log/">@yaebal/audit-log</a> — structured logs of every update and api call</li>
	<li><a href="/docs/plugins/analytics/">@yaebal/analytics</a> — product events, not traces</li>
	<li><a href="/docs/troubleshooting/">troubleshooting</a> — <code>YAEBAL_DEBUG</code> for quick local inspection</li>
</ul>
