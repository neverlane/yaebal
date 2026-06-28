<script lang="ts">
	import Code from "$lib/Code.svelte";

	const create = `pnpm create yaebal my-bot
# or: npm create yaebal@latest my-bot  ·  bun create yaebal my-bot`;

	const flags = `# non-interactive (CI-friendly) — pass everything as flags:
pnpm create yaebal my-bot --runtime bun --plugins session,again`;

	const generated = `my-bot/
  package.json        # scripts for your runtime, @yaebal deps
  tsconfig.json       # strict, ESM, NodeNext
  src/index.ts        # a working bot, wired with the plugins you picked
  .env.example        # BOT_TOKEN=
  .gitignore
  README.md`;

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
	scaffold a working yaebal bot in one command — pick a runtime and a few plugins, get a wired
	project.
</p>

<h2>scaffold</h2>
<Code code={create} title="terminal" lang="sh" />
<p>
	on a terminal it asks for the project name, runtime (<code>node</code> / <code>bun</code> /
	<code>deno</code>), and plugins. In automation, pass flags instead — no prompts, no hangs:
</p>
<Code code={flags} title="terminal" lang="sh" />

<h2>what you get</h2>
<Code code={generated} title="structure" lang="text" />
<p>
	the generated <code>src/index.ts</code> already wires the plugins you chose — e.g. picking
	<code>session</code> adds <code>.install(session(...))</code>, picking <code>again</code> adds
	<code>autoRetry(bot.api)</code> — plus a <code>/start</code> command and a text echo.
</p>

<h2>then</h2>
<Code code={next} title="terminal" lang="sh" />

<table>
	<thead>
		<tr><th>flag</th><th>values</th></tr>
	</thead>
	<tbody>
		<tr><td><code>--runtime</code> / <code>-r</code></td><td><code>node</code> (default), <code>bun</code>, <code>deno</code></td></tr>
		<tr><td><code>--plugins</code> / <code>-p</code></td><td>comma list of <code>session</code>, <code>ratelimiter</code>, <code>again</code></td></tr>
	</tbody>
</table>
