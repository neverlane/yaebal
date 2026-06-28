<script lang="ts">
	import Code from "$lib/Code.svelte";

	const install = `pnpm add @yaebal/broadcast`;

	const basic = `import { Bot } from "@yaebal/core";
import { broadcast } from "@yaebal/broadcast";

const bot = new Bot(token);

// send a plain message to every subscriber
const result = await broadcast(bot.api, subscriberIds, "hello everyone!");
console.log(result.sent, "sent,", result.failed, "failed");`;

	const withOptions = `const result = await broadcast(
  bot.api,
  subscriberIds,
  "<b>weekly digest</b>\\n\\ncheck the latest posts below.",
  {
    extra: { parse_mode: "HTML" },
    onError: (chatId, error) => {
      console.error("failed for", chatId, error);
      // mark the user as unreachable in your db, etc.
    },
  },
);`;
</script>

<svelte:head>
	<title>@yaebal/broadcast — yaebal</title>
</svelte:head>

<h1>@yaebal/broadcast</h1>
<p class="lead">send a text message to many chats, one at a time, counting successes and failures. one blocked user never aborts the rest of the run.</p>

<h2>install</h2>
<Code code={install} title="terminal" lang="sh" />

<h2>usage</h2>
<p><code>broadcast</code> is a plain async function — it takes <code>bot.api</code> directly and needs no middleware registration.</p>
<Code code={basic} title="broadcast.ts" />

<h2>api</h2>
<table>
	<thead>
		<tr><th>export</th><th>kind</th><th>signature</th></tr>
	</thead>
	<tbody>
		<tr>
			<td><code>broadcast</code></td>
			<td>async function</td>
			<td><code>(api, chatIds, text, options?) =&gt; Promise&lt;BroadcastResult&gt;</code></td>
		</tr>
		<tr>
			<td><code>BroadcastResult</code></td>
			<td>interface</td>
			<td><code>\&#123; sent: number; failed: number \&#125;</code></td>
		</tr>
		<tr>
			<td><code>BroadcastOptions</code></td>
			<td>interface</td>
			<td>see options table below</td>
		</tr>
	</tbody>
</table>

<h2>parameters</h2>
<table>
	<thead>
		<tr><th>parameter</th><th>type</th><th>description</th></tr>
	</thead>
	<tbody>
		<tr>
			<td><code>api</code></td>
			<td><code>Api</code></td>
			<td>the bot's API object (<code>bot.api</code>).</td>
		</tr>
		<tr>
			<td><code>chatIds</code></td>
			<td><code>Array&lt;number | string&gt;</code></td>
			<td>the list of chat IDs to send to.</td>
		</tr>
		<tr>
			<td><code>text</code></td>
			<td><code>string</code></td>
			<td>the message text.</td>
		</tr>
		<tr>
			<td><code>options.extra</code></td>
			<td><code>Record&lt;string, unknown&gt;</code></td>
			<td>extra params merged into every <code>sendMessage</code> call (e.g. <code>parse_mode</code>, <code>reply_markup</code>). per-chat fields (<code>chat_id</code>, <code>text</code>) always win.</td>
		</tr>
		<tr>
			<td><code>options.onError</code></td>
			<td><code>(chatId, error) =&gt; void</code></td>
			<td>called for each failed chat. the run continues regardless.</td>
		</tr>
	</tbody>
</table>

<h2>example with options</h2>
<Code code={withOptions} title="weekly-digest.ts" />

<div class="note">
	<strong>no rate limiting built in.</strong> Telegram allows at most 30 messages per second to different chats. for large audiences pair this with <code>@yaebal/throttle</code> to avoid hitting the limit and triggering 429 errors.
</div>
