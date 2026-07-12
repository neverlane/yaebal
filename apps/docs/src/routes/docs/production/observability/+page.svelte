<script lang="ts">
	import Code from "$lib/Code.svelte";

	const setup = `import { createBot } from "yaebal";

// stand-ins for whatever logger/metrics client you actually use (pino,
// winston, prom-client, OpenTelemetry, ...) — only the shape matters here.
interface Logger {
  info(fields: Record<string, unknown>, msg: string): void;
  warn(fields: Record<string, unknown>, msg: string): void;
  error(fields: Record<string, unknown>, msg: string): void;
}
interface Counter {
  add(value: number, labels?: Record<string, string>): void;
}
interface Histogram {
  record(value: number, labels?: Record<string, string>): void;
}

declare const logger: Logger;
declare const metrics: {
  apiStarted: Counter;
  apiOk: Counter;
  apiFailed: Counter;
  updateDuration: Histogram;
};

const bot = createBot(process.env.BOT_TOKEN!);`;

	const auditLogSnippet = `import { createBot } from "yaebal";
import { auditAdmin, auditLog } from "@yaebal/audit-log";

const ADMIN_ID = 12345;

// every incoming update and every outgoing api call becomes a correlated,
// redacted AuditEvent — no hand-rolled before/after/onError hooks needed.
const logging = auditLog();

export const bot = createBot(process.env.BOT_TOKEN!)
  .install(logging)
  .install(auditAdmin({ logger: logging, isAdmin: (ctx) => ctx.from?.id === ADMIN_ID }));
  // chat commands: /audit stats, /audit flush`;

	const timing = `import { createBot } from "yaebal";

declare const logger: { info(fields: Record<string, unknown>, msg: string): void };
declare const metrics: { updateDuration: { record(value: number, labels?: Record<string, string>): void } };

const bot = createBot(process.env.BOT_TOKEN!);

// update latency: wrap every update in raw middleware, registered first so it
// times everything chained after it.
bot.use(async (ctx, next) => {
  const start = performance.now();
  await next();
  const durationMs = performance.now() - start;

  metrics.updateDuration.record(durationMs, { updateType: ctx.updateType });
  logger.info({ updateType: ctx.updateType, durationMs }, "update handled");
});`;

	const hooks = `import { createBot, TelegramError } from "yaebal";

declare const logger: { error(fields: Record<string, unknown>, msg: string): void };
declare const metrics: {
  apiStarted: { add(value: number, labels?: Record<string, string>): void };
  apiOk: { add(value: number, labels?: Record<string, string>): void };
  apiFailed: { add(value: number, labels?: Record<string, string>): void };
};

const bot = createBot(process.env.BOT_TOKEN!);

bot.api.before((method, params) => {
  metrics.apiStarted.add(1, { method });
  return params;
});

bot.api.after((method, params, result) => {
  metrics.apiOk.add(1, { method });
  return result;
});

bot.api.onError((method, error, attempt) => {
  metrics.apiFailed.add(1, { method, attempt: String(attempt) });

  // ask the client to retry: 429s carry retry_after; back off and try again
  // instead of failing the update outright. this is what @yaebal/again wraps
  // as a reusable plugin — reach for that instead of hand-rolling it per bot.
  if (error instanceof TelegramError && attempt < 3) {
    const retryAfterMs = (error.parameters?.retry_after ?? 1) * 1000;
    return { retry: true, delayMs: retryAfterMs };
  }
});

bot.onError((error, ctx) => {
  logger.error({ error, updateId: ctx.update.update_id, updateType: ctx.updateType }, "handler failed");
});`;

	const queueHealth = `import { createBroadcast } from "@yaebal/broadcast";

declare const broadcasts: ReturnType<typeof createBroadcast>;
declare const metrics: { queueDepth: { record(value: number, labels?: Record<string, string>): void } };

setInterval(() => {
  const m = broadcasts.metrics; // BroadcastMetrics: active, queued, failed, skipped, nextWakeAt, ...
  metrics.queueDepth.record(m.queued, { state: "queued" });
  metrics.queueDepth.record(m.active, { state: "active" });
  metrics.queueDepth.record(m.failed, { state: "failed" });
}, 15_000);`;

	const health = `import { createServer } from "node:http";
import { createBot } from "yaebal";

const bot = createBot(process.env.BOT_TOKEN!);
let ready = false;

bot.onStart(() => {
  ready = true;
});

// separate from the webhook/polling path — a platform's liveness/readiness
// probe should never depend on Telegram being reachable.
const health = createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200).end("ok");
    return;
  }
  if (req.url === "/ready") {
    res.writeHead(ready ? 200 : 503).end(ready ? "ready" : "starting");
    return;
  }
  res.writeHead(404).end();
});

health.listen(9090);

process.once("SIGTERM", async () => {
  ready = false;
  await bot.stop();
  health.close();
});`;

	const redactFirstParty = `import { applyRedaction, DEFAULT_SECRET_KEYS } from "@yaebal/audit-log";

// masks DEFAULT_SECRET_KEYS (token, secret_token, provider_token, phone_number, ...)
// at any depth, truncates long strings, and replaces binary buffers — works on any
// object, not just api params, so it's useful even without the full auditLog() plugin.
function safeParams(params: Record<string, unknown> | undefined) {
  return applyRedaction(params, { secretKeys: [...DEFAULT_SECRET_KEYS, "file_id"] });
}`;

	const redact = `function safeParams(params: Record<string, unknown> | undefined) {
  if (!params) return undefined;
  const copy = { ...params };
  delete copy.token;
  delete copy.file;
  delete copy.photo;
  delete copy.document;
  return copy;
}`;
</script>

