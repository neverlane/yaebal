<script lang="ts">
	import Code from "$lib/Code.svelte";

	const create = `pnpm create yaebal
# or: npm create yaebal@latest · bun create yaebal · deno run -A npm:create-yaebal`;

	const flags = `# non-interactive — pass everything up front
pnpm create yaebal my-bot --runtime bun --template commands --plugins session,again,fmt

# webhook bot, deployed to cloudflare workers, with a ci workflow
pnpm create yaebal my-bot -t webhook -d cloudflare --ci --yes

# take every default, no questions (great for ci / scripts)
pnpm create yaebal my-bot --yes

# pull in the entire plugin catalog
pnpm create yaebal my-bot --plugins all --no-install`;

	const options = `name                                  the project (folder) name
-r, --runtime <node|bun|deno>         target runtime          (default: detected)
-m, --pm <npm|pnpm|yarn|bun|deno>     package manager         (default: detected)
-t, --template <name>                 minimal · echo · commands · buttons ·
                                      conversation · i18n · session-counter ·
                                      webhook · runner · rich-message · broadcast ·
                                      toml · plugin
-p, --plugins <a,b | all | none>      comma list of @yaebal plugins
-d, --deploy <target>                 none · docker · compose · fly · railway ·
                                      cloudflare · vercel
    --ci / --no-ci                     add a github actions ci workflow
    --git / --no-git                   initialise a git repo (+ first commit)
    --install / --no-install           install dependencies after scaffolding
    --tui / --no-tui                   force the interactive ui on/off
-c, --config <path>                   read defaults from a config file
    --no-config                        skip config-file autodetect
-y, --yes                             accept defaults, no prompts
    --json                             print the result as json (with --yes)
-h, --help · -v, --version`;

	const config = `{
  "runtime": "bun",
  "template": "commands",
  "plugins": ["session", "again", "fmt"],
  "deploy": "cloudflare",
  "ci": true
}`;

	const generated = `my-bot/
  package.json        # scripts for your runtime, @yaebal deps
  tsconfig.json       # strict, esm, nodenext, noUncheckedIndexedAccess
  src/index.ts        # a working bot, wired with the plugins you picked
  .env.example        # BOT_TOKEN= (+ SECRET_TOKEN= for a serverless deploy)
  .gitignore
  README.md
  # + whatever --deploy / --ci add: Dockerfile, wrangler.jsonc, api/bot.ts, .github/workflows/ci.yml…`;

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
	codes. it walks seven steps: <em>name → template → runtime → package manager → plugins → deploy →
	review</em>, with a text input, single-selects and a scrollable multi-select; everything is one
	key away. picking the <code>plugin</code> template skips runtime, plugins and deploy entirely —
	none of them apply to a plugin package.
</p>
<table>
	<thead>
		<tr><th>key</th><th>does</th></tr>
	</thead>
	<tbody>
		<tr><td><code>↑ / ↓</code></td><td>move within a list</td></tr>
		<tr><td><code>enter</code></td><td>confirm the step / create the project</td></tr>
		<tr><td><code>space</code></td><td>toggle a plugin (or a git/install/ci switch)</td></tr>
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
	deno, no flags, no prebuilt binaries. the only requirement is an interactive terminal. it also
	repaints cleanly on a terminal resize, and always restores your cursor/raw-mode/screen — even if
	the process is killed outright rather than exited through a keypress.
</p>

<h2>flags mode</h2>
<p>
	pass any answer as a flag and the wizard skips that question; pass <code>--yes</code> and it skips
	all of them. this is the path to use in scripts and ci. a flag given a missing or invalid value
	(<code>--runtime</code> with no value, <code>--runtime rust</code>) is reported as a warning
	instead of silently swallowing whatever comes after it on the command line.
</p>
<Code code={flags} title="terminal" lang="sh" />
<Code code={options} title="options" lang="text" />

<h2>config file</h2>
<p>
	drop a <code>create-yaebal.json</code> next to where you run the command — or add a
	<code>"create-yaebal"</code> key to a local <code>package.json</code> — to pre-fill any answer.
	cli flags always win; the file only fills in what a flag left unset.
</p>
<Code code={config} title="create-yaebal.json" lang="json" />

