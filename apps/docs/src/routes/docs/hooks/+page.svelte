<script lang="ts">
	import Code from "$lib/Code.svelte";

	const chained = `import { createApi } from "@yaebal/core";

const api = createApi(process.env.BOT_TOKEN!)
  .before((m, p) => p)
  .after((m, r) => r)
  .onError((m, e) => undefined);
// each registrar returns the Api, so registration chains`;

	const before = `import { Bot } from "@yaebal/core";

const bot = new Bot(process.env.BOT_TOKEN!);

// before — inspect or rewrite params; return new params to replace them
bot.api.before((method, params) => {
  if (method === "sendMessage") {
    return { parse_mode: "HTML", ...params };
  }
  // return undefined → params unchanged
});`;

	const after = `import { Bot } from "@yaebal/core";

const bot = new Bot(process.env.BOT_TOKEN!);

// after — inspect or rewrite the result; return a value to replace it
bot.api.after((method, params, result) => {
  console.log(method, "ok");
  // return undefined → result unchanged
});`;

	const onError = `import { Bot, TelegramError } from "@yaebal/core";

const bot = new Bot(process.env.BOT_TOKEN!);

// onError — runs when a request throws; ask for a retry by returning an action
bot.api.onError((method, error, attempt, params) => {
  if (error instanceof TelegramError && error.code === 429 && attempt < 5) {
    const retryAfterMs = (error.parameters?.retry_after ?? 1) * 1000;
    return { retry: true, delayMs: retryAfterMs };
  }
  // return undefined (or { retry: false }) → the error is rethrown
});`;

	const errorKinds = `import { Bot, HttpError, TelegramError } from "@yaebal/core";

const bot = new Bot(process.env.BOT_TOKEN!);

bot.command("risky", async (ctx) => {
  try {
    await bot.api.sendMessage({ chat_id: ctx.chat!.id, text: "" });
  } catch (error) {
    if (error instanceof TelegramError) {
      // telegram answered ok: false — a real api-level rejection
      console.error(\`[telegram] \${error.method} -> \${error.code}: \${error.description}\`);
    } else if (error instanceof HttpError) {
      // the server (or a proxy in front of it) replied with something that
      // isn't the json envelope — e.g. an html 502 from a local bot api server
      console.error(\`[transport] \${error.method} -> http \${error.status} \${error.statusText}\`);
    } else {
      // a network failure (DNS, connection reset, abort, …) — a plain fetch rejection
      throw error;
    }
  }
});`;

	const error = `import { TelegramError } from "@yaebal/core";

declare function riskyCall(): Promise<unknown>;

try {
  await riskyCall();
} catch (e) {
  if (e instanceof TelegramError) {
    e.method;      // "sendMessage"
    e.code;        // error_code from Telegram
    e.description; // raw Telegram description
    e.parameters;  // response_parameters, e.g. { retry_after: 7 }
    e.message;     // "[sendMessage] 400: message text is empty"
  }
}`;

	const typedProxy = `import { Bot } from "@yaebal/core";

const bot = new Bot(process.env.BOT_TOKEN!);

// every Bot API method is typed — params and return type both checked
await bot.api.sendMessage({ chat_id: 1, text: "hi" });

// call() is the untyped escape hatch: a brand-new method the generated types
// don't know about yet, or params built dynamically as a plain record
await bot.api.call("sendMessage", { chat_id: 1, text: "hi" });`;

	const signal = `import { Bot } from "@yaebal/core";

const bot = new Bot(process.env.BOT_TOKEN!);
const controller = new AbortController();

const pending = bot.api.call("sendMessage", { chat_id: 1, text: "hi" }, { signal: controller.signal });
controller.abort(); // a deliberate cancellation — never offered to onError hooks for a retry`;

	const apiRoot = `import { Bot } from "@yaebal/core";

// bare origin, no trailing "/bot" — the client appends /bot<token>/<method> itself
new Bot(process.env.BOT_TOKEN!, { apiRoot: "http://localhost:8081" }); // local bot api server

// a copy-pasted GramIO-style apiRoot ending in "/bot" is detected and the
// suffix stripped (with a console.warn) instead of silently 401ing on
// /bot/bot<token>/<method>
new Bot(process.env.BOT_TOKEN!, { apiRoot: "https://api.telegram.org/bot" });`;

	const formatAnyMethod = `import { Bot } from "@yaebal/core";
import { html } from "@yaebal/fmt";

const bot = new Bot(process.env.BOT_TOKEN!);

// fmt/md/html results are split into text+entities (or caption+caption_entities)
// for ANY method that takes them — not just the ctx.send/reply/sendPhoto shortcuts
await bot.api.call("sendMessage", { chat_id: 1, text: html\`<b>bold</b>\` });
await bot.api.call("editMessageCaption", {
  chat_id: 1,
  message_id: 1,
  caption: html\`<i>edited</i>\`,
});`;

	const timing = `import { Bot } from "@yaebal/core";

const bot = new Bot(process.env.BOT_TOKEN!);
const startedAt = new Map<string, number>();

bot.api
  .before((method, params) => {
    startedAt.set(method, Date.now());
    return params;
  })
  .after((method, _params, result) => {
    const started = startedAt.get(method);
    if (started !== undefined) console.log(\`\${method} took \${Date.now() - started}ms\`);
    return result;
  });`;

	const encode = `import { encodeRequest, media } from "@yaebal/core";

const req = await encodeRequest({ photo: media.buffer(new Uint8Array([1, 2, 3])), caption: "hi" });
req.body;        // FormData
req.contentType; // undefined for multipart — the runtime sets it (with its boundary) itself`;
</script>

