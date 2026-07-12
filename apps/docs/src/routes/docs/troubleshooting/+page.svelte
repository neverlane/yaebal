<script lang="ts">
	import Code from "$lib/Code.svelte";
	import Try from "$lib/Try.svelte";

	const envCheck = `import { createBot } from "yaebal";

const token = process.env.BOT_TOKEN;

if (!token) {
  throw new Error("BOT_TOKEN is missing");
}

const bot = createBot(token);`;

	const pollingConflict = `import { createBot } from "yaebal";

const bot = createBot(process.env.BOT_TOKEN!);

// if polling gets 409 conflict, make sure no webhook is set
await bot.api.call("deleteWebhook", { drop_pending_updates: true });

// then start exactly one polling process
await bot.start();`;

	const allowedUpdates = `import { Bot } from "@yaebal/core";

const token = process.env.BOT_TOKEN!;

const bot = new Bot(token, {
  allowedUpdates: [
    "message",
    "callback_query",
    "chat_member",
    "message_reaction",
    "chat_join_request",
  ],
});`;

	const mediaUpload = `import { createBot, media } from "yaebal";

const bot = createBot(process.env.BOT_TOKEN!);

bot.command("send", async (ctx) => {
  await ctx.sendPhoto(media.url("https://example.com/cat.jpg"));
  await ctx.sendDocument(media.path("./report.pdf"));
  await ctx.sendPhoto("AgACAgIAAx..."); // existing file_id also works
});`;

	const webhookCheck = `import { createBot } from "yaebal";
import type { WebhookInfo } from "@yaebal/types";

const bot = createBot(process.env.BOT_TOKEN!);

const info = await bot.api.call<WebhookInfo>("getWebhookInfo");
console.log(info.url, info.last_error_message);`;

	const usersFile = `export const loadUser = async (id: number) => ({ id });`;

	const esmImport = `// @ts-expect-error — ERR_MODULE_NOT_FOUND at runtime: node's esm resolver
// does not add extensions for you, so this fails to resolve even though
// users.ts sits right next to this file.
import { loadUser } from "./users";

// ✅ write .js even though the source file is users.ts — nodenext rewrites
// nothing at compile time; this is what actually ends up on disk.
import { loadUser as loadUserFixed } from "./users.js";

await loadUserFixed(1);`;

	const errorTable = [
		["message is not modified", "editing a message with identical text/markup", "skip the edit, or diff before calling editText/editMessageText"],
		["can't parse entities: …", "malformed HTML/Markdown passed straight to parse_mode", "build the text with html\`…\`/md\`…\` from @yaebal/fmt instead of raw markup strings"],
		["query is too old and response timeout expired", "answered a callback query more than ~15s after it arrived", "call answerCallbackQuery() first, before any awaits that can be slow"],
		["QUERY_ID_INVALID", "reused or already-answered callback_query id", "answer each callback query exactly once"],
		["chat not found", "wrong/stale chat_id, or the bot was never in that chat", "verify the id; a user must have started the bot or share a chat with it first"],
		["bot was blocked by the user", "403 on send — the user blocked the bot", "catch and drop this recipient; don't retry it in a broadcast"],
		["not enough rights to …", "the bot lacks the specific admin permission for that action", "check getChatMember for the bot itself before attempting the action"],
		["message to delete not found", "deleting a message already deleted or older than 48h", "treat as success — the end state (message gone) is already true"],
	];
</script>

<svelte:head>
	<title>troubleshooting — yaebal</title>
</svelte:head>

<h1>troubleshooting</h1>
<p class="lead">
	symptom-driven fixes for the telegram failures users hit most often in real bots.
</p>