<h2>templates</h2>
<p>
	a template is more than a bot body — it pulls in the plugins it needs, adds the real imports and
	wiring, and (for <code>webhook</code> / <code>runner</code>) even swaps the bootstrap. everything a
	template generates type-checks against the real <code>@yaebal/*</code> apis — enforced by a
	compile smoke test that renders every template, every deploy target and the full plugin catalog
	against the workspace packages.
</p>
<table>
	<thead>
		<tr><th>template</th><th>what you get</th></tr>
	</thead>
	<tbody>
		<tr><td><code>minimal</code></td><td>just <code>/start</code> + a text echo</td></tr>
		<tr><td><code>echo</code></td><td>echo text, photos and stickers back</td></tr>
		<tr><td><code>commands</code></td><td><code>/start /help /ping</code> via a typed registry + synced <code>/</code> menu (commands)</td></tr>
		<tr><td><code>buttons</code></td><td>inline keyboard + typed <code>callback_data</code> (keyboard, callback-data)</td></tr>
		<tr><td><code>conversation</code></td><td>await-style multi-step dialog (conversation)</td></tr>
		<tr><td><code>i18n</code></td><td>multi-language bot with a <code>/lang</code> toggle (i18n)</td></tr>
		<tr><td><code>session-counter</code></td><td>per-chat counter on <code>ctx.session</code> (session)</td></tr>
		<tr><td><code>webhook</code></td><td>edge/serverless deploy via <code>serve()</code> (web)</td></tr>
		<tr><td><code>runner</code></td><td>concurrent long-polling via <code>run()</code> (runner)</td></tr>
		<tr><td><code>rich-message</code></td><td><code>sendRichMessage</code> block builder + a streaming draft demo (rich)</td></tr>
		<tr><td><code>broadcast</code></td><td>subscriber list + typed broadcast jobs (broadcast)</td></tr>
		<tr><td><code>toml</code></td><td>declarative routes in <code>bot.toml</code> + a handler registry (toml)</td></tr>
		<tr><td><code>plugin</code></td><td>reusable plugin package with <code>src</code>, tests and examples</td></tr>
	</tbody>
</table>
<p>plugins listed in brackets are added and wired automatically — on top of anything you pick yourself.</p>

<h2>deploy targets</h2>
<p>
	orthogonal to the template — pick one with <code>-d/--deploy</code> or on the wizard's
	<strong>deploy</strong> step (not offered for <code>--template plugin</code>, which has nowhere to
	deploy). <code>docker</code>/<code>compose</code>/<code>fly</code>/<code>railway</code> all run the
	same long-polling bot you'd run locally, just containerized — a single-stage <code>Dockerfile</code>
	matching your runtime, since these templates run straight from <code>.ts</code> with no build step.
	<code>cloudflare</code> and <code>vercel</code> are serverless: they take over the bootstrap the same
	way the <code>webhook</code>/<code>runner</code> templates already replace <code>bot.start()</code>,
	adding <code>@yaebal/web</code> and a <code>SECRET_TOKEN</code> to <code>.env.example</code>.
</p>
<table>
	<thead>
		<tr><th>target</th><th>adds</th></tr>
	</thead>
	<tbody>
		<tr><td><code>none</code></td><td>nothing — deploy however you like</td></tr>
		<tr><td><code>docker</code></td><td>a <code>Dockerfile</code> + <code>.dockerignore</code></td></tr>
		<tr><td><code>compose</code></td><td><code>docker</code> + <code>compose.yaml</code> for a local/vps run</td></tr>
		<tr><td><code>fly</code></td><td><code>docker</code> + <code>fly.toml</code></td></tr>
		<tr><td><code>railway</code></td><td><code>docker</code> + <code>railway.json</code></td></tr>
		<tr><td><code>cloudflare</code></td><td><code>wrangler.jsonc</code> — <code>export default {'{'} fetch: cloudflareAdapter(bot) {'}'}</code>, no server to run</td></tr>
		<tr><td><code>vercel</code></td><td><code>vercel.json</code> + <code>api/bot.ts</code> — an edge function via <code>webhook()</code>, alongside the normal polling <code>src/index.ts</code></td></tr>
	</tbody>
</table>
<p>
	<code>--ci</code> is independent of deploy: it adds a github actions workflow that installs and
	typechecks on every push (plugin packages get <code>test</code>/<code>build</code> too).
</p>

<h2>plugins</h2>
<p>
	every published, bot-installable <code>@yaebal/*</code> plugin is offered — enforced by a test
	that diffs the catalog against the packages in the workspace. the ones with a clean default wiring
	(<code>session</code>, <code>again</code>, <code>throttle</code>, <code>ratelimiter</code>,
	<code>i18n</code>, <code>files</code>, <code>prompt</code>, <code>split</code>, …) are dropped
	straight into the bot chain; the rest are added to <code>package.json</code> with a commented
	import so the starter always type-checks — you wire them in when you need them.
	<code>analytics</code> and <code>feature-flags</code> also leave a commented-out showcase of their
	other real adapters (posthog/plausible/sqlite/clickhouse, launchdarkly/growthbook) right next to
	the wired default.
</p>

<h2>what you get</h2>
<Code code={generated} title="structure" lang="text" />
<p>a minimal run, generated from <code>--template minimal</code> with session + again:</p>
<Code code={result} title="src/index.ts" lang="ts" />

<h2>then</h2>
<Code code={next} title="terminal" lang="sh" />
<p>
	swap <code>pnpm</code> for whatever you chose — the printed next-steps already use your package
	manager. drop your <code>BOT_TOKEN</code> into <code>.env</code> and you're live. package names
	can be scoped (<code>@your-org/my-plugin</code>) — the folder created is the unscoped part.
</p>