<svelte:head>
	<title>hooks — yaebal</title>
</svelte:head>

<h1 data-pagefind-meta="title">hooks &amp; errors</h1>
<p class="lead">
	three extension points on the Api — before, after, onError — wrap every request, the error
	hook drives the retry loop, and every failure surfaces as one of two typed error classes.
</p>

<h2>the request lifecycle</h2>
<p>
	every call goes through <code>before</code> hooks, the request itself, then <code>after</code>
	hooks. if the request throws, <code>onError</code> hooks decide whether to retry. plugins hang off
	these same three points.
</p>
<Code code={chained} title="api.ts" />

<h2>before</h2>
<p>
	a <code>before</code> hook receives the method name and params and may return replacement params.
	returning <code>undefined</code> leaves them as-is. hooks run in registration order, each seeing
	the previous one's output. they run for every actual request attempt, including retries requested
	by <code>onError</code> hooks.
</p>
<Code code={before} title="before.ts" />

<h2>after</h2>
<p>
	an <code>after</code> hook receives the method name and the successful result, and may return a
	replacement value. returning <code>undefined</code> leaves the result unchanged.
</p>
<Code code={after} title="after.ts" />

<h2>onError and the retry loop</h2>
<p>
	when a request throws, <strong>every</strong> registered <code>onError</code> hook runs — each
	sees the method, the error, the 1-based <code>attempt</code> that just failed, and the request
	params after <code>before</code> hooks. it isn't a short-circuit: even after one hook asks for a
	retry, the rest still run (so a logger/metrics hook never misses a failure). the
	<em>first</em> hook that returned <code>&#123; retry: true &#125;</code> wins and triggers a
	re-run; an optional <code>delayMs</code> waits before retrying. if no hook requests a retry, the
	error is rethrown.
</p>
<Code code={onError} title="onError.ts" />
<div class="note">
	<strong>bounded by the hooks themselves.</strong> the retry loop has no built-in cap — it loops
	only while a hook keeps asking for a retry. gate on <code>attempt</code>, or install
	<a href="/docs/plugins/again">@yaebal/again</a> which does exactly that with backoff and a cap.
