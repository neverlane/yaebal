<script lang="ts">
	import { BOT_API_VERSION } from "$lib/api/data.generated";
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

	const versions = [
		["yaebal", "0.1.x (pre-1.0)"],
		["grammY", "1.44.x"],
		["gramio", "0.12.x"],
		["puregram", "3.6.x"],
		["telegraf", "4.16.x"],
	];

	const matrix = [
		[
			"type-accumulating context",
			"✅",
			"⚠️",
			"✅",
			"✅",
			"❌",
			"grammY needs a hand-written \"context flavor\" generic to get typed custom properties. gramio's and puregram's own docs both describe the same idea yaebal uses — `.extend(plugin)` accumulates types automatically, no casting — confirmed directly from their docs, not guessed. telegraf typically wants a manually-specified custom context type, a well-known pain point in its own GitHub discussions.",
		],
		[
			"generated per-update context shortcuts",
			"✅",
			"❌",
			"✅",
			"✅",
			"❌",
			"gramio (`@gramio/contexts`) and puregram (its update classes are codegen'd from the schema, ~30 discriminated subclasses) both do this too — yaebal isn't alone here. grammY uses one `Context` class with optional fields instead.",
		],
		[
			"filter queries narrow the type (\"message:text\")",
			"✅",
			"✅",
			"⚠️",
			"✅",
			"❌",
			"grammY popularized this exact colon-delimited pattern — it's the library yaebal credits the idea to. puregram's codegen'd `hasX` predicates and filters narrow types the same way. gramio narrows by event/update name through its composer instead of a colon-delimited query string — a related but different mechanism; we didn't confirm an equivalent to the specific \"message:text\" style. telegraf's `bot.on(...)` doesn't narrow the context type.",
		],
		[
			"plugin dependencies checked before your code even runs",
			"✅ compile time",
			"⚠️",
			"⚠️ compile time (implicit)",
			"⚠️ runtime",
			"❌",
			"yaebal's `Plugin<In, Out>` makes installing a plugin before its dependency a TypeScript error. gramio's own docs warn \"order matters\" for `.extend()` chains — using a not-yet-added property is almost certainly also a compile error there, just via natural type accumulation rather than a plugin declaring its own explicit input requirement. puregram has a named `dependsOn: ['session']` mechanism, but per its own docs it throws `PluginMissingDep` when the installer runs — a runtime check, not a type error. we found no equivalent in grammY or telegraf.",
		],
		[
			"first-party test framework",
			"✅",
			"⚠️",
			"✅",
			"❌",
			"❌",
			"@yaebal/test and GramIO's own `@gramio/test` are close equivalents — both wrap the bot, give you virtual users/chats (`createUser`/`createChat`), intercept outgoing api calls, and let you mock responses (`onApi`) without a real network call. grammY documents test hooks but, by its own community's account, no dedicated test framework exists yet. we found no first-party equivalent for puregram or telegraf.",
		],
		[
			"official concurrent runner (ordered per chat)",
			"✅",
			"✅",
			"⚠️",
			"✅ built in",
			"⚠️",
			"@grammyjs/runner scales across multiple workers on separate cores, with `sequentialize` enforcing per-chat order — a mature, well-documented equivalent to @yaebal/runner. puregram bakes the same idea into its own polling transport: a `concurrency` limit plus `sequentializeBy`, no separate plugin needed. we found no first-party equivalent documented for gramio or telegraf (community middleware may exist for either).",
		],
		[
			"official scaffolding CLI",
			"✅",
			"✅",
			"✅",
			"❌",
			"✅",
			"create-yaebal, @grammyjs/create-grammy, create-gramio and telegraf's own create-bot are all official, maintained scaffolders. we found no equivalent for puregram.",
		],
		[
			"in-browser playground on the docs site",
			"✅",
			"❌",
			"❌",
			"❌",
			"❌",
			"yaebal's docs run examples against mock Telegram updates in-browser. we checked each project's own docs site directly and found no first-party equivalent for any of the four — telegraf's community links out to generic third-party sandboxes (RunKit, CodeSandbox) instead.",
		],
		[
			"zero-dependency, fetch-first core (edge runtimes)",
			"✅",
			"✅",
			"⚠️",
			"⚠️",
			"⚠️",
			"grammY ships official hosting guides for Cloudflare Workers — both a Deno-native and a Node-compat version. gramio advertises Node/Bun/Deno support in its own tagline, but we found no dedicated Cloudflare Workers guide to confirm edge fetch-handler support specifically. we found no confirmation either way for puregram or telegraf.",
		],
		[
			"Bot API freshness",
			`✅ ${BOT_API_VERSION}`,
			"✅ 10.1",
			"✅ 10.0",
			"⚠️",
			"❌",
			`yaebal regenerates from Telegram's schema on a scheduled job. grammY's own release notes show Bot API 10.1 support — tied with yaebal. gramio's own changelog announced Bot API 10.0 "ecosystem-wide", one point release behind. the newest explicit Bot API version we could find mentioned in puregram's release history is 7.1, with nothing more recent confirmed either way. telegraf's own GitHub releases show no Bot API bump past the 7.x era, while the spec has since moved to ${BOT_API_VERSION} — expect real gaps in newer methods and fields.`,
		],
	];
</script>

<svelte:head><title>comparison — yaebal</title></svelte:head>

