<script lang="ts">
	import Code from "$lib/Code.svelte";
	import CodeTabs from "$lib/CodeTabs.svelte";
	import Try from "$lib/Try.svelte";

	const scaffoldTabs = [
		{ label: "pnpm", code: "pnpm create yaebal my-bot" },
		{ label: "npm", code: "npm create yaebal@latest my-bot" },
		{ label: "yarn", code: "yarn create yaebal my-bot" },
		{ label: "bun", code: "bun create yaebal my-bot" },
		{ label: "deno", code: "deno run -A npm:create-yaebal@latest my-bot" },
	];

	const installTabs = [
		{ label: "pnpm", code: "pnpm add yaebal" },
		{ label: "npm", code: "npm install yaebal" },
		{ label: "yarn", code: "yarn add yaebal" },
		{ label: "bun", code: "bun add yaebal" },
		{ label: "deno", code: "deno add npm:yaebal" },
	];

	const runTabs = [
		{ label: "pnpm", code: "BOT_TOKEN=123:abc pnpm tsx bot.ts" },
		{ label: "npm", code: "BOT_TOKEN=123:abc npx tsx bot.ts" },
		{ label: "yarn", code: "BOT_TOKEN=123:abc yarn tsx bot.ts" },
		{ label: "bun", code: "BOT_TOKEN=123:abc bun bot.ts" },
		{ label: "deno", code: "BOT_TOKEN=123:abc deno run --allow-env --allow-net bot.ts" },
	];

	const env = `BOT_TOKEN=123456789:replace_me
WEBHOOK_SECRET=change_this_before_deploy`;

	const testInstallTabs = [
		{ label: "pnpm", code: "pnpm add -D @yaebal/test vitest" },
		{ label: "npm", code: "npm install -D @yaebal/test vitest" },
		{ label: "yarn", code: "yarn add -D @yaebal/test vitest" },
		{ label: "bun", code: "bun add -d @yaebal/test vitest" },
		{ label: "deno", code: "deno add -D npm:@yaebal/test npm:vitest" },
	];

	const test = `import { createTestEnv } from "@yaebal/test";
import { expect, test } from "vitest";
import { bot } from "./bot.js";

test("/start replies", async () => {
  const env = createTestEnv(bot);
  const user = env.createUser({ firstName: "linia" });

  await user.sendCommand("start");

  expect(env.lastApiCall("sendMessage")?.params?.text).toContain("pick one");
});`;

	const webhook = `import { webhookCallback } from "@yaebal/core";

// any fetch-style runtime: bun, deno, cloudflare workers, vercel edge.
export default {
	  fetch: webhookCallback(bot, { secretToken: process.env.WEBHOOK_SECRET }),
};`;

	const deployTabs = [
		{ label: "node", code: "pnpm build\nBOT_TOKEN=123:abc node dist/bot.js" },
		{ label: "bun", code: "BOT_TOKEN=123:abc bun bot.ts" },
		{ label: "deno", code: "BOT_TOKEN=123:abc deno run --allow-env --allow-net bot.ts" },
		{ label: "cloudflare", code: "pnpm --filter @yaebal/docs wrangler deploy" },
		{ label: "docker", code: "docker build -t my-bot .\ndocker run --env-file .env my-bot" },
	];
</script>

<svelte:head>
	<title>getting started — yaebal</title>
</svelte:head>

<h1>getting started</h1>
<p class="lead">from botfather to a tested deploy path without learning the whole framework first.</p>

<h2>1. create a bot token</h2>
<p>
	open <a href="https://t.me/BotFather" target="_blank" rel="noreferrer">@botfather</a>, send
	<code>/newbot</code>, pick a name and username, then copy the token. keep it out of git.
</p>

<h2>2. scaffold or install</h2>
<p>for a real project, scaffold. for a scratch file, install the meta package directly.</p>
<CodeTabs tabs={scaffoldTabs} title="scaffold" />
<CodeTabs tabs={installTabs} title="install" />

<h2>3. set environment variables</h2>
<p>use your runtime or host secret store. locally, a plain <code>.env</code> is enough.</p>
<Code code={env} title=".env" lang="dotenv" />

<h2>4. your first bot</h2>
<p>
	this example is runnable in the playground and in node/bun/deno. it uses the meta package
	<code>yaebal</code>, so handlers get generated context shortcuts.
</p>
<Try id="getting-started" title="bot.ts" />

<div class="note">
	<strong>esm only.</strong> yaebal is <code>"type": "module"</code>. use explicit
	<code>.js</code> specifiers for local typescript imports that are compiled to node esm.
</div>

<h2>5. run it</h2>
<CodeTabs tabs={runTabs} title="run" />

<h2>6. add a button</h2>
<p>
	use <code>InlineKeyboard</code> for markup and <code>callbackData()</code> instead of hand-rolled
	string formats.
</p>
<Try id="keyboard-callback" title="button.ts" />

<h2>7. add state</h2>
<p>
	<code>session()</code> adds <code>ctx.session</code> to the downstream context type. no declaration
	merging, no casts.
</p>
<Try id="session-counter" title="session.ts" />

<h2>8. test before deploy</h2>
<p>
	<code>@yaebal/test</code> drives your real bot with virtual users and records outgoing api calls.
	no telegram token is used in ci.
</p>
<CodeTabs tabs={testInstallTabs} title="test install" />
<Code code={test} title="bot.test.ts" />

<h2>9. deploy</h2>
<p>
	start with polling for development. use webhooks for serverless and edge, or
	<a href="/docs/runner/">@yaebal/runner</a> for concurrent long polling under real traffic.
</p>
<Code code={webhook} title="worker.ts" />
<CodeTabs tabs={deployTabs} title="deploy" />

<h2>next</h2>
<ul>
	<li><a href="/docs/core/">core concepts</a> — the composer, derive/decorate, filter queries</li>
	<li><a href="/docs/contexts/">contexts</a> — the auto-generated context layer (the killer feature)</li>
	<li><a href="/docs/plugins/">plugins</a> — sessions, keyboards, scenes, i18n and more</li>
	<li><a href="/docs/production/">production</a> — rate limits, webhooks, queues, secrets and observability</li>
</ul>
