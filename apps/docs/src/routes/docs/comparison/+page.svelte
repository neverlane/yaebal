<script lang="ts">
	import Code from "$lib/Code.svelte";
	import Try from "$lib/Try.svelte";

	const yaebal = `const bot = createBot(token)
  .install(session({ initial: () => ({ count: 0 }) }))
  .derive(async (ctx) => ({ user: await loadUser(ctx.from?.id) }))
  .on("message:text", (ctx) => {
    ctx.session.count;
    ctx.user;
    ctx.text;
    ctx.react("🔥");
  });`;
</script>

<svelte:head><title>comparison — yaebal</title></svelte:head>

<h1>comparison</h1>
<p class="lead">
	a neutral map of popular telegram bot libraries. the short version: choose yaebal when you want
	type flow, generated contexts, first-party plugins and production tooling in one stack.
</p>

<h2>summary</h2>
<table>
	<thead><tr><th>library</th><th>best at</th><th>tradeoff</th></tr></thead>
	<tbody>
		<tr><td>yaebal</td><td>type-accumulating composer, generated context shortcuts, first-party plugins, playground, tests</td><td>newer ecosystem</td></tr>
		<tr><td>gramio</td><td>chainable composer, mature docs, scaffolding, changelog/upgrade flow</td><td>context shortcuts are more hand-maintained</td></tr>
		<tr><td>puregram</td><td>thin wrapper, generated update classes, clear api layering</td><td>less framework structure in core by design</td></tr>
		<tr><td>grammy</td><td>large ecosystem, stable middleware model, filter queries</td><td>context flavoring often relies on explicit typing patterns</td></tr>
		<tr><td>telegraf</td><td>familiar and widely used</td><td>weaker type-driven plugin dependency model</td></tr>
	</tbody>
</table>

<h2>why yaebal</h2>
<Code code={yaebal} title="typed-chain.ts" />
<Try id="filters-router" title="feature-routes.ts" />
<ul>
	<li>the bot class extends the composer class, so there is one middleware engine.</li>
	<li><code>derive</code>, <code>decorate</code>, <code>install</code> and <code>extend</code> carry context types forward.</li>
	<li>plugin dependencies are explicit and type-checked.</li>
	<li>generated contexts add schema-derived shortcuts such as <code>ctx.react()</code>.</li>
	<li><code>@yaebal/test</code> gives virtual users/chats and intercepted api calls for ci.</li>
	<li>production packages cover retry, throttling, runner, webhooks, broadcasts and panels.</li>
</ul>

<h2>when another library is reasonable</h2>
<ul>
	<li>choose gramio if your team already uses it and values its current scaffolder/docs workflow more than generated yaebal contexts.</li>
	<li>choose puregram if you explicitly want a thin sdk rather than a framework.</li>
	<li>choose grammy if you need its existing plugin ecosystem today.</li>
	<li>choose telegraf for legacy projects where migration cost dominates type-safety gains.</li>
</ul>

<h2>migration paths</h2>
<ul>
	<li><a href="/docs/migration/gramio/">from gramio</a></li>
	<li><a href="/docs/migration/puregram/">from puregram</a></li>
	<li><a href="/docs/migration/grammy/">from grammy</a></li>
	<li><a href="/docs/migration/telegraf/">from telegraf</a></li>
</ul>
