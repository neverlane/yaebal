<script lang="ts">
	import Code from "$lib/Code.svelte";

	const create = `pnpm create yaebal
# or: npm create yaebal@latest · bun create yaebal · deno run -A npm:create-yaebal`;

	const flags = `# non-interactive — pass everything up front
pnpm create yaebal my-bot --runtime bun --template commands --plugins session,again,fmt

# take every default, no questions (great for ci / scripts)
pnpm create yaebal my-bot --yes

# pull in the entire plugin catalog
pnpm create yaebal my-bot --plugins all --no-install`;

	const options = `name                                  the project (folder) name
-r, --runtime <node|bun|deno>         target runtime          (default: detected)
-m, --pm <npm|pnpm|yarn|bun|deno>     package manager         (default: detected)
-t, --template <name>                 minimal · echo · commands · buttons ·
                                      conversation · i18n · session-counter ·
                                      webhook · runner · rich-message
-p, --plugins <a,b | all | none>      comma list of @yaebal plugins
    --git / --no-git                  initialise a git repo (+ first commit)
    --install / --no-install          install dependencies after scaffolding
    --tui / --no-tui                  force the interactive ui on/off
-y, --yes                             accept defaults, no prompts
-h, --help · -v, --version`;

	const generated = `my-bot/
  package.json        # scripts for your runtime, @yaebal deps
  tsconfig.json       # strict, esm, nodenext, noUncheckedIndexedAccess
  src/index.ts        # a working bot, wired with the plugins you picked
  .env.example        # BOT_TOKEN=
  .gitignore
  README.md`;

	const result = `import { Bot } from "@yaebal/core";
import { session } from "@yaebal/session";
import { autoRetry } from "@yaebal/again";

const token = process.env.BOT_TOKEN;
if (!token) {
  console.error("✗ set BOT_TOKEN in your environment (copy .env.example → .env)");
  process.exit(1);
}

const bot = new Bot(token)
  .install(session({ initial: () => ({ count: 0 }) }));

bot.command("start", (ctx) => ctx.reply("hello! i'm a yaebal bot 🤖"));
bot.on("message:text", (ctx) => ctx.reply(ctx.text));

// transformers applied to the outgoing api
autoRetry(bot.api);

await bot.start();`;

	const next = `cd my-bot
pnpm install
# add your BOT_TOKEN to .env
pnpm dev`;
</script>

<svelte:head>
	<title>create a bot — yaebal</title>
</svelte:head>

<h1>create a bot</h1>
<p class="lead">
	<code>create-yaebal</code> scaffolds a ready-to-run bot — a beautiful terminal ui when your
	terminal supports it, plain prompts when it doesn't, and a one-shot flags mode for ci.
</p>

<h2>scaffold</h2>
<p>
	run it with your package manager's <code>create</code> shortcut. it works the same under node,
	bun and deno — the runtime that launches it is just the default, you can pick any target.
</p>
<Code code={create} title="terminal" lang="sh" />

<h2>the interactive ui</h2>
<p>
	in a real terminal you get a centred, keyboard-driven wizard rendered with pure ansi — no react,
	no solid, <strong>no native dependencies</strong>, just <code>node:readline</code> and escape
	codes. it walks six steps: <em>name → runtime → package manager → template → plugins → review</em>,
	with a text input, single-selects and a scrollable multi-select; everything is one key away.
</p>
<table>
	<thead>
		<tr><th>key</th><th>does</th></tr>
	</thead>
	<tbody>
		<tr><td><code>↑ / ↓</code></td><td>move within a list</td></tr>
		<tr><td><code>enter</code></td><td>confirm the step / create the project</td></tr>
		<tr><td><code>space</code></td><td>toggle a plugin (or a git/install switch)</td></tr>
		<tr><td><code>a</code> / <code>n</code></td><td>select all / none on the plugins step</td></tr>
		<tr><td><code>←</code></td><td>go back a step</td></tr>
		<tr><td><code>esc</code></td><td>back, or cancel on the first step</td></tr>
	</tbody>
</table>
<p>
	if the terminal can't host a ui — piped output, <code>CI</code>, a dumb terminal, or
	<code>--no-tui</code> — it transparently falls back to plain one-line prompts (and, failing that,
	to defaults). nothing about the output changes; only how you answer does.
</p>
<p>
	because it's pure ansi, the ui runs <strong>everywhere out of the box</strong> — node 20+, bun and
	deno, no flags, no prebuilt binaries. the only requirement is an interactive terminal.
</p>

<h2>flags mode</h2>
<p>
	pass any answer as a flag and the wizard skips that question; pass <code>--yes</code> and it skips
	all of them. this is the path to use in scripts and ci.
</p>
<Code code={flags} title="terminal" lang="sh" />
<Code code={options} title="options" lang="text" />

<h2>templates</h2>
<p>
	a template is more than a bot body — it pulls in the plugins it needs, adds the real imports and
	wiring, and (for <code>webhook</code> / <code>runner</code>) even swaps the bootstrap. everything a
	template generates type-checks against the real <code>@yaebal/*</code> apis.
</p>
<table>
	<thead>
		<tr><th>template</th><th>what you get</th></tr>
	</thead>
	<tbody>
		<tr><td><code>minimal</code></td><td>just <code>/start</code> + a text echo</td></tr>
		<tr><td><code>echo</code></td><td>echo text, photos and stickers back</td></tr>
		<tr><td><code>commands</code></td><td><code>/start /help /ping</code> with a command menu</td></tr>
		<tr><td><code>buttons</code></td><td>inline keyboard + typed <code>callback_data</code> (keyboard, callback-data)</td></tr>
		<tr><td><code>conversation</code></td><td>await-style multi-step dialog (conversation)</td></tr>
		<tr><td><code>i18n</code></td><td>multi-language bot with a <code>/lang</code> toggle (i18n)</td></tr>
		<tr><td><code>session-counter</code></td><td>per-chat counter on <code>ctx.session</code> (session)</td></tr>
		<tr><td><code>webhook</code></td><td>edge/serverless deploy via <code>serve()</code> (web)</td></tr>
		<tr><td><code>runner</code></td><td>concurrent long-polling via <code>run()</code> (runner)</td></tr>
		<tr><td><code>rich-message</code></td><td><code>sendRichMessage</code> block builder + a streaming draft demo (rich)</td></tr>
	</tbody>
</table>
<p>plugins listed in brackets are added and wired automatically — on top of anything you pick yourself.</p>

<h2>plugins</h2>
<p>
	every published <code>@yaebal/*</code> plugin is offered. the ones with a clean default wiring
	(<code>session</code>, <code>again</code>, <code>throttle</code>, <code>ratelimiter</code>,
	<code>i18n</code>, <code>files</code>, <code>prompt</code>) are dropped straight into the bot
	chain; the rest are added to <code>package.json</code> with a commented import so the starter
	always type-checks — you wire them in when you need them.
</p>

<h2>what you get</h2>
<Code code={generated} title="structure" lang="text" />
<p>a minimal run, generated from <code>--template minimal</code> with session + again:</p>
<Code code={result} title="src/index.ts" lang="ts" />

<h2>then</h2>
<Code code={next} title="terminal" lang="sh" />
<p>
	swap <code>pnpm</code> for whatever you chose — the printed next-steps already use your package
	manager. drop your <code>BOT_TOKEN</code> into <code>.env</code> and you're live.
</p>
