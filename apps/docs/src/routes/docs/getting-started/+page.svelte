<script lang="ts">
	import Code from "$lib/Code.svelte";
	import Try from "$lib/Try.svelte";

	const install = "pnpm add @yaebal/core";

	const webhook = `import { webhookCallback } from "@yaebal/core";

// any fetch-style runtime (Bun, Deno, Cloudflare Workers)
export default {
  fetch: webhookCallback(bot, { secretToken: process.env.WEBHOOK_SECRET }),
};`;
</script>

<svelte:head>
	<title>getting started — yaebal</title>
</svelte:head>

<h1>getting started</h1>
<p class="lead">a bot from zero in about a minute. node 20+, esm only.</p>

<h2>install</h2>
<p>the core package is all you need to start. plugins are separate and opt-in.</p>
<Code code={install} title="terminal" lang="sh" />

<h2>your first bot</h2>
<p>
	create a bot with your token from <a href="https://t.me/BotFather" target="_blank" rel="noreferrer">@BotFather</a>,
	register a couple of handlers, and start long-polling.
</p>
<Try id="getting-started" title="bot.ts" />

<div class="note">
	<strong>esm only.</strong> yaebal is <code>"type": "module"</code> with
	<code>NodeNext</code> resolution — use explicit <code>.js</code> specifiers in your own source.
</div>

<h2>run it</h2>
<p>point an env var at your token and run with your favourite runtime:</p>
<Code code={"BOT_TOKEN=123:abc node bot.js"} title="terminal" lang="sh" />

<h2>webhooks</h2>
<p>
	webhooks live in core. <code>webhookCallback</code> returns a fetch handler with a constant-time
	secret check, so it drops straight into Bun, Deno or Cloudflare Workers.
</p>
<Code code={webhook} title="worker.ts" />

<h2>next</h2>
<ul>
	<li><a href="/docs/core/">core concepts</a> — the composer, derive/decorate, filter queries</li>
	<li><a href="/docs/contexts/">contexts</a> — the auto-generated context layer (the killer feature)</li>
	<li><a href="/docs/plugins/">plugins</a> — sessions, keyboards, scenes, i18n and more</li>
</ul>