<h2>error text → cause → fix</h2>
<p>search this table for the exact wording Telegram (or Node) gave you:</p>
<table>
	<thead><tr><th>error text</th><th>cause</th><th>fix</th></tr></thead>
	<tbody>
		{#each errorTable as [text, cause, fix]}
			<tr><td><code>{text}</code></td><td>{cause}</td><td>{fix}</td></tr>
		{/each}
	</tbody>
</table>

<h2>bot does not start</h2>
<table>
	<thead><tr><th>symptom</th><th>likely cause</th><th>fix</th></tr></thead>
	<tbody>
		<tr><td><code>401 unauthorized</code></td><td>missing, empty, or wrong token</td><td>validate <code>BOT_TOKEN</code> before constructing the bot</td></tr>
		<tr><td><code>404 not found</code> on every method</td><td>wrong <code>apiRoot</code> or token copied with whitespace</td><td>trim the token and check custom bot api server url</td></tr>
		<tr><td>process exits immediately</td><td><code>bot.start()</code> rejected during startup (bad token, no network) and nothing caught it</td><td>use top-level <code>await bot.start()</code> in esm so the startup error surfaces with a stack trace</td></tr>
	</tbody>
</table>
<Code code={envCheck} title="env.ts" />

<h2><code>ERR_MODULE_NOT_FOUND</code> / esm import errors</h2>
<p>
	yaebal is <code>"type": "module"</code>. Node's ESM resolver does not add extensions for you —
	a local import needs the <code>.js</code> specifier that the compiled output will actually have,
	even while editing the <code>.ts</code> source.
</p>
<Code code={usersFile} title="users.ts" />
<Code code={esmImport} title="esm.ts" />

<h2>polling receives no updates</h2>
<p>
	telegram allows either long polling or webhooks for a token, not both. a common failure is
	<code>409 conflict: terminated by other getUpdates request</code>: another process is polling the
	same token, or a webhook is still registered.
</p>
<Code code={pollingConflict} title="reset-polling.ts" />
<table>
	<thead><tr><th>symptom</th><th>fix</th></tr></thead>
	<tbody>
		<tr><td><code>409 conflict</code></td><td>stop old containers, local dev processes, and duplicate <code>bot.start()</code> calls</td></tr>
		<tr><td>webhook is set</td><td>call <code>deleteWebhook</code> or switch the app to webhook mode</td></tr>
		<tr><td>groups only deliver commands</td><td>botfather privacy mode is enabled; disable it only if the bot must read all group messages</td></tr>
		<tr><td><code>chat_member</code> / reactions never arrive</td><td>pass explicit <code>allowedUpdates</code></td></tr>
	</tbody>
</table>
<Code code={allowedUpdates} title="allowed-updates.ts" />

<h2>webhook does not fire</h2>
<p>
	use <code>getWebhookInfo</code> first. telegram tells you the registered url, pending update count,
	and the last delivery error.
</p>
<Code code={webhookCheck} title="webhook-info.ts" />
<table>
	<thead><tr><th>symptom</th><th>fix</th></tr></thead>
	<tbody>
		<tr><td>telegram never reaches localhost</td><td>use a public https url or a tunnel for local dev</td></tr>
		<tr><td><code>401</code> in your logs</td><td>the <code>secretToken</code> passed to <code>setWebhook</code> does not match the handler</td></tr>
		<tr><td><code>405</code></td><td>telegram must post to the exact route that mounts the webhook callback</td></tr>
		<tr><td><code>413</code></td><td>request body exceeded the built-in 1 mib guard; real updates should be tiny</td></tr>
	</tbody>
</table>
<p>see <a href="/docs/webhooks/">webhooks</a> and <a href="/docs/plugins/web/">@yaebal/web</a>.</p>

<h2>callback button spinner hangs</h2>
<p>
	telegram clients show a loading spinner until the bot answers the callback query. answer it at
	the top of the handler, then edit or send messages.
</p>
<Try id="callback-spinner" title="callback.ts" />

<h2>formatting is broken</h2>
<table>
	<thead><tr><th>symptom</th><th>fix</th></tr></thead>
	<tbody>
		<tr><td>literal <code>&lt;b&gt;</code> or markdown appears in chat</td><td>use <code>html</code>/<code>md</code> from <a href="/docs/plugins/fmt/">@yaebal/fmt</a> or entity builders from core, not raw <code>parse_mode</code> strings</td></tr>
		<tr><td>user input breaks formatting</td><td>interpolate into <code>html</code>/<code>md</code> templates so user text is escaped as literal text</td></tr>
		<tr><td>entities disappear after string concatenation</td><td>keep values as yaebal format results until the final <code>ctx.send</code>/<code>ctx.reply</code></td></tr>
	</tbody>
</table>

<h2>media upload fails</h2>
<p>
	use <code>media.path</code> for local files, <code>media.buffer</code> for in-memory bytes,
	<code>media.url</code> for public urls, and raw strings for telegram <code>file_id</code>s.
</p>
<Code code={mediaUpload} title="media.ts" />
<div class="note">
	<strong>edge runtimes have no filesystem.</strong> <code>media.path()</code> needs a runtime file
	reader and is not available on cloudflare workers. use <code>media.url()</code> or
	<code>media.buffer()</code> on edge.
</div>

<h2>session or plugin fields are missing</h2>
<p>
	in yaebal, plugin context fields exist downstream of the <code>.install()</code> call. install
	plugins before handlers that use them, and encode plugin dependencies in the plugin type when you
	write your own.
</p>
<table>
	<thead><tr><th>problem</th><th>fix</th></tr></thead>
	<tbody>
		<tr><td><code>ctx.session</code> is not typed</td><td>install <code>session()</code> before the handler and keep the returned bot/composer value in the chain</td></tr>
		<tr><td>scene plugin cannot read session</td><td>install session before scenes/onboarding-style stateful plugins</td></tr>
		<tr><td>plugin works at runtime but not in typescript</td><td>make it a <code>Plugin&lt;In, Out&gt;</code> and return the augmented composer</td></tr>
	</tbody>
</table>

<h2>types look too weak</h2>
<p>
	use <code>createBot()</code> from the <a href="/docs/yaebal/">yaebal meta package</a> for rich
	generated runtime contexts. a bare <code>new Bot(token)</code> from <code>@yaebal/core</code>
	intentionally exposes the small base context unless you provide a custom context factory.
</p>

<h2>bot feels slow / updates pile up</h2>
<p>
	sequential long polling processes one update at a time by design — a slow handler (a database
	call, an outbound http request) blocks everything behind it in the same chat and others besides.
</p>
<table>
	<thead><tr><th>symptom</th><th>fix</th></tr></thead>
	<tbody>
		<tr><td>updates visibly queue up under load</td><td><a href="/docs/runner/">@yaebal/runner</a> — concurrent polling with per-chat ordering preserved</td></tr>
		<tr><td>outbound sends get 429'd</td><td><a href="/docs/plugins/throttle/">@yaebal/throttle</a> — buckets outgoing calls under Telegram's own limits</td></tr>
		<tr><td>calls fail transiently (5xx, network blips)</td><td><a href="/docs/plugins/again/">@yaebal/again</a> — retry with backoff instead of failing the update</td></tr>
	</tbody>
</table>

<h2>still stuck</h2>
<ul>
	<li>search the generated <a href="/docs/api/">bot api reference</a> for the exact method.</li>
	<li>turn the failing behavior into a test with <a href="/docs/plugins/test/">@yaebal/test</a>.</li>
	<li>check production patterns in <a href="/docs/production/">production</a>.</li>
</ul>
