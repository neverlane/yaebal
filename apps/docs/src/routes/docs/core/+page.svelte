<script lang="ts">
	import Code from "$lib/Code.svelte";

	const composer = `// Bot extends Composer — same middleware engine, no fork
bot
  .install(session())
  .derive((ctx) => ({ user: loadUser(ctx.from!.id) }))  // async, per-request
  .decorate({ version: "1.0.0" })                        // static, zero cost
  .on("message:text", (ctx) => {
    ctx.user;     // ✅ added by derive, fully typed
    ctx.version;  // ✅ added by decorate
  });`;

	const derive = `bot.derive(async (ctx) => {
  const user = await db.users.find(ctx.from!.id);
  return { user };
});
// every downstream handler now sees ctx.user: User`;

	const filters = `bot.on("message:text", (ctx) => ctx.text);          // ctx.text: string
bot.on("message:photo", (ctx) => ctx.photo);        // ctx.photo: PhotoSize[]
bot.on("callback_query:data", (ctx) => ctx.data);   // ctx.data: string
bot.on("message:entities:url", (ctx) => { /* ... */ });`;

	const plugin = `import type { Plugin } from "@yaebal/core";

const timer: Plugin<Context, { startedAt: number }> = (composer) =>
  composer.derive(() => ({ startedAt: Date.now() }));

bot.install(timer);  // ctx.startedAt is now typed downstream`;

	const scopedDerive = `// pass a single update type, or an array of them
bot.derive(["message", "edited_message"], async (ctx) => {
  const user = await db.users.find(ctx.from!.id);
  return { user };               // typed as Partial — only present on those updates
});

// unscoped derive runs for every update type
bot.derive(async (ctx) => ({ ts: Date.now() }));`;

	const composerFilter = `import { text, command, and, isPrivate } from "@yaebal/filters";

// filter() runs handlers only when the filter matches, and narrows
// the context — filters can also attach data (regex → ctx.match)
bot.filter(text, (ctx) => ctx.text);            // ctx.text: string
bot.filter(command("buy"), (ctx) => ctx.args);  // ctx.command, ctx.args

// compose with and / or / not
bot.filter(and(isPrivate, command("pay")), (ctx) => ctx.args);`;
</script>

<svelte:head>
	<title>core concepts — yaebal</title>
</svelte:head>

<h1>core concepts</h1>
<p class="lead">
	one middleware engine, a context type that accumulates, and filter queries that narrow it.
</p>

<h2>the composer</h2>
<p>
	<code>Bot extends Composer</code>. there is no separate router — the bot <em>is</em> the
	middleware chain. each method that enriches the context returns a composer with an augmented
	context type, so the chain stays type-safe end to end.
</p>
<Code code={composer} title="composer.ts" />

<h2>derive vs decorate</h2>
<p>two ways to add to the context, kept deliberately distinct:</p>
<table>
	<thead>
		<tr><th>method</th><th>when</th><th>cost</th><th>use for</th></tr>
	</thead>
	<tbody>
		<tr><td><code>derive</code></td><td>async, per request</td><td>runs every update</td><td>db lookups, computed state</td></tr>
		<tr><td><code>decorate</code></td><td>static, once</td><td>zero per-request</td><td>constants, helpers, services</td></tr>
	</tbody>
</table>
<Code code={derive} title="derive.ts" />

<h2>filter queries</h2>
<p>
	grammY-style <code>L1:L2:L3</code> queries. they don't just route — they <strong>narrow the
	context type</strong>, so the field you filtered on is guaranteed present and typed.
</p>
<Code code={filters} title="filters.ts" />

<h2>writing a plugin</h2>
<p>
	a plugin is a function <code>(composer) =&gt; composer</code> with an explicit input and output
	context. dependencies are type-checked — you can't install a plugin whose required context
	isn't there yet.
</p>
<Code code={plugin} title="plugin.ts" />

<div class="note">
	<strong>invariant:</strong> any composer method that enriches the context must return an
	augmented type, never widen to <code>any</code>. that's what keeps the chain honest.
</div>

<h2>scoped derive</h2>
<p>
	pass one or more update-type strings as the first arguments to <code>derive</code> and the
	function runs <strong>only for those update types</strong>. updates that don't match skip the
	derive entirely, saving the work of the async callback on every irrelevant event.
</p>
<Code code={scopedDerive} title="scoped-derive.ts" />

<h2>composer.filter</h2>
<p>
	<code>filter(predicate, ...handlers)</code> creates a type-narrowing branch. any handler passed
	to it receives the context already narrowed to the subset that satisfies the predicate — the
	same guarantee as <code>on()</code>, but composable with predicates from
	<code>@yaebal/filters</code> or your own boolean functions.
</p>
<Code code={composerFilter} title="filter.ts" />
