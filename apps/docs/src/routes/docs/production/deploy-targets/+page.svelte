<script lang="ts">
	import CodeTabs from "$lib/CodeTabs.svelte";
	import Code from "$lib/Code.svelte";
	import Try from "$lib/Try.svelte";

	const docker = `FROM node:22-alpine
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages ./packages
COPY bot ./bot
RUN corepack enable && pnpm install --frozen-lockfile && pnpm --filter ./bot build
CMD ["node", "bot/dist/index.js"]`;

	const systemd = `[Unit]
Description=yaebal bot
After=network-online.target

[Service]
WorkingDirectory=/srv/my-bot
EnvironmentFile=/srv/my-bot/.env
ExecStart=/usr/bin/node dist/index.js
Restart=always
RestartSec=5
User=yaebal

[Install]
WantedBy=multi-user.target`;

	const worker = `import { createBot, webhook } from "yaebal";

export default {
  async fetch(request: Request, env: Env) {
    const bot = createBot(env.BOT_TOKEN);
    bot.command("start", (ctx) => ctx.reply("edge ready"));
    return webhook(bot, { secretToken: env.WEBHOOK_SECRET })(request);
  },
};`;

	const targets = [
		{ label: "docker", code: "docker build -t my-bot .\ndocker run --env-file .env my-bot" },
		{ label: "systemd", code: "sudo systemctl enable --now my-bot\nsudo journalctl -u my-bot -f" },
		{ label: "fly", code: "fly launch\nfly secrets set BOT_TOKEN=... WEBHOOK_SECRET=...\nfly deploy" },
		{ label: "railway", code: "railway init\nrailway variables set BOT_TOKEN=... WEBHOOK_SECRET=...\nrailway up" },
		{ label: "vercel", code: "vercel env add BOT_TOKEN\nvercel env add WEBHOOK_SECRET\nvercel deploy --prod" },
		{ label: "cloudflare", code: "wrangler secret put BOT_TOKEN\nwrangler secret put WEBHOOK_SECRET\nwrangler deploy" },
	];
</script>

<svelte:head><title>deploy targets — yaebal</title></svelte:head>

<h1>deploy targets</h1>
<p class="lead">pick polling for stable servers, webhooks for serverless and edge.</p>

<h2>commands</h2>
<CodeTabs tabs={targets} title="deploy targets" />

<h2>docker</h2>
<p>docker is the most portable polling deployment. run exactly one polling process per bot token.</p>
<Code code={docker} title="dockerfile" lang="dockerfile" />

<h2>systemd</h2>
<p>for a single vps, systemd gives restart, logs and simple secret loading.</p>
<Code code={systemd} title="my-bot.service" lang="ini" />

<h2>edge webhook</h2>
<p>
	cloudflare workers, vercel edge and deno deploy should use a fetch-style webhook. keep startup work
	cheap; build heavy clients outside hot paths only when the platform keeps isolates warm.
</p>
<Code code={worker} title="worker.ts" />
<Try id="webhook-ready" title="webhook.ts" />

<h2>target matrix</h2>
<table>
	<thead><tr><th>target</th><th>best mode</th><th>watch out for</th></tr></thead>
	<tbody>
		<tr><td>vps/systemd</td><td>polling or webhook</td><td>process restarts, logs, token rotation</td></tr>
		<tr><td>docker/fly/railway</td><td>polling for workers, webhook for http apps</td><td>one polling replica per token</td></tr>
		<tr><td>vercel/cloudflare/deno deploy</td><td>webhook</td><td>no filesystem, request timeout, cold starts</td></tr>
		<tr><td>kubernetes</td><td>webhook or single polling leader</td><td>leader election, graceful shutdown, readiness</td></tr>
	</tbody>
</table>
