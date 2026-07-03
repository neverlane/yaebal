<script lang="ts">
	import Code from "$lib/Code.svelte";

	const compose = `services:
  telegram-bot-api:
    image: aiogram/telegram-bot-api:latest
    restart: unless-stopped
    environment:
      TELEGRAM_API_ID: \${TELEGRAM_API_ID}
      TELEGRAM_API_HASH: \${TELEGRAM_API_HASH}
      TELEGRAM_LOCAL: "1"
    volumes:
      - telegram-bot-api-data:/var/lib/telegram-bot-api
    ports:
      - "8081:8081"

volumes:
  telegram-bot-api-data:`;

	const connect = `import { createBot } from "yaebal";

const bot = createBot(process.env.BOT_TOKEN!, {
  apiRoot: "http://localhost:8081",
});`;

	const logout = `await bot.api.call("logOut", {});
// wait a few minutes, then point apiRoot at the local server.`;
</script>

<svelte:head><title>local bot api — yaebal</title></svelte:head>

<h1>local bot api</h1>
<p class="lead">self-host telegram's bot api server when file limits or network control matter.</p>

<h2>when to use it</h2>
<table>
	<thead><tr><th>need</th><th>cloud api</th><th>local server</th></tr></thead>
	<tbody>
		<tr><td>upload large files</td><td>cloud limits</td><td>up to the server limit</td></tr>
		<tr><td>download files</td><td>tokenized urls</td><td>server-local paths or your own file serving</td></tr>
		<tr><td>private network</td><td>telegram cloud</td><td>your vpc/container network</td></tr>
		<tr><td>simple bots</td><td>best default</td><td>extra operational cost</td></tr>
	</tbody>
</table>

<h2>credentials</h2>
<p>
	you need <code>BOT_TOKEN</code> from <a href="https://t.me/BotFather" target="_blank" rel="noreferrer">@botfather</a>
	and <code>TELEGRAM_API_ID</code>/<code>TELEGRAM_API_HASH</code> from
	<a href="https://my.telegram.org" target="_blank" rel="noreferrer">my.telegram.org</a>.
</p>

<h2>run the server</h2>
<Code code={compose} title="docker-compose.yml" lang="yaml" />

<h2>switch a bot token</h2>
<p>
	a bot cannot use the cloud api and a local server at the same time. call <code>logOut</code> once
	before moving it.
</p>
<Code code={logout} title="migrate.ts" />

<h2>connect yaebal</h2>
<p><code>apiRoot</code> is the root before <code>/bot&lt;token&gt;/method</code>.</p>
<Code code={connect} title="bot.ts" />

<h2>production notes</h2>
<ul>
	<li>keep the bot and api server in the same private network.</li>
	<li>do not log file urls if they contain a bot token.</li>
	<li>mount persistent storage for the api server working directory.</li>
	<li>serve downloaded files through your own authenticated endpoint if users need links.</li>
	<li>monitor server disk usage; large uploads make capacity planning real.</li>
</ul>
