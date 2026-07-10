<script lang="ts">
	import Code from "$lib/Code.svelte";

	const install = `pnpm add @yaebal/auto-answer`;

	const usage = `import { Bot } from "@yaebal/core";
import { autoAnswer } from "@yaebal/auto-answer";

const bot = new Bot(process.env.BOT_TOKEN!)
  .install(autoAnswer());

bot.callbackQuery("ping", (ctx) => ctx.reply("pong"));

await bot.start();`;

	const immediateOrder = `// "immediate" (default) — fires the moment the update arrives, before any handler
// runs, so the spinner clears even if a handler is slow.
bot.install(autoAnswer());

// "deferred" — waits for the whole handler chain to finish first, and only
// answers if nothing already did. a handler's own answerCallbackQuery(...)
// (its own text/alert) always wins.
bot.install(autoAnswer({ mode: "deferred" }));`;

	const params = `bot.install(
  autoAnswer({
    // static params...
    params: { text: "got it", showAlert: false },
  }),
);

bot.install(
  autoAnswer({
    // ...or computed per update
    params: (ctx) => ({
      text: ctx.callbackQuery.data === "danger" ? "careful!" : undefined,
    }),
  }),
);`;

	const filter = `// skip updates another plugin already answers its own way
bot.install(
  autoAnswer({
    filter: (ctx) => !ctx.callbackQuery.data?.startsWith("page:"),
  }),
);`;

	const hooks = `bot.install(
  autoAnswer({
    onAnswer: (ctx) => metrics.increment("callback_answered"),
    onError: (error, ctx) => logger.warn("auto-answer failed", error, ctx.callbackQuery.id),
  }),
);`;
</script>

<svelte:head>
	<title>@yaebal/auto-answer - yaebal</title>
</svelte:head>

<h1>@yaebal/auto-answer</h1>
<p class="lead">
	clears the client's loading spinner on every <code>callback_query</code> — no
	<code>await ctx.answerCallbackQuery()</code> in every button handler, and no forgotten one
	leaving a user staring at a spinner until telegram gives up on it.
</p>

<h2>install</h2>
<Code code={install} title="terminal" lang="sh" />

<h2>usage</h2>
<p>
	install <code>autoAnswer()</code> once. it attaches a <code>callback_query</code> middleware —
	no context is added, so it composes with anything.
</p>
<Code code={usage} title="bot.ts" />

<h2>modes</h2>
<p>
	the plugin never crashes the chain and never double-answers: <code>ctx.answerCallbackQuery</code>
	is tracked per update, so a manual call — before or after the plugin's own — always short-circuits it.
</p>
<Code code={immediateOrder} title="bot.ts" />

<h2>dynamic params</h2>
<p>
	<code>params</code> accepts <code>text</code>, <code>showAlert</code>, <code>url</code> and
	<code>cacheTime</code> — the same fields <code>answerCallbackQuery</code> takes, camelCased.
</p>
<Code code={params} title="bot.ts" />

<h2>filter</h2>
<p>
	skip specific updates entirely — useful when another plugin (e.g.
	<a href="/docs/plugins/pagination">pagination</a>) already answers a subset of callback queries
	its own way.
</p>
<Code code={filter} title="bot.ts" />

<h2>observability</h2>
<p>
	a failed auto-answer (an expired query, a dropped connection) is always swallowed and handed to
	<code>onError</code> instead of crashing the chain over a best-effort spinner clear.
	<code>onAnswer</code> observes every answer the plugin actually sent.
</p>
<Code code={hooks} title="bot.ts" />

<h2>api</h2>
<table>
	<thead>
		<tr><th>export</th><th>signature</th><th>description</th></tr>
	</thead>
	<tbody>
		<tr>
			<td><code>autoAnswer</code></td>
			<td><code>(options?: AutoAnswerOptions) =&gt; Plugin&lt;Context, Record&lt;never, never&gt;&gt;</code></td>
			<td>installable plugin — no context added</td>
		</tr>
	</tbody>
</table>

<h3>AutoAnswerOptions</h3>
<table>
	<thead>
		<tr><th>field</th><th>type</th><th>default</th><th>description</th></tr>
	</thead>
	<tbody>
		<tr><td><code>mode</code></td><td><code>"immediate" | "deferred"</code></td><td><code>"immediate"</code></td><td>fire on arrival, or only fall back once the handler chain finishes</td></tr>
		<tr><td><code>params</code></td><td><code>AutoAnswerParams | (ctx) =&gt; AutoAnswerParams | undefined</code></td><td>-</td><td>static params, or computed per update (sync or async)</td></tr>
		<tr><td><code>filter</code></td><td><code>(ctx) =&gt; boolean | Promise&lt;boolean&gt;</code></td><td>-</td><td>skip auto-answering this update</td></tr>
		<tr><td><code>onAnswer</code></td><td><code>(ctx) =&gt; unknown</code></td><td>-</td><td>observe every answer the plugin actually sent</td></tr>
		<tr><td><code>onError</code></td><td><code>(error, ctx) =&gt; unknown</code></td><td>-</td><td>observe a failed auto-answer instead of throwing</td></tr>
	</tbody>
</table>

<h3>AutoAnswerParams</h3>
<table>
	<thead>
		<tr><th>field</th><th>type</th><th>maps to</th></tr>
	</thead>
	<tbody>
		<tr><td><code>text</code></td><td><code>string</code></td><td><code>text</code></td></tr>
		<tr><td><code>showAlert</code></td><td><code>boolean</code></td><td><code>show_alert</code></td></tr>
		<tr><td><code>url</code></td><td><code>string</code></td><td><code>url</code></td></tr>
		<tr><td><code>cacheTime</code></td><td><code>number</code></td><td><code>cache_time</code></td></tr>
	</tbody>
</table>

<h2>testing</h2>
<p>
	<a href="/docs/plugins/test"><code>@yaebal/test</code></a> stubs
	<code>answerCallbackQuery</code> to <code>true</code> by default, so assert on the recorded call:
</p>
<Code
	code={`const env = createTestEnv(bot);
await env.createUser().click("ping");

assert.equal(env.callsTo("answerCallbackQuery").length, 1);`}
	title="auto-answer.test.ts"
/>

<div class="note">
	<strong>pairs with callback-data.</strong> <code>autoAnswer()</code> reads only
	<code>ctx.callbackQuery</code>, so it composes ahead of or behind
	<a href="/docs/plugins/callback-data">callback-data</a> routing and
	<a href="/docs/plugins/pagination">pagination</a> without any ordering requirement.
</div>