<h1>comparison</h1>
<p class="lead">
	a neutral map of popular telegram bot libraries. the short version: choose yaebal when you want
	type flow, generated contexts, first-party plugins and production tooling in one stack — and
	gramio is the closest relative in spirit, not a strawman.
</p>

<div class="note">
	<strong>methodology.</strong> versions are live npm <code>dist-tags.latest</code> lookups at time
	of writing. capability rows are checked against each project's own docs, changelogs and GitHub
	releases — not memory or guesswork — with a citation-worthy fact behind every ✅/❌. ⚠️ means we
	looked and either found mixed signals or nothing conclusive either way; it is not a quiet ❌.
	found something outdated or wrong? <a href="https://github.com/neverlane/yaebal" target="_blank" rel="noreferrer">open an issue</a>.
</div>

<h2>versions compared</h2>
<table>
	<thead><tr><th>library</th><th>version</th></tr></thead>
	<tbody>
		{#each versions as [name, version]}
			<tr><td>{name}</td><td>{version}</td></tr>
		{/each}
	</tbody>
</table>

<h2>summary</h2>
<table>
	<thead><tr><th>library</th><th>best at</th><th>tradeoff</th></tr></thead>
	<tbody>
		<tr><td>yaebal</td><td>type-accumulating composer, generated context shortcuts, broad first-party plugin catalog, playground, tests, Bot API 10.1</td><td>pre-1.0, newer ecosystem, smaller community</td></tr>
		<tr><td>gramio</td><td>the closest architectural relative — type-accumulating composer via <code>.extend()</code>, generated contexts, its own test package, Bot API 10.0</td><td>no colon-delimited filter-query DSL; smaller first-party plugin catalog outside the core patterns</td></tr>
		<tr><td>puregram</td><td>codegen'd per-update context classes, type-accumulating <code>.extend()</code>, concurrency + per-chat ordering built into its polling transport</td><td>no official scaffolder or test framework; plugin dependencies are checked at runtime, not compile time</td></tr>
		<tr><td>grammY</td><td>large plugin ecosystem, mature docs, official multi-worker concurrent runner, filter queries (the pattern yaebal borrows), Bot API 10.1 — tied with yaebal</td><td>context typing needs a manually-declared "flavor" instead of auto-accumulating; no generated per-update context shortcuts</td></tr>
		<tr><td>telegraf</td><td>the most widely used, huge base of examples and answers, official scaffolder</td><td>weakest native TypeScript story of the five — custom context types are mostly manual, and its own release history shows no Bot API version bump since the 7.x era</td></tr>
	</tbody>
</table>

<h2>feature matrix</h2>
<div class="table-scroll">
<table>
	<thead>
		<tr><th>feature</th><th>yaebal</th><th>grammY</th><th>gramio</th><th>puregram</th><th>telegraf</th></tr>
	</thead>
	<tbody>
		{#each matrix as [feature, yb, gy, gr, pg, tg, note]}
			<tr>
				<td>{feature}</td>
				<td>{yb}</td>
				<td>{gy}</td>
				<td>{gr}</td>
				<td>{pg}</td>
				<td>{tg}</td>
			</tr>
			<tr class="note-row"><td colspan="6">{note}</td></tr>
		{/each}
	</tbody>
</table>
</div>

<h2>why yaebal</h2>
<Code code={yaebal} title="typed-chain.ts" />
<Try id="filters-router" title="feature-routes.ts" />
<ul>
	<li>the bot class extends the composer class, so there is one middleware engine.</li>
	<li><code>derive</code>, <code>decorate</code>, <code>install</code> and <code>extend</code> carry context types forward.</li>
	<li>plugin dependencies are explicit and type-checked.</li>
	<li>generated contexts add schema-derived shortcuts such as <code>ctx.react()</code>.</li>
	<li><code>@yaebal/test</code> gives virtual users/chats and intercepted api calls for ci.</li>
	<li>production packages cover retry, throttling, runner, webhooks, broadcasts and panels — a broader first-party catalog than any of the four above ship together.</li>
</ul>

<h2>when another library is reasonable</h2>
<ul>
	<li>choose gramio if your team already uses it — it's the closest match architecturally (type-accumulating <code>.extend()</code>, generated contexts, its own test framework), and the choice mostly comes down to plugin catalog and docs style.</li>
	<li>choose puregram if you want built-in per-chat-ordered concurrency without a separate runner package, or prefer its plugin/dependency style — just know that dependency ordering fails at runtime, not compile time.</li>
	<li>choose grammY if you need its large existing plugin ecosystem today, or its official multi-worker concurrent runner is exactly what you already know — its Bot API coverage is current, tied with yaebal.</li>
	<li>choose telegraf for legacy projects where migration cost dominates type-safety gains, or where the sheer volume of existing examples and answers matters more — but verify any newer Bot API feature you need is actually supported first; its own release history shows no version bump past the 7.x era.</li>
</ul>

<h2>migration paths</h2>
<ul>
	<li><a href="/docs/migration/gramio/">from gramio</a></li>
	<li><a href="/docs/migration/puregram/">from puregram</a></li>
	<li><a href="/docs/migration/grammy/">from grammy</a></li>
	<li><a href="/docs/migration/telegraf/">from telegraf</a></li>
</ul>

<style>
	.table-scroll {
		overflow-x: auto;
	}
	.note-row td {
		font-size: 0.85em;
		opacity: 0.75;
		padding-top: 0;
		padding-bottom: 14px;
		border-top: none;
	}
</style>
