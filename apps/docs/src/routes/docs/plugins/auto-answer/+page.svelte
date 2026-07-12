<script lang="ts">
	import Code from "$lib/Code.svelte";
	import Try from "$lib/Try.svelte";

	const install = `pnpm add @yaebal/auto-answer`;

	const usage = `import { Bot } from "@yaebal/core";
import { autoAnswer } from "@yaebal/auto-answer";

const bot = new Bot(process.env.BOT_TOKEN!)
  .install(autoAnswer());

bot.callbackQuery("ping", (ctx) => ctx.reply("pong"));

await bot.start();`;

	const deadline = `// "deadline" (default) — races the handler chain against \`timeout\` (default 1500ms). a
// handler that answers first — with its own text/alert — always wins; if nothing answers
// before the timer fires, the plugin fills the gap with an empty ack.
bot.install(autoAnswer({ timeout: 2000 }));`;

	const deferred = `// "deferred" — waits for the whole handler chain to finish, however long that takes, and
// only answers if nothing already did. no timer, so no risk of racing a still-running
// handler — but a hung or truly slow handler leaves the spinner spinning for as long as it
// takes.
bot.install(autoAnswer({ mode: "deferred" }));`;

	const immediate = `// "immediate" — answers the instant the update arrives, before any handler runs. zero
// added latency, but a handler's own answerCallbackQuery(...) can no longer win — it's
// silently turned into a no-op instead of a second call that would fail against telegram.
// only reach for this if no handler downstream ever answers its own callback queries.
bot.install(autoAnswer({ mode: "immediate" }));`;

	const skip = `bot.callbackQuery("archive", async (ctx) => {
  // answering later, from a queued job — tell the plugin not to fill the gap in the meantime.
  ctx.skipAutoAnswer();
  await queue.push({ type: "archive", callbackQueryId: ctx.callbackQuery.id });
});`;

	const params = `bot.install(
  autoAnswer({
    // static params...
    params: { text: "got it", showAlert: false },
  }),
);

bot.install(
  autoAnswer({
    // ...or computed per update (sync or async)
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
	install <code>autoAnswer()</code> once. it attaches a <code>callback_query</code> middleware and
	adds <code>ctx.skipAutoAnswer()</code> — no other plugin dependency required, and it composes
	with anything.
</p>
<Code code={usage} title="bot.ts" />
<Try id="auto-answer-deadline" title="bot.ts" />

<h2>modes</h2>
<p>
	pick <code>"deadline"</code> (the default) unless you have a specific reason not to — it's the
	only mode where both "the spinner always clears promptly" and "a handler's own alert still
	works" hold at once.
</p>
<Code code={deadline} title="bot.ts" />
<Code code={deferred} title="bot.ts" />
<Code code={immediate} title="bot.ts" />

<h2>never double-answers, never throws</h2>
<p>
	whichever call reaches <code>ctx.answerCallbackQuery</code> first — this plugin's own fallback,
	or a handler's manual call — wins; every later one (even in the same synchronous tick, e.g. an
	<code>"immediate"</code> fire racing a handler that answers right away) becomes a safe no-op instead
	of a second network call racing the first to telegram's <code>400: query is too old</code>.
</p>
<p>
	calls that go around <code>ctx.answerCallbackQuery</code> entirely — a rich
	<a href="/docs/contexts"><code>@yaebal/contexts</code></a>
	<code>contextFor("callback_query", ...).answer()</code>, or a raw
	<code>ctx.api.call("answerCallbackQuery", ...)</code> — are still <em>observed</em> (so
	<code>"deferred"</code>/<code>"deadline"</code>'s fallback correctly backs off once the handler
	chain has had time to run), but not blocked outright: in <code>"immediate"</code> mode
	specifically, a bypass call issued in the very same tick as the plugin's own fire can still
	double-dispatch. stick to <code>ctx.answerCallbackQuery</code> (or <code>ctx.skipAutoAnswer()</code>)
	inside handlers this plugin watches, and this never comes up.
</p>
<p>
	a failed auto-answer (an expired query, a dropped connection, a throwing <code>filter</code>/<code
	>params</code>) is always swallowed and handed to <code>onError</code> — this plugin never
	crashes the chain over a best-effort spinner clear, and a broken <code>onAnswer</code>/<code
	>onError</code> callback can't crash it either.
</p>

<h2>opting out per update</h2>
<p>
	<code>ctx.skipAutoAnswer()</code> opts the current update out entirely — no fallback answer, regardless
	of mode. it's a no-op outside a <code>callback_query</code> update, so it's always safe to call.
</p>
<Code code={skip} title="bot.ts" />
<Try id="auto-answer-skip" title="bot.ts" />

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
	<code>onAnswer</code> observes every answer the plugin actually sent. <code>onError</code> observes
	a failed one instead of throwing.
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
			<td><code>(options?: AutoAnswerOptions) =&gt; Plugin&lt;Context, AutoAnswerContext&gt;</code></td>
			<td>installable plugin — adds <code>ctx.skipAutoAnswer()</code></td>
		</tr>
	</tbody>
</table>

<h3>AutoAnswerOptions</h3>
<table>
	<thead>
		<tr><th>field</th><th>type</th><th>default</th><th>description</th></tr>
	</thead>
	<tbody>
		<tr><td><code>mode</code></td><td><code>"deadline" | "deferred" | "immediate"</code></td><td><code>"deadline"</code></td><td>race a timer against the chain, wait for the whole chain, or fire before it runs</td></tr>
		<tr><td><code>timeout</code></td><td><code>number</code></td><td><code>1500</code></td><td>how long <code>"deadline"</code> waits for the chain before answering on its own (ms)</td></tr>
		<tr><td><code>params</code></td><td><code>AutoAnswerParams | (ctx) =&gt; AutoAnswerParams | undefined</code></td><td>-</td><td>static params, or computed per update (sync or async)</td></tr>
		<tr><td><code>filter</code></td><td><code>(ctx) =&gt; boolean | Promise&lt;boolean&gt;</code></td><td>-</td><td>skip auto-answering this update</td></tr>
		<tr><td><code>onAnswer</code></td><td><code>(ctx) =&gt; unknown</code></td><td>-</td><td>observe every answer the plugin actually sent</td></tr>
		<tr><td><code>onError</code></td><td><code>(error, ctx) =&gt; unknown</code></td><td>-</td><td>observe a failed auto-answer instead of throwing</td></tr>
	</tbody>
</table>

<h3>AutoAnswerContext</h3>
<table>
	<thead>
		<tr><th>member</th><th>signature</th><th>description</th></tr>
	</thead>
	<tbody>
		<tr>
			<td><code>skipAutoAnswer</code></td>
			<td><code>() =&gt; void</code></td>
			<td>opt the current update out of auto-answering; a no-op outside a <code>callback_query</code></td>
		</tr>
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
<p>
	testing <code>"deadline"</code>'s fallback timer needs the
	<a href="/docs/plugins/test#the-virtual-clock--skip-real-time">virtual clock</a>
	to fast-forward without a real wait — restore it afterward, or every later test in the same
	file silently inherits the fake <code>setTimeout</code>:
</p>
<Code
	code={`const env = createTestEnv(bot);
env.useFakeTimers(); // arm before the handler chain schedules anything

const clicked = env.createUser().click("ping");
await env.advanceTime(1500); // the default timeout
await clicked;

assert.equal(env.callsTo("answerCallbackQuery").length, 1);
env.shutdown(); // restore real timers for the rest of the file`}
	title="auto-answer.test.ts"
/>

<div class="note">
	<strong>pairs with callback-data.</strong> <code>autoAnswer()</code> reads only
	<code>ctx.callbackQuery</code>, so it composes ahead of or behind
	<a href="/docs/plugins/callback-data">callback-data</a> routing and
	<a href="/docs/plugins/pagination">pagination</a> without any ordering requirement.
</div>
