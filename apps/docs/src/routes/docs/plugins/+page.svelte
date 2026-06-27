<script lang="ts">
	import Code from "$lib/Code.svelte";

	const usage = `import { Bot } from "@yaebal/core";
import { session } from "@yaebal/session";
import { Keyboard } from "@yaebal/keyboard";

const bot = new Bot(token).use(session());

bot.command("menu", (ctx) =>
  ctx.reply("pick one", {
    reply_markup: new Keyboard().text("a", "a").text("b", "b").inline(),
  }),
);`;

	const plugins = [
		["@yaebal/again", "auto-retry on 429 / flood-wait / transient 5xx"],
		["@yaebal/session", "per-chat session with pluggable storage"],
		["@yaebal/keyboard", "fluent inline & reply keyboard builders"],
		["@yaebal/callback-data", "typed callback_data pack / unpack"],
		["@yaebal/morda", "dialogs engine + jsx/hooks (react-for-telegram)"],
		["@yaebal/i18n", "per-chat locale, ctx.t / ctx.changeLanguage"],
		["@yaebal/scenes", "step-by-step wizards over multiple messages"],
		["@yaebal/prompt", "ask a question, handle the next message"],
		["@yaebal/router", "file-based routing from a routes/ directory"],
		["@yaebal/throttle", "rate-limit outgoing api calls"],
		["@yaebal/files", "resolve and download telegram files"],
		["@yaebal/ratelimiter", "drop updates from users who spam"],
		["@yaebal/broadcast", "send a message to many chats"],
		["@yaebal/web", "operator panel — view chats, reply from the browser"],
		["@yaebal/media-group", "collect album updates into one handler"],
		["@yaebal/split", "break long messages into telegram-sized chunks"],
		["@yaebal/commands", "one registry for handlers + the / command menu"],
		["@yaebal/pagination", "paginated lists with inline prev/next"],
		["@yaebal/media-cache", "reuse a file_id instead of re-uploading"],
	];
</script>

<svelte:head>
	<title>plugins — yaebal</title>
</svelte:head>

<h1>plugins</h1>
<p class="lead">
	19 first-party plugins. each is a typed composer extension — installing one enriches the context
	type, and its dependencies are checked at compile time.
</p>

<Code code={usage} title="menu.ts" />

<h2>the catalog</h2>
<table>
	<thead>
		<tr><th>package</th><th>what it does</th></tr>
	</thead>
	<tbody>
		{#each plugins as [name, desc]}
			<tr>
				<td><code>{name}</code></td>
				<td>{desc}</td>
			</tr>
		{/each}
	</tbody>
</table>

<div class="note">
	naming is deliberately english now — <code>again</code> (retry), <code>session</code>,
	<code>keyboard</code>, <code>callback-data</code> — with <code>morda</code> kept as the dialogs
	package's name.
</div>
