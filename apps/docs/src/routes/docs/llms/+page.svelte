<script lang="ts">
	import Code from "$lib/Code.svelte";

	const installer = `# interactive — detects which agents live in your project and preselects them
npx @yaebal/ai

# non-interactive — pick agents explicitly (ci, dotfiles, scripts)
npx @yaebal/ai install --agents claude,cursor`;

	const marketplace = `claude plugin marketplace add neverlane/yaebal
claude plugin install yaebal`;

	const mcp = `# stdio launch — what the installer writes into .mcp.json and friends
npx -y @yaebal/ai mcp`;

	const mcpJson = `{
	"mcpServers": {
		"yaebal": {
			"command": "npx",
			"args": ["-y", "@yaebal/ai", "mcp"]
		}
	}
}`;

	const files = `https://yaebal.mom/llms.txt
https://yaebal.mom/llms-full.txt`;

	const prompt = `use yaebal as an esm typescript telegram bot api framework.
prefer createBot() from "yaebal" for app code.
context type flows through .derive(), .decorate(), .install(), and .extend().
use on("message:text") for typed text-message handlers.
use @yaebal/test for tests instead of hitting telegram in ci.`;

	const lookup = `// canonical docs entry points for agents
/docs/getting-started/
/docs/core/
/docs/context/
/docs/plugins/
/docs/api/
/docs/troubleshooting/
/docs/production/`;
</script>

<svelte:head>
	<title>ai tooling — yaebal</title>
</svelte:head>

<h1>ai tooling</h1>
<p class="lead">
	<code>@yaebal/ai</code> ships the dev tooling that makes ai coding assistants good at yaebal: a
	one-command installer that teaches your agents the framework, an mcp server with the exact bot
	api schema, and agent playbooks for the recurring bot-building tasks. the same package also
	contains the <a href="/docs/plugins/ai/">runtime plugin</a> (<code>ctx.ai</code>, streamed llm
	replies) — that side has its own page.
</p>

<h2>one-command setup</h2>
<p>
	run the installer in your bot project. it detects which agents you use (from
	<code>.claude/</code>, <code>.cursor/</code>, <code>AGENTS.md</code>, …), lets you pick, and
	writes the right rules files and mcp config for each:
</p>
<Code code={installer} lang="sh" title="terminal" />

<h2>supported agents</h2>
<p>nine targets; each gets the files its ecosystem expects:</p>
<table>
	<thead>
		<tr><th>agent</th><th><code>--agents</code> id</th><th>what the installer writes</th></tr>
	</thead>
	<tbody>
		<tr><td>claude code</td><td><code>claude</code></td><td>skills into <code>.claude/skills/&lt;name&gt;/SKILL.md</code> + a <code>yaebal</code> server in <code>.mcp.json</code></td></tr>
		<tr><td>cursor</td><td><code>cursor</code></td><td><code>.cursor/rules/yaebal.mdc</code> (always-apply) + <code>.cursor/mcp.json</code></td></tr>
		<tr><td>codex</td><td><code>codex</code></td><td>yaebal section in <code>AGENTS.md</code>; mcp is global — a note shows the <code>~/.codex/config.toml</code> entry</td></tr>
		<tr><td>opencode</td><td><code>opencode</code></td><td>yaebal section in <code>AGENTS.md</code> + <code>opencode.json</code> mcp entry</td></tr>
		<tr><td>github copilot</td><td><code>copilot</code></td><td><code>.github/copilot-instructions.md</code> + <code>.vscode/mcp.json</code></td></tr>
		<tr><td>windsurf</td><td><code>windsurf</code></td><td><code>.windsurf/rules/yaebal.md</code>; mcp is global — a note shows the cascade settings entry</td></tr>
		<tr><td>zed</td><td><code>zed</code></td><td>yaebal section in <code>.rules</code>; a note shows the <code>context_servers</code> settings entry</td></tr>
		<tr><td>gemini cli</td><td><code>gemini</code></td><td>yaebal section in <code>GEMINI.md</code> + <code>.gemini/settings.json</code> mcp entry</td></tr>
		<tr><td>anything else</td><td><code>agents-md</code></td><td>yaebal section in a generic <code>AGENTS.md</code></td></tr>
	</tbody>
</table>
<p>
	existing files are merged, never clobbered: markdown gets an upserted yaebal section, json
	configs get a <code>yaebal</code> entry with everything else preserved (an unparseable config is
	left alone with a manual note instead).
</p>

<h3>claude code marketplace</h3>
<p>
	claude code users can skip the installer entirely — the plugin marketplace delivers the skills
	and the mcp server as one managed, updatable plugin:
</p>
<Code code={marketplace} lang="sh" title="terminal" />

<h2>the mcp server</h2>
<p>
	the mcp server gives agents exact answers instead of guesses — the full bot api schema (the same
	<code>schema.json</code> that generates <code>@yaebal/types</code>), the plugin catalog, docs
	search and runnable examples. it runs over stdio:
