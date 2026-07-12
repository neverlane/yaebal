<script lang="ts">
	import Code from "$lib/Code.svelte";
	import CodeTabs from "$lib/CodeTabs.svelte";
	import Try from "$lib/Try.svelte";

	const scaffoldTabs = [
		{ label: "pnpm", code: "pnpm create yaebal" },
		{ label: "npm", code: "npm create yaebal@latest" },
		{ label: "yarn", code: "yarn create yaebal" },
		{ label: "bun", code: "bun create yaebal" },
		{ label: "deno", code: "deno run -A npm:create-yaebal@latest" },
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

	const runTabsWindows = [
		{ label: "powershell", code: '$env:BOT_TOKEN="123:abc"; pnpm tsx bot.ts' },
		{ label: "cmd", code: "set BOT_TOKEN=123:abc && pnpm tsx bot.ts" },
	];

	const env = `BOT_TOKEN=123456789:replace_me
WEBHOOK_SECRET=change_this_before_deploy`;

	const envLoad = `# bun and deno load .env automatically. node needs an explicit flag:
node --env-file=.env dist/bot.js
tsx --env-file=.env bot.ts`;

	const testInstallTabs = [
		{ label: "pnpm", code: "pnpm add -D @yaebal/test vitest" },
		{ label: "npm", code: "npm install -D @yaebal/test vitest" },
		{ label: "yarn", code: "yarn add -D @yaebal/test vitest" },
		{ label: "bun", code: "bun add -d @yaebal/test vitest" },
		{ label: "deno", code: "deno add -D npm:@yaebal/test npm:vitest" },
	];

	const split = `// bot.ts — export the bot, but don't call start() here. that keeps this
// module import-safe: tests (and any other tool) can load it without opening
// a real connection to Telegram.
import { createBot } from "yaebal";

export const bot = createBot(process.env.BOT_TOKEN!);

bot.command("start", (ctx) => ctx.reply("hello from yaebal"));
bot.on("message:text", (ctx) => ctx.reply("you said: " + ctx.text));`;

	const main = `// main.ts — the entrypoint you actually run.
import { bot } from "./bot.js";

await bot.start();`;

	const test = `import { createTestEnv } from "@yaebal/test";
import { expect, test } from "vitest";
import { bot } from "./bot.js";

test("/start replies", async () => {
  const env = createTestEnv(bot);
  const user = env.createUser({ firstName: "linia" });

  await user.sendCommand("start");

  expect(env.lastApiCall("sendMessage")?.params?.text).toBe("hello from yaebal");
});`;

	const webhook = `import { webhook } from "yaebal";
import { bot } from "./bot.js";

// any fetch-style runtime: bun, deno, cloudflare workers, vercel edge.
export default {
  fetch: webhook(bot, { secretToken: process.env.WEBHOOK_SECRET }),
};`;

	const deployTabs = [
		{ label: "node", code: "pnpm build\nBOT_TOKEN=123:abc node dist/main.js" },
		{ label: "bun", code: "BOT_TOKEN=123:abc bun main.ts" },
		{ label: "deno", code: "BOT_TOKEN=123:abc deno run --allow-env --allow-net main.ts" },
		{ label: "cloudflare", code: "wrangler deploy" },
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
	open <a href="https://t.me/BotFather" target="_blank" rel="noreferrer">@BotFather</a>, send
	<code>/newbot</code>, pick a name and username, then copy the token. keep it out of git.
</p>

<h2>2. scaffold or install</h2>
<p>for a real project, scaffold. for a scratch file, install the meta package directly.</p>
<CodeTabs tabs={scaffoldTabs} title="scaffold" />
<CodeTabs tabs={installTabs} title="install" />

<h2>3. set environment variables</h2>
<p>use your runtime or host secret store. locally, a plain <code>.env</code> is enough.</p>
<Code code={env} title=".env" lang="dotenv" />
<div class="note">
	<strong>loading <code>.env</code>.</strong> bun and deno read it automatically. node needs an
	explicit flag (or a package like <code>dotenv</code>) — see below. the run commands in step 5
	instead pass <code>BOT_TOKEN</code> straight on the command line, which needs no loader at all;
	either approach works, pick one per project.
</div>
<Code code={envLoad} title="terminal" lang="sh" />

<h2>4. your first bot</h2>
<p>
	this example is runnable in the playground and in node/bun/deno. it uses the meta package
	<code>yaebal</code>, so handlers get generated context shortcuts.
</p>
<Try id="getting-started" title="bot.ts" />
<p>
	running it locally should print <code>bot ready</code> to the console once <code>getMe()</code>
	succeeds, and any message you send the bot gets echoed back as <code>you said: …</code>.
</p>

<div class="note">
	<strong>esm only.</strong> yaebal is <code>"type": "module"</code>. use explicit
	<code>.js</code> specifiers for local typescript imports that are compiled to node esm.
</div>

<h2>5. run it</h2>
<CodeTabs tabs={runTabs} title="run" />
<p>on Windows, set the variable in its own step first:</p>
<CodeTabs tabs={runTabsWindows} title="run (windows)" />

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
	as a bot grows past a single file, split the bot's definition from the entrypoint that starts it:
	a module that calls <code>bot.start()</code> as a side effect can't be safely <code>import</code>ed
	by a test.
</p>
<Code code={split} title="bot.ts" />
<Code code={main} title="main.ts" />
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
