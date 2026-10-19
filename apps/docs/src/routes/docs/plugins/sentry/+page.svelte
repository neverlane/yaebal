<script lang="ts">
	import Code from "$lib/Code.svelte";

	const install = `pnpm add @yaebal/sentry @sentry/node`;

	const usage = `import * as Sentry from "@sentry/node";
import { Bot } from "@yaebal/core";
import { sentry } from "@yaebal/sentry";

Sentry.init({ dsn: process.env.SENTRY_DSN });

// install first, so its scope wraps every other plugin
const bot = new Bot(process.env.BOT_TOKEN!).install(sentry({ sentry: Sentry, setUser: true }));

bot.command("pay", async (ctx) => {
  ctx.sentry.setTag("feature", "payments");
  try {
    await charge(ctx.from!.id);
  } catch (error) {
    ctx.sentry.captureException(error); // handled, but still worth a report
    await ctx.reply("payment failed, try again later");
  }
});`;

	const onError = `import { isReported } from "@yaebal/sentry";

bot.onError((error, ctx) => {
  if (!isReported(error)) Sentry.captureException(error); // e.g. a contextFactory failure
  return ctx.send("something broke — we're on it");
});`;
</script>

<svelte:head>
	<title>@yaebal/sentry — yaebal</title>
</svelte:head>

<h1>@yaebal/sentry</h1>
<p class="lead">
	sentry error tracking: an isolation scope per update with chat and user, failing handlers
	captured with that scope, and breadcrumbs for every update and bot api call.
</p>

<h2>install</h2>
<Code code={install} title="terminal" lang="sh" />
<p>
	pass the sentry sdk you already use — <code>@sentry/node</code>, <code>@sentry/bun</code>,
	<code>@sentry/deno</code>, <code>@sentry/cloudflare</code>. the plugin reads it structurally,
	so it has no sentry dependency of its own and never fights your sdk version.
</p>

<h2>usage</h2>
<Code code={usage} title="bot.ts" />

<h2>what lands on ctx</h2>
<table>
	<thead><tr><th>field</th><th>does</th></tr></thead>
	<tbody>
		<tr><td><code>ctx.sentry.scope</code></td><td>this update's isolation scope</td></tr>
		<tr><td><code>ctx.sentry.captureException(error)</code> / <code>captureMessage(text)</code></td><td>report with this update's scope</td></tr>
		<tr><td><code>ctx.sentry.setTag(key, value)</code> / <code>setExtra(key, value)</code></td><td>annotate this update's scope</td></tr>
	</tbody>
</table>

<h2>options</h2>
<table>
	<thead><tr><th>option</th><th>default</th><th>does</th></tr></thead>
	<tbody>
		<tr><td><code>sentry</code></td><td>—</td><td>the initialized sentry sdk</td></tr>
		<tr><td><code>setUser</code></td><td><code>false</code></td><td>attach the sender (<code>id</code>, <code>username</code>) as the sentry user — personal data, so opt-in</td></tr>
		<tr><td><code>breadcrumbs</code></td><td><code>true</code></td><td>a breadcrumb per update and per bot api call (error-level for failures)</td></tr>
	</tbody>
</table>

<h2>with bot.onError</h2>
<p>
	a thrown error is captured, then rethrown, so <code>bot.onError</code> still answers the user.
	<code>isReported(error)</code> tells it the error already reached sentry:
</p>
<Code code={onError} title="errors.ts" />

<h2>related</h2>
<ul>
	<li><a href="/docs/plugins/otel/">@yaebal/otel</a> — traces instead of error reports</li>
	<li><a href="/docs/plugins/audit-log/">@yaebal/audit-log</a> — structured logs of every update and api call</li>
	<li><a href="/docs/hooks/">hooks &amp; errors</a> — how errors flow through a bot</li>
</ul>