</p>
<Code code={mcp} lang="sh" title="terminal" />
<Code code={mcpJson} lang="json" title=".mcp.json" />
<table>
	<thead>
		<tr><th>tool</th><th>what it answers</th></tr>
	</thead>
	<tbody>
		<tr><td><code>get_api_method</code></td><td>exact signature of a bot api method — parameters, required flags, return type</td></tr>
		<tr><td><code>get_api_type</code></td><td>exact shape of a bot api object, e.g. <code>Message</code>, <code>InlineKeyboardMarkup</code></td></tr>
		<tr><td><code>list_plugins</code></td><td>the full <code>@yaebal/*</code> plugin catalog with one-line descriptions</td></tr>
		<tr><td><code>get_plugin_doc</code></td><td>full readme of a <code>@yaebal/*</code> package — usage, options, what lands on ctx</td></tr>
		<tr><td><code>search_docs</code></td><td>full-text search over the docs, plugin readmes and agent playbooks</td></tr>
		<tr><td><code>get_example</code></td><td>complete runnable example bots from the repo — list all, or fetch one by name</td></tr>
	</tbody>
</table>

<h2>shipped skills</h2>
<p>
	nine playbooks travel with the installer — verbatim claude code skills, converted into cursor
	rules and <code>AGENTS.md</code> sections for the others. each teaches one recurring task in a
	bot project:
</p>
<ul>
	<li><code>yaebal-write-bot</code> — bot setup, handlers, filter queries, commands, context typing</li>
	<li><code>yaebal-pick-plugin</code> — which <code>@yaebal/*</code> package solves a given problem</li>
	<li><code>yaebal-keyboards-and-callbacks</code> — keyboard builders and typed callback payloads</li>
	<li><code>yaebal-flows</code> — choosing between scenes, conversation, and prompt, and wiring persistence</li>
	<li><code>yaebal-ai-features</code> — adding llm features with the <a href="/docs/plugins/ai/"><code>@yaebal/ai</code></a> runtime plugin</li>
	<li><code>yaebal-test-bot</code> — <code>@yaebal/test</code> actors, api-call assertions, the virtual clock</li>
	<li><code>yaebal-deploy</code> — long polling vs webhooks, graceful shutdown, error handling</li>
	<li><code>yaebal-debug</code> — install-order type errors, esm specifier errors, telegram 400/409/429</li>
	<li><code>yaebal-author-plugin</code> — the <code>Plugin&lt;In, Out&gt;</code> contract and typed dependencies</li>
</ul>

<h2>machine-readable docs</h2>
<p>
	the site exposes two plain-text files for agents and search tools:
</p>
<Code code={files} title="llm files" lang="text" />
<table>
	<thead><tr><th>file</th><th>purpose</th></tr></thead>
	<tbody>
		<tr><td><a href="/llms.txt"><code>/llms.txt</code></a></td><td>short index of canonical yaebal docs and usage rules</td></tr>
		<tr><td><a href="/llms-full.txt"><code>/llms-full.txt</code></a></td><td>longer framework summary with snippets and package map</td></tr>
	</tbody>
</table>

<h2>agent prompt</h2>
<p>
	if you are using an assistant that accepts project instructions but can't run the installer,
	give it this baseline before it writes yaebal code:
</p>
<Code code={prompt} title="assistant-instructions.txt" lang="text" />

<h2>where an assistant should look first</h2>
<Code code={lookup} title="docs map" lang="text" />

<h2>rules that prevent hallucinations</h2>
<ul>
	<li>use <code>createBot()</code> from <code>yaebal</code> for application examples unless the docs specifically show <code>@yaebal/core</code>.</li>
	<li>use explicit <code>.js</code> extensions in local esm imports in generated projects.</li>
	<li>use <code>bot.install(plugin())</code> for yaebal plugins, not raw <code>use()</code>.</li>
	<li>do not invent callback-data formats; use <a href="/docs/plugins/callback-data/"><code>callbackData()</code></a>.</li>
	<li>do not hit real telegram in tests; use <a href="/docs/plugins/test/"><code>@yaebal/test</code></a>.</li>
	<li>check the generated <a href="/docs/api/">bot api reference</a> for method params and return types.</li>
</ul>

<div class="note">
	<strong>for maintainers.</strong> the agent playbooks live in <code>packages/ai/skills/</code> —
	that directory is the source of truth, and the installer artifacts (bundled skills, rules
	digest, mcp corpus, claude code plugin) regenerate via
	<code>pnpm --filter @yaebal/ai generate</code>. when public apis change, update
	<code>/llms.txt</code>, <code>/llms-full.txt</code>, the skills, and the examples linked here in
	the same pr. if llm guidance drifts, assistants will confidently generate wrong code.
</div>