</div>

<h2>errors</h2>
<p>
	a failed call throws one of two typed classes, depending on where it failed:
</p>
<table>
	<thead><tr><th>class</th><th>when</th><th>carries</th></tr></thead>
	<tbody>
		<tr>
			<td><code>TelegramError</code></td>
			<td>Telegram answered with <code>ok: false</code></td>
			<td><code>method</code>, <code>code</code>, <code>description</code>, <code>parameters</code></td>
		</tr>
		<tr>
			<td><code>HttpError</code></td>
			<td>the HTTP layer failed before a Bot API answer existed — a proxy or self-hosted server replied with something that isn't the JSON envelope (e.g. an HTML 502)</td>
			<td><code>method</code>, <code>status</code>, <code>statusText</code></td>
		</tr>
		<tr>
			<td>a plain rejection (not either class)</td>
			<td>the network call itself failed — DNS, connection reset, a deliberate <code>AbortSignal</code></td>
			<td>whatever <code>fetch</code> threw</td>
		</tr>
	</tbody>
</table>
<Code code={errorKinds} title="error-kinds.ts" />
<Code code={error} title="error.ts" />
<div class="note">
	this page covers errors thrown by an <strong>API call</strong>. an error thrown by a
	<strong>handler/middleware</strong> — including one rethrown from here — is caught by
	<code>bot.onError()</code> instead; see <a href="/docs/core#error-handling">core concepts</a>.
</div>

<h2>the typed proxy, and the escape hatch</h2>
<p>
	<code>bot.api.&lt;method&gt;(params)</code> is fully typed — every Bot API method, generated from
	the schema, with params and return type both checked. <code>bot.api.call(method, params)</code> is
	the untyped passthrough underneath it (the puregram idea): reach for it for a brand-new method the
	generated types don't cover yet, or when params are built dynamically as a plain record.
</p>
<Code code={typedProxy} title="typed-proxy.ts" />

<h2>cancellation</h2>
<p>
	every call takes an optional <code>{'{ signal }'}</code> — <code>Bot.stop()</code> uses this to
	cancel an in-flight long poll. a deliberate abort is a cancellation, not a failure: it's never
	offered to <code>onError</code> hooks for a retry.
</p>
<Code code={signal} title="signal.ts" />

<h2>apiRoot</h2>
<p>
	point the client at a different origin — most commonly a
	<a href="/docs/production/local-bot-api">local bot api server</a>. pass the bare origin, no
	trailing <code>/bot</code>; the client appends <code>/bot&lt;token&gt;/&lt;method&gt;</code> itself.
</p>
<Code code={apiRoot} title="api-root.ts" />

<h2>formatted values work on every method</h2>
<p>
	splitting a <a href="/docs/plugins/fmt">fmt/md/html</a> result into <code>text</code>/<code
		>entities</code
	> (or <code>caption</code>/<code>caption_entities</code>) isn't special-cased to
	<code>ctx.send</code>/<code>reply</code>/<code>sendPhoto</code> — it happens for any method
	called through <code>bot.api</code>, including raw <code>call(...)</code>.
</p>
<Code code={formatAnyMethod} title="format-any-method.ts" />

<h2>recipe: timing every call</h2>
<p>a <code>before</code>/<code>after</code> pair is enough to measure request latency:</p>
<Code code={timing} title="timing.ts" />

<h2>encodeRequest: JSON vs multipart</h2>
<p>
	<code>encodeRequest</code> is exported for adapters and tests. the body encoding is chosen per
	request. plain params (and <code>url</code>/<code>fileId</code> media) serialize to JSON; the
	moment a <code>path</code>/<code>buffer</code> upload is present the request becomes multipart with
	<code>attach://</code> references. see <a href="/docs/media/">media</a> for the full encoding
	rules, and for <code>downloadFile</code>/<code>fileUrl</code>.
</p>
<Code code={encode} title="encode.ts" />
