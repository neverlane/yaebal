<script lang="ts">
	import Code from "$lib/Code.svelte";

	const chain = `import { Bot, bold, format } from "@yaebal/core";

const bot = new Bot(process.env.BOT_TOKEN!)
  .derive((ctx) => ({ user: loadUser(ctx.from!.id) }))  // async, per-request
  .decorate({ version: "1.0.0" })                        // static, zero cost
  .command("start", (ctx) => ctx.reply("hello 👋"))
  .on("message:text", (ctx) => {
    ctx.user;     // ✅ added by derive, fully typed
    ctx.version;  // ✅ added by decorate
    ctx.text;     // ✅ narrowed to string by the filter query
  });

bot.start();`;

	const invariant = `// Bot extends Composer — there is no separate router.
// derive / decorate / install / extend all return the augmented Bot,
// so the context type accumulates as you chain.

class Bot<C extends Context> extends Composer<C> { /* … */ }`;
</script>

<svelte:head>
	<title>introduction — yaebal</title>
</svelte:head>

<h1>introduction</h1>
<p class="lead">
	yaebal is a type-safe, extensible Telegram Bot API framework where the context type accumulates
	through a single chainable middleware engine.
</p>

<h2>what it is</h2>
<p>
	<strong>yaebal</strong> — Yet Another tElegram Bot Api Library — wraps the Telegram Bot API in a
	chain you build once. you start from a <code>Bot</code>, hang middleware, plugins, routers and
	enrichment off it, and every step refines the type of the context your handlers see. there is no
	manual casting and no widening to <code>any</code> in the public surface.
</p>
<Code code={chain} title="bot.ts" />

<h2>the design, borrowed deliberately</h2>
<p>
	yaebal takes one strong idea from each of three existing libraries and keeps them distinct:
</p>
<table>
	<thead>
		<tr><th>source</th><th>idea</th><th>in yaebal</th></tr>
	</thead>
	<tbody>
		<tr>
			<td>GramIO</td>
			<td>chainable composer</td>
			<td>the context type <em>accumulates</em> through the chain — <code>derive</code>/<code>decorate</code>/<code>install</code>/<code>extend</code> each return an augmented type</td>
		</tr>
		<tr>
			<td>grammY</td>
			<td>filter queries</td>
			<td><code>on("message:text")</code> narrows the context so the filtered field is present and typed</td>
		</tr>
		<tr>
			<td>puregram</td>
			<td>hooks &amp; media</td>
			<td>request <code>before</code>/<code>after</code>/<code>onError</code> hooks on the <code>Api</code>, plus a clean <code>MediaSource</code> abstraction</td>
		</tr>
	</tbody>
</table>

<h2>the core invariants</h2>
<p>these are the rules the framework is built to preserve:</p>
<ul>
	<li>
		<strong>Bot extends Composer.</strong> the bot <em>is</em> the middleware chain — the engine is
		extended, never forked.
	</li>
	<li>
		<strong>derive is async + per-request; decorate is static.</strong> <code>derive</code> runs a
		function on every update to add computed state; <code>decorate</code> attaches a constant value
		with no per-request cost. they are kept deliberately separate.
	</li>
	<li>
		<strong>types flow through the chain.</strong> any composer method that enriches the context
		returns a composer with an augmented context type — never widened to <code>any</code>.
	</li>
	<li>
		<strong>plugin dependencies are explicit.</strong> a <code>Plugin</code>'s required context is
		expressed in its type, so installing it before its dependency is a compile error, not a runtime
		surprise.
	</li>
</ul>
<Code code={invariant} title="bot.ts" />

<div class="note">
	<strong>one engine.</strong> because <code>Bot</code> subclasses <code>Composer</code>, you can
	build feature files as plain standalone <code>Composer</code>s with no token, then merge them into
	the bot with <code>extend</code> — the merged context type comes along.
</div>

<h2>the package map</h2>
<p>
	core is the only package you need to start. it ships the engine, the context, media, hooks and the
	webhook handlers:
</p>
<table>
	<thead>
		<tr><th>export</th><th>what</th></tr>
	</thead>
	<tbody>
		<tr><td><code>Bot</code>, <code>Composer</code></td><td>the chainable middleware engine</td></tr>
		<tr><td><code>Context</code></td><td>the per-update wrapper with <code>send</code>/<code>reply</code>/<code>sendPhoto</code>/…</td></tr>
		<tr><td><code>media</code>, <code>isMediaSource</code>, <code>MediaSource</code></td><td>the file abstraction</td></tr>
		<tr><td><code>createApi</code>, <code>Api</code>, <code>TelegramError</code></td><td>the low-level API client and hooks</td></tr>
		<tr><td><code>webhookCallback</code>, <code>nodeWebhookCallback</code></td><td>fetch- and node-style webhook handlers</td></tr>
		<tr><td><code>format</code>, <code>bold</code>, <code>italic</code>, …</td><td>entity-based message formatting helpers</td></tr>
	</tbody>
</table>

<h2>next</h2>
<ul>
	<li><a href="/docs/getting-started/">getting started</a> — a bot from zero in about a minute</li>
	<li><a href="/docs/core/">core concepts</a> — the composer, derive/decorate, filter queries</li>
</ul>
