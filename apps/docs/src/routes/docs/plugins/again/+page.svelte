<script lang="ts">
	import Code from "$lib/Code.svelte";

	const install = `pnpm add @yaebal/again`;

	const usage = `import { Bot } from "@yaebal/core";
import { autoRetry } from "@yaebal/again";

const bot = new Bot(process.env.BOT_TOKEN!)
  .install(autoRetry({
    maxRetries: 5,
    retryAfterPaddingMs: 250,
    onRetry: (event) => {
      console.log(event.method, event.reason, event.delayMs);
    },
  }))
  .on("message:text", (ctx) => ctx.reply("hello!"));

await bot.start();`;

	const directApi = `// lower-level form, useful when you only have an Api instance
autoRetry(bot.api, { maxRetries: 5 });`;

	const decideRetryUsage = `import { decideRetry, type AutoRetryOptions } from "@yaebal/again";
import { TelegramError } from "@yaebal/core";

const opts: AutoRetryOptions = { maxRetries: 3, maxDelayMs: 30_000 };
const error = new TelegramError("sendMessage", 429, "Too Many Requests", { retry_after: 7 });

const action = decideRetry(error, 1, opts);
// => { retry: true, delayMs: 7000, reason: "retry_after", retryAfterMs: 7000 }`;

	const testPack = `import { againTestPack } from "@yaebal/again/test-pack";
import { apiError, createTestEnv } from "@yaebal/test";

const env = createTestEnv(bot, { packs: [againTestPack({ maxRetries: 2 })] });
env.onApi("sendMessage", apiError(429, "Too Many Requests", { retry_after: 0 }), { times: 1 });`;
</script>

<svelte:head>
	<title>@yaebal/again - yaebal</title>
</svelte:head>

<h1>@yaebal/again</h1>
<p class="lead">awaited auto-retry for 429 <code>retry_after</code> and transient 5xx errors.</p>

<h2>install</h2>
<Code code={install} title="terminal" lang="sh" />

<h2>usage</h2>
<p>
	install <code>autoRetry()</code> on the bot. it attaches an <code>api.onError</code> hook; core
	keeps the original promise alive, waits, and re-runs the same API call.
</p>
<Code code={usage} title="bot.ts" />

<p>
	the direct API-hook form remains available when you are wiring a standalone
	<code>Api</code> instance instead of a bot:
</p>
<Code code={directApi} title="api.ts" />

<h2>why this is cleaner</h2>
<p>
	Telegram sends flood-wait data as <code>response_parameters.retry_after</code>. <code>@yaebal/core</code>
	now copies that object into <code>TelegramError.parameters</code>, so <code>again</code> no longer parses
	<code>"retry after N"</code> from the human-readable error text.
</p>

<h2>retry logic</h2>
<ul>
	<li><code>429</code> with <code>error.parameters.retry_after</code> waits exactly that value, plus optional padding.</li>
	<li><code>429</code> without structured <code>retry_after</code> falls back to exponential backoff.</li>
	<li><code>5xx</code> uses exponential backoff when <code>retryOnInternal</code> is true.</li>
	<li><code>4xx</code> client errors are not retried.</li>
	<li><code>onRetry</code> observes every scheduled retry for logs and metrics.</li>
</ul>
<Code code={decideRetryUsage} title="policy.ts" />

<h2>api</h2>
<table>
	<thead>
		<tr><th>export</th><th>signature</th><th>description</th></tr>
	</thead>
	<tbody>
		<tr>
			<td><code>autoRetry</code></td>
			<td><code>(options?: AutoRetryOptions) =&gt; BotPlugin</code><br /><code>(api: Api, options?: AutoRetryOptions) =&gt; void</code></td>
			<td>creates an installable bot plugin or installs the retry hook on an <code>Api</code> directly</td>
		</tr>
		<tr>
			<td><code>decideRetry</code></td>
			<td><code>(error, attempt, options?) =&gt; RetryDecision | undefined</code></td>
			<td>pure retry-policy function for unit tests and custom policy checks</td>
		</tr>
		<tr>
			<td><code>againTestPack</code></td>
			<td><code>(options?) =&gt; TestPack</code></td>
			<td>wires auto-retry into <code>@yaebal/test</code>'s mock API</td>
		</tr>
	</tbody>
</table>

<h3>AutoRetryOptions</h3>
<table>
	<thead>
		<tr><th>field</th><th>type</th><th>default</th><th>description</th></tr>
	</thead>
	<tbody>
		<tr><td><code>maxRetries</code></td><td><code>number</code></td><td><code>3</code></td><td>max retries after the first attempt</td></tr>
		<tr><td><code>maxDelayMs</code></td><td><code>number</code></td><td><code>30000</code></td><td>cap on one wait in milliseconds</td></tr>
		<tr><td><code>baseDelayMs</code></td><td><code>number</code></td><td><code>1000</code></td><td>base for exponential backoff</td></tr>
		<tr><td><code>retryAfterPaddingMs</code></td><td><code>number</code></td><td><code>0</code></td><td>extra safety delay added to Telegram-provided waits</td></tr>
		<tr><td><code>jitter</code></td><td><code>number | function</code></td><td><code>0</code></td><td>randomize delays or provide a custom delay transform</td></tr>
		<tr><td><code>retryOnInternal</code></td><td><code>boolean</code></td><td><code>true</code></td><td>also retry transient 5xx server errors</td></tr>
		<tr><td><code>onRetry</code></td><td><code>(event) =&gt; unknown</code></td><td>-</td><td>observe scheduled retries with method, params, reason and delay</td></tr>
	</tbody>
</table>

<h2>testing</h2>
<p>
	<code>@yaebal/again/test-pack</code> installs the plugin on a <code>TestEnv</code> mock API, so tests
	can simulate real Telegram errors with structured <code>retry_after</code> data.
</p>
<Code code={testPack} title="again.test.ts" />

<div class="note">
	<strong>pairs with throttle.</strong> core runs every error hook before it decides whether to
	retry, so <code>@yaebal/throttle</code> can learn <code>retry_after</code> freezes even when
	<code>again</code> is the hook that requests the retry.
</div>