<svelte:head><title>observability — yaebal</title></svelte:head>

<h1>observability</h1>
<p class="lead">log enough to debug production without leaking telegram tokens or user data.</p>

<h2>what to collect</h2>
<table>
	<thead><tr><th>signal</th><th>fields</th></tr></thead>
	<tbody>
		<tr><td>update latency</td><td>update type, handler route, duration, success/failure</td></tr>
		<tr><td>api calls</td><td>method, duration, status, retry count, error code</td></tr>
		<tr><td>queue health</td><td>queued, active, failed, skipped, next wake</td></tr>
		<tr><td>webhook delivery</td><td>status, body size, secret mismatch count</td></tr>
		<tr><td>business events</td><td>command names, broadcast job ids, payment payloads without pii</td></tr>
	</tbody>
</table>
<Code code={setup} title="observability.ts" />

<h2>structured logs — the first-party way</h2>
<p>
	<a href="/docs/plugins/audit-log/">@yaebal/audit-log</a> wires the same
	<code>bot.use</code>/<code>bot.api.before</code>/<code>after</code>/<code>onError</code> hooks
	shown by hand below, but turns every update and every outgoing api call into a correlated,
	redacted <code>AuditEvent</code> automatically — no separate logger boilerplate, and secrets are
	masked by default instead of opt-in.
</p>
<Code code={auditLogSnippet} title="audit-log.ts" />
<p>
	don't install both this and the hand-rolled hooks below on the same bot — they'd double-log every
	call. reach for the manual pattern only when you need custom numeric metrics (counters,
	histograms) that a structured-log package doesn't produce on its own.
</p>

<h2>update latency</h2>
<p>
	raw middleware registered before everything else sees the whole chain, including plugins and the
	matched handler — it's the one place to time an update end-to-end.
</p>
<Code code={timing} title="timing.ts" />

<h2>api hooks (manual)</h2>
<p>
	<code>bot.api.onError</code> can do more than count failures: returning
	<code>{"{ retry: true, delayMs }"}</code> retries the same call. <code>TelegramError</code>
	carries <code>parameters.retry_after</code> straight from Telegram's 429 response.
	<a href="/docs/plugins/again/">@yaebal/again</a> wraps the retry itself (backoff, jitter, a retry
	budget) so most bots shouldn't hand-roll that part — write your own hook when you need custom
	metrics alongside it, like below.
</p>
<Code code={hooks} title="hooks.ts" />

<h2>queue health</h2>
<p>
	<a href="/docs/production/queues-broadcasts/">broadcast</a> clients expose live counters on
	<code>.metrics</code> — poll it on an interval and export whatever's queued, active or failing.
</p>
<Code code={queueHealth} title="queue-health.ts" />

<h2>health and readiness</h2>
<p>
	give your orchestrator (Kubernetes, ECS, a load balancer) a liveness/readiness path that doesn't
	depend on Telegram being reachable — a Telegram outage shouldn't make your platform kill and
	restart a bot that's otherwise fine.
</p>
<Code code={health} title="health.ts" />

<h2>redaction</h2>
<p>never log bot tokens, file download urls, raw upload bytes, full user profiles or payment secrets.</p>
<p>
	<code>auditLog()</code> redacts by default, but the same masking is available standalone —
	useful for logging anything outside the audit pipeline, like a webhook body:
</p>
<Code code={redactFirstParty} title="redact.ts" />
<p>not pulling in <code>@yaebal/audit-log</code>? the same idea, hand-rolled:</p>
<Code code={redact} title="redact-manual.ts" />

<h2>alerts</h2>
<ul>
	<li>handler failures above the normal baseline.</li>
	<li>sustained 429s or retry delays above 10 seconds.</li>
	<li>webhook 401/403/405 spikes.</li>
	<li>broadcast queue not draining or failed delivery rate rising.</li>
	<li>disk usage on local bot api servers.</li>
</ul>
