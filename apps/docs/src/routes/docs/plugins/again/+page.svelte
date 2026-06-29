<script lang="ts">
	import Code from "$lib/Code.svelte";

	const install = `pnpm add @yaebal/again`;

	const usage = `import { Bot } from "@yaebal/core";
import { autoRetry } from "@yaebal/again";

const bot = new Bot(process.env.BOT_TOKEN!)
  .install(autoRetry())
  .on("message:text", (ctx) => ctx.reply("hello!"));

// all API calls made through bot.api will now be retried automatically
bot.start();`;

	const customOptions = `bot.install(autoRetry({
  maxRetries: 5,      // retry up to 5 times (default: 3)
  maxDelayMs: 10_000, // cap each wait at 10 s (default: 30 000)
  retryOnInternal: false, // skip 5xx, only handle 429 (default: true)
}));`;

	const directApi = `// lower-level form, useful when you only have an Api instance
autoRetry(bot.api, { maxRetries: 5 });`;

	const decideRetryUsage = `import { decideRetry, type AutoRetryOptions } from "@yaebal/again";
import { TelegramError } from "@yaebal/core";

const opts: AutoRetryOptions = { maxRetries: 3, maxDelayMs: 30_000 };
const action = decideRetry(new TelegramError("sendMessage", 429, "retry after 7"), 1, opts);
// => { retry: true, delayMs: 7000 }`;
</script>

<svelte:head>
	<title>@yaebal/again — yaebal</title>
</svelte:head>

<h1>@yaebal/again</h1>
<p class="lead">auto-retry on 429 / flood-wait and transient 5xx errors.</p>

<h2>install</h2>
<Code code={install} title="terminal" lang="sh" />

<h2>usage</h2>
<p>
	install <code>autoRetry()</code> on the bot. it attaches an error hook to the API layer — every
	failed call is inspected and, if retryable, waited on and re-issued automatically.
</p>
<Code code={usage} title="bot.ts" />

<h2>options</h2>
<Code code={customOptions} title="bot.ts" />
<p>
	the direct API-hook form remains available when you are wiring a standalone
	<code>Api</code> instance instead of a bot:
</p>
<Code code={directApi} title="api.ts" />

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
			<td><code>(error: unknown, attempt: number, options?: AutoRetryOptions) =&gt; ErrorAction | undefined</code></td>
			<td>pure retry-policy function — exported for unit testing</td>
		</tr>
		<tr>
			<td><code>AutoRetryOptions</code></td>
			<td>interface</td>
			<td>options bag passed to both functions</td>
		</tr>
	</tbody>
</table>

<h3>AutoRetryOptions</h3>
<table>
	<thead>
		<tr><th>field</th><th>type</th><th>default</th><th>description</th></tr>
	</thead>
	<tbody>
		<tr>
			<td><code>maxRetries</code></td>
			<td><code>number</code></td>
			<td><code>3</code></td>
			<td>max retries after the first attempt</td>
		</tr>
		<tr>
			<td><code>maxDelayMs</code></td>
			<td><code>number</code></td>
			<td><code>30000</code></td>
			<td>cap on a single wait in milliseconds</td>
		</tr>
		<tr>
			<td><code>retryOnInternal</code></td>
			<td><code>boolean</code></td>
			<td><code>true</code></td>
			<td>also retry transient 5xx server errors</td>
		</tr>
	</tbody>
</table>

<h2>retry logic</h2>
<p>
	<code>decideRetry</code> inspects errors in this order:
</p>
<ul>
	<li>attempt exceeds <code>maxRetries</code> → no retry</li>
	<li>not a <code>TelegramError</code> → no retry</li>
	<li>code 429 → reads <code>retry after N</code> from the message; falls back to exponential
		backoff (<code>2^attempt</code> seconds); capped at <code>maxDelayMs</code></li>
	<li>code ≥ 500 and <code>retryOnInternal</code> is true → exponential backoff; capped at
		<code>maxDelayMs</code></li>
	<li>anything else (4xx client errors, unknown errors) → no retry</li>
</ul>
<Code code={decideRetryUsage} title="policy.ts" />

<div class="note">
	<strong>4xx errors are never retried.</strong> a 400 Bad Request means the call itself is wrong
	— retrying it would loop forever. only 429 and 5xx are candidates.
	<br /><br />
	<strong><code>decideRetry</code> is a pure function with no I/O</strong> — it is exported
	specifically so you can unit-test a custom policy without mocking network calls.
</div>
