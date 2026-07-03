<script lang="ts">
	import Code from "$lib/Code.svelte";

	const files = `https://yaebal.pages.dev/llms.txt
https://yaebal.pages.dev/llms-full.txt`;

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
	<title>llms — yaebal</title>
</svelte:head>

<h1>llms</h1>
<p class="lead">
	llm-friendly entry points for ai coding assistants working with yaebal projects.
</p>

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
	if you are using an assistant that accepts project instructions, give it this baseline before it
	writes yaebal code:
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
	<strong>for maintainers.</strong> when public apis change, update <code>/llms.txt</code>,
	<code>/llms-full.txt</code>, and the examples linked here in the same pr. if llm guidance drifts,
	assistants will confidently generate wrong code.
</div>
