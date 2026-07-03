<script lang="ts">
	import Code from "$lib/Code.svelte";

	const install = `pnpm add yaebal
# or minimal core only:
pnpm add @yaebal/core`;

	const createBot = `import { createBot } from "yaebal";

const bot = createBot(process.env.BOT_TOKEN!);`;
</script>

<svelte:head>
	<title>faq — yaebal</title>
</svelte:head>

<h1>faq</h1>
<p class="lead">short answers to the questions people ask before and after choosing yaebal.</p>

<h2>what is yaebal?</h2>
<p>
	yaebal is a typescript telegram bot api framework built around one invariant: the context type
	accumulates through the chain. plugins, <code>derive</code>, <code>decorate</code>, and filter
	queries update what handlers can see without casting.
</p>

<h2>which package should i install?</h2>
<Code code={install} title="terminal" lang="sh" />
<p>
	use <code>yaebal</code> for application code. it wires the core engine, generated rich contexts,
	formatting, keyboard/callback helpers, and the most common plugin exports behind one import. use
	<code>@yaebal/core</code> when you want the smallest dependency surface or are writing framework
	level code.
</p>
<Code code={createBot} title="bot.ts" />

<h2>why <code>createBot()</code> instead of <code>new Bot()</code>?</h2>
<p>
	<code>createBot()</code> installs yaebal's generated rich context factory at runtime. that means
	shortcuts like <code>ctx.react()</code>, <code>ctx.editText()</code>, and update-specific accessors
	are both typed and actually present. <code>new Bot()</code> is still useful when you want to choose
	the context factory yourself.
</p>

<h2>does it support node, bun, deno, and edge runtimes?</h2>
<p>
	yes. core is fetch-first and esm-only. webhook handlers run anywhere with
	<code>Request</code>/<code>Response</code>. some optional packages need platform features: file
	routing needs <code>fs</code>, <code>@yaebal/workers</code> needs worker threads, and sqlite panel
	storage needs node. see <a href="/docs/runtimes/">runtime support</a>.
</p>

<h2>is it esm-only?</h2>
<p>
	yes. use <code>"type": "module"</code>, nodenext-style typescript, and explicit <code>.js</code>
	import specifiers in source when importing local files.
</p>

<h2>how are plugins typed?</h2>
<p>
	a plugin is a typed composer extension. if it adds <code>ctx.session</code>, the returned composer
	knows about it. if it requires another plugin, that requirement is encoded in the input context
	type, so wrong install order becomes a typescript error.
</p>

<h2>when do i use derive vs decorate?</h2>
<table>
	<thead><tr><th>method</th><th>use it for</th></tr></thead>
	<tbody>
		<tr><td><code>derive</code></td><td>async per-update state: current user, request id, permissions, tenant config</td></tr>
		<tr><td><code>decorate</code></td><td>static values: db client, config, services, helpers, version strings</td></tr>
	</tbody>
</table>

<h2>scenes, conversation, or prompt?</h2>
<table>
	<thead><tr><th>need</th><th>package</th></tr></thead>
	<tbody>
		<tr><td>structured multi-step wizard with named state</td><td><a href="/docs/plugins/scenes/"><code>@yaebal/scenes</code></a></td></tr>
		<tr><td>await-style coroutine flow in a handler</td><td><a href="/docs/plugins/conversation/"><code>@yaebal/conversation</code></a></td></tr>
		<tr><td>ask one question and consume the next message</td><td><a href="/docs/plugins/prompt/"><code>@yaebal/prompt</code></a></td></tr>
		<tr><td>first-run product tour with skip/next controls</td><td><a href="/docs/plugins/onboarding/"><code>@yaebal/onboarding</code></a></td></tr>
	</tbody>
</table>

<h2>how do i test a bot?</h2>
<p>
	use <a href="/docs/plugins/test/"><code>@yaebal/test</code></a>. it gives you virtual users and
	chats, intercepted bot api calls, fake timers, webhook request helpers, media updates, payments,
	inline mode, reactions, and callback button interactions.
</p>

<h2>how do i deploy?</h2>
<p>
	for small bots, long polling is fine. for serverless or public production, use webhooks. for high
	throughput polling, use <a href="/docs/runner/"><code>@yaebal/runner</code></a> to process updates
	concurrently while preserving per-chat order.
</p>

<h2>where is the full bot api?</h2>
<p>
	the generated <a href="/docs/api/">bot api reference</a> includes every method and type from the
	schema yaebal ships with. method pages show params, return type, official telegram links, and yaebal
	usage examples.
</p>

<h2>how can i help the project grow?</h2>
<p>
	star the <a href="https://github.com/neverlane/yaebal" target="_blank" rel="noreferrer">github
	repo</a>, ship a small example bot, write a comparison post, share playground links, and open issues
	when docs or apis are confusing. early frameworks grow through concrete examples more than slogans.
</p>
