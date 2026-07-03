<script lang="ts">
	import Code from "$lib/Code.svelte";

	const before = `// before — inspect or rewrite params; return new params to replace them
bot.api.before((method, params) => {
  if (method === "sendMessage") {
    return { parse_mode: "HTML", ...params };
  }
  // return undefined → params unchanged
});`;

	const after = `// after — inspect or rewrite the result; return a value to replace it
bot.api.after((method, params, result) => {
  console.log(method, "ok");
  // return undefined → result unchanged
});`;

	const onError = `// onError — runs when a request throws; ask for a retry by returning an action
bot.api.onError((method, error, attempt, params) => {
  if (error instanceof TelegramError && error.code === 429 && attempt < 5) {
    const retryAfterMs = (error.parameters?.retry_after ?? 1) * 1000;
    return { retry: true, delayMs: retryAfterMs };
  }
  // return undefined (or { retry: false }) → the error is rethrown
});`;

	const encode = `import { encodeRequest, media } from "@yaebal/core";

const req = await encodeRequest({ photo: media.buffer(bytes), caption: "hi" });
req.body;    // FormData
req.headers; // {} — browser/runtime sets multipart boundary`;

	const chained = `import { createApi } from "@yaebal/core";

const api = createApi(process.env.BOT_TOKEN!)
  .before((m, p) => p)
  .after((m, r) => r)
  .onError((m, e) => undefined);
// each registrar returns the Api, so registration chains`;

	const error = `import { TelegramError } from "@yaebal/core";

try {
  await bot.api.sendMessage({ chat_id: 1, text: "" });
} catch (e) {
  if (e instanceof TelegramError) {
    e.method;      // "sendMessage"
    e.code;        // error_code from Telegram
    e.description; // raw Telegram description
    e.parameters;  // response_parameters, e.g. { retry_after: 7 }
    e.message;     // "[sendMessage] 400: message text is empty"
  }
}`;

	const fileUrl = `const file = await bot.api.call("getFile", { file_id: id });
const url = bot.api.fileUrl(file.file_path);
// https://api.telegram.org/file/bot<token>/<file_path>
//                                  ^^^^^^^ contains the bot token — never log it`;
</script>

<svelte:head>
	<title>hooks — yaebal</title>
</svelte:head>

<h1>hooks</h1>
<p class="lead">
	three extension points on the Api — before, after, onError — wrap every request, and the error
	hook drives the retry loop.
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
	when a request throws, each <code>onError</code> hook is called with the method, the error, the
	1-based <code>attempt</code> that just failed, and the request params after <code>before</code> hooks.
	the first hook to return <code>&#123; retry: true &#125;</code> triggers a re-run; an optional
	<code>delayMs</code> waits before retrying. if no hook requests a retry, the error is rethrown.
</p>
<Code code={onError} title="onError.ts" />
<div class="note">
	<strong>bounded by the hooks themselves.</strong> the retry loop has no built-in cap — it loops
	only while a hook keeps asking for a retry. gate on <code>attempt</code> (or use a plugin like
	auto-retry) so it terminates.
</div>

<h2>errors</h2>
<p>
	when Telegram replies with <code>ok: false</code>, the call throws a <code>TelegramError</code>
	carrying the <code>method</code>, numeric <code>code</code>, raw <code>description</code>, and structured
	<code>response_parameters</code> as <code>parameters</code>.
</p>
<Code code={error} title="error.ts" />

<h2>encodeRequest: JSON vs multipart</h2>
<p>
	<code>encodeRequest</code> is exported for adapters and tests. the body encoding is chosen per
	request. plain params (and <code>url</code>/<code>fileId</code> media) serialize to JSON; the
	moment a <code>path</code>/<code>buffer</code> upload is present the request becomes multipart with
	<code>attach://</code> references. see <a href="/docs/media/">media</a> for the full encoding
	rules.
</p>
<Code code={encode} title="encode.ts" />

<h2>fileUrl</h2>
<p>
	<code>fileUrl</code> builds the download URL for a <code>file_path</code> returned by
	<code>getFile</code>.
</p>
<Code code={fileUrl} title="fileUrl.ts" />
<div class="note">
	<strong>contains the token.</strong> the file download URL embeds the bot token. never log it,
	and never hand it to an untrusted client — anyone with it controls the bot.
</div>
