<script lang="ts">
	import Code from "$lib/Code.svelte";

	const compose = `services:
  telegram-bot-api:
    image: ghcr.io/neverlane/telegram-bot-api:latest
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

	const logout = `// while apiRoot still points at the cloud api:
await bot.api.call("logOut", {});
// the local server accepts the token immediately. going back to the
// cloud api is locked for 10 minutes after logOut.`;

	const connect = `import { createBot } from "yaebal";

const bot = createBot(process.env.BOT_TOKEN!, {
  apiRoot: "http://localhost:8081",
});`;

	const localFile = `import { readFile } from "node:fs/promises";

const file = await bot.api.call<{ file_path?: string }>("getFile", { file_id: fileId });
// with TELEGRAM_LOCAL=1 file_path is an absolute path on the server's disk —
// mount the data volume into the bot container at the same path and read it.
const bytes = await readFile(file.file_path!);`;
</script>

<svelte:head><title>local bot api — yaebal</title></svelte:head>

<h1>local bot api</h1>
<p class="lead">self-host telegram's bot api server when file limits or network control matter.</p>

<h2>when to use it</h2>
<p>
	for most bots the cloud api is the right default — a local server is one more process to run,
	update and monitor. run one when you hit its limits:
</p>
<table>
	<thead><tr><th>need</th><th>cloud api</th><th>local server</th></tr></thead>
	<tbody>
		<tr><td>upload files</td><td>up to 50 MB</td><td>up to 2000 MB</td></tr>
		<tr><td>download files</td><td>up to 20 MB</td><td>no limit</td></tr>
		<tr>
			<td>webhooks</td>
			<td>https only, ports 443/80/88/8443</td>
			<td>plain http, any port, up to 100000 connections</td>
		</tr>
		<tr><td>traffic</td><td>through telegram's cloud</td><td>stays in your private network</td></tr>
	</tbody>
</table>
<p>
	the file and webhook advantages need the server started in <em>local mode</em> (the
	<code>TELEGRAM_LOCAL</code> flag below) — without it a self-hosted server keeps the cloud
	limits. local mode also changes how you receive files; see
	<a href="#files-in-local-mode">files in local mode</a>.
</p>

<h2>credentials</h2>
<p>
	you need <code>BOT_TOKEN</code> from <a href="https://t.me/BotFather" target="_blank" rel="noreferrer">@BotFather</a>
	and <code>TELEGRAM_API_ID</code>/<code>TELEGRAM_API_HASH</code> — application credentials from
	<a href="https://my.telegram.org" target="_blank" rel="noreferrer">my.telegram.org</a>. treat
	all three as secrets.
</p>

<h2>run the server</h2>
<p>
	yaebal ships its own server image, built from
	<a href="https://github.com/tdlib/telegram-bot-api" target="_blank" rel="noreferrer">tdlib/telegram-bot-api</a>
	source in the
	<a href="https://github.com/neverlane/yaebal/tree/master/docker/telegram-bot-api" target="_blank" rel="noreferrer">yaebal repo</a>
	and rebuilt automatically when upstream moves. multi-arch (amd64/arm64), runs as non-root,
	healthcheck included. also on docker hub as <code>neverlane/telegram-bot-api</code>.
</p>
<Code code={compose} title="docker-compose.yml" lang="yaml" />
<p>
	<code>latest</code> tracks upstream master; every build is also tagged
	<code>sha-&lt;12&gt;</code> with the upstream commit it was built from — pin that in
	production.
</p>

<h2>switch a bot token</h2>
<p>
	a bot token is logged in either to the cloud api or to your server, never both. call
	<code>logOut</code> once, while <code>apiRoot</code> still points at the cloud api:
</p>
<Code code={logout} title="migrate.ts" />

<h2>connect yaebal</h2>
<p>
	<code>apiRoot</code> is the root before <code>/bot&lt;token&gt;/method</code>. nothing else
	changes — polling and handlers work as before.
</p>
<Code code={connect} title="bot.ts" />

<h2 id="files-in-local-mode">files in local mode</h2>
<p>
	with <code>TELEGRAM_LOCAL: "1"</code> the server no longer serves file bytes over http:
	<code>getFile</code> returns an absolute path on the server's disk, and
	<code>bot.api.fileUrl()</code> stops being a downloadable link. share the data volume with the
	bot container and read the file directly:
</p>
<Code code={localFile} title="download.ts" />
<p>
	without local mode <code>bot.api.fileUrl()</code> keeps working the cloud way — but so do the
	cloud file-size limits.
</p>

<h2>webhooks</h2>
<p>
	in local mode the server accepts plain http webhook urls on any port — handy when the bot and
	the server share a compose network (<code>setWebhook</code> to
	<code>http://bot:3000/webhook</code>, no tls termination needed). the handler side is the same
	as always: <a href="/docs/webhooks">webhooks &amp; deploy</a>.
</p>

<h2>production notes</h2>
<ul>
	<li>pin the image by its <code>sha-&lt;12&gt;</code> tag instead of <code>latest</code>.</li>
	<li>
		keep the bot and the server in the same private network and never expose port 8081 publicly —
		requests are authenticated only by the bot token.
	</li>
	<li>
		port 8082 answers with server stats — useful for monitoring and the container healthcheck,
		keep it private too.
	</li>
	<li>do not log file urls: they contain the bot token.</li>
	<li>
		mount persistent storage for <code>/var/lib/telegram-bot-api</code> — the server keeps
		downloaded files there, so watch disk usage and clean up old files.
	</li>
	<li>serve downloads through your own authenticated endpoint if users need links.</li>
</ul>
