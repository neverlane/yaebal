<script lang="ts">
	import Code from "$lib/Code.svelte";

	const hooks = `bot.api.before((method, params) => {
  metrics.apiStarted.add(1, { method });
  logger.info({ method }, "telegram request");
  return params;
});

bot.api.after((method, params, result) => {
  metrics.apiOk.add(1, { method });
  return result;
});

bot.api.onError((method, error, attempt) => {
  metrics.apiFailed.add(1, { method, attempt: String(attempt) });
});

bot.onError((error, ctx) => {
  logger.error({ error, updateId: ctx.update.update_id, updateType: ctx.updateType }, "handler failed");
});`;

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
		<tr><td>queue health</td><td>queued, running, failed, skipped, next wake</td></tr>
		<tr><td>webhook delivery</td><td>status, body size, secret mismatch count</td></tr>
		<tr><td>business events</td><td>command names, broadcast job ids, payment payloads without pii</td></tr>
	</tbody>
</table>

<h2>api hooks</h2>
<Code code={hooks} title="observability.ts" />

<h2>redaction</h2>
<p>never log bot tokens, file download urls, raw upload bytes, full user profiles or payment secrets.</p>
<Code code={redact} title="redact.ts" />

<h2>alerts</h2>
<ul>
	<li>handler failures above the normal baseline.</li>
	<li>sustained 429s or retry delays above 10 seconds.</li>
	<li>webhook 401/403/405 spikes.</li>
	<li>broadcast queue not draining or failed delivery rate rising.</li>
	<li>disk usage on local bot api servers.</li>
</ul>
