<script lang="ts">
	import Code from "$lib/Code.svelte";

	const composer = `import { Bot } from "@yaebal/core";
import { session } from "@yaebal/session";

const bot = new Bot(process.env.BOT_TOKEN!)
  .install(session({ initial: () => ({ count: 0 }) }))
  .derive(async (ctx) => ({ user: await loadUser(ctx.from!.id) }))
  .decorate({ version: "1.0.0" })
  .on("message:text", (ctx) => {
    ctx.session.count; // added by session()
    ctx.user;          // added by derive()
    ctx.version;       // added by decorate()
    ctx.text;          // narrowed by on("message:text")
  });`;

	const routing = `bot.command("start", (ctx) => ctx.reply("hi"));
bot.hears(/buy (.+)/, (ctx) => ctx.reply("match: " + ctx.match[1]));
bot.callbackQuery(/^page:(\\d+)$/, (ctx) => ctx.answerCallbackQuery());
bot.guard((ctx) => ctx.from?.id === ADMIN_ID).command("admin", adminHandler);

bot.on("message:text", (ctx) => ctx.text);        // ctx.text: string
bot.on("callback_query:data", (ctx) => ctx.callbackQuery.data);`;

	const derive = `// unscoped: runs for every update
bot.derive(async (ctx) => ({ requestId: crypto.randomUUID() }));

// scoped: runs only for listed update types; typed as Partial<D> downstream
bot.derive(["message", "edited_message"], async (ctx) => ({
  user: await db.users.find(ctx.from!.id),
}));`;

	const plugin = `import type { BotPlugin, Context, Plugin } from "@yaebal/core";

type Clock = { now: () => Date };

const clock: Plugin<Context, { clock: Clock }> = (composer) =>
  composer.decorate({ clock: { now: () => new Date() } });

const lifecycle: BotPlugin = (bot) =>
  bot.onStart((info) => console.log("started @" + info.username))
     .onStop(() => console.log("stopped"));

bot.install(clock).install(lifecycle).command("time", (ctx) => {
  return ctx.reply(String(ctx.clock.now()));
});`;

	const lowLevel = `import { compose, matchQuery, type Middleware } from "@yaebal/core";

const stack = compose<Context>([one, two] satisfies Middleware<Context>[]);
await stack(ctx);

if (matchQuery(ctx, "message:text")) {
  // runtime check used by Composer.on()
}`;
</script>

<svelte:head>
	<title>core concepts — yaebal</title>
</svelte:head>

<h1 data-pagefind-meta="title">core concepts</h1>
<p class="lead">
	one middleware engine, a context type that accumulates, and filter queries that narrow it.
</p>

<h2>the composer</h2>
<p>
	<code>Bot extends Composer</code>. there is no separate router — the bot <em>is</em> the
	middleware chain. every context-enriching method returns an augmented type, so handlers downstream
	see exactly what was installed before them.
</p>
<Code code={composer} title="composer.ts" />

<h2>routing methods</h2>
<p>
	<code>Composer</code> is a Koa-style middleware pipeline with Telegram-aware routing helpers.
	handlers run in registration order; call <code>next()</code> inside raw middleware to continue.
</p>
<Code code={routing} title="routing.ts" />
<table>
	<thead><tr><th>method</th><th>what it does</th></tr></thead>
	<tbody>
		<tr><td><code>use(...middleware)</code></td><td>raw middleware. receives <code>(ctx, next)</code>.</td></tr>
		<tr><td><code>on(query, ...handlers)</code></td><td>filter-query routing: <code>"message:text"</code>, <code>"callback_query:data"</code>, <code>":photo"</code>.</td></tr>
		<tr><td><code>command(name, ...handlers)</code></td><td>matches <code>/name</code> in fresh message text (edits don't re-fire), verifies <code>@botname</code> against the bot's username when known, adds <code>ctx.command</code> and <code>ctx.args</code>.</td></tr>
		<tr><td><code>hears(trigger, ...handlers)</code></td><td>matches text/caption by string or RegExp and adds <code>ctx.match</code>.</td></tr>
		<tr><td><code>callbackQuery(trigger, ...handlers)</code></td><td>matches <code>callback_query.data</code> and adds <code>ctx.match</code>.</td></tr>
		<tr><td><code>guard(predicate)</code></td><td>continues only when the predicate returns true. a type-guard predicate (<code>ctx is …</code>) narrows the context for everything after it.</td></tr>
		<tr><td><code>filter(filter, ...handlers)</code></td><td>runs a composable type-guard filter, e.g. from <code>@yaebal/filters</code>.</td></tr>
	</tbody>
</table>

<h2>derive vs decorate</h2>
<p>two ways to add to the context, kept deliberately distinct:</p>
<table>
	<thead>
		<tr><th>method</th><th>when</th><th>runtime shape</th><th>use for</th></tr>
	</thead>
	<tbody>
		<tr><td><code>derive</code></td><td>async, per update</td><td>runs a function and assigns its result</td><td>db lookups, computed state, request-scoped services</td></tr>
		<tr><td><code>decorate</code></td><td>static, chain-build time</td><td>merged into one decoration object and assigned at the top of the realized chain</td><td>constants, helpers, long-lived services</td></tr>
	</tbody>
</table>
<Code code={derive} title="derive.ts" />

<h2>plugins</h2>
<p>
	a plugin is <code>(composer) =&gt; composer</code> with explicit input and output context types.
	dependencies are type-checked: if a plugin requires <code>ctx.session</code>, typescript rejects
	installing it before the session plugin. use <code>BotPlugin</code> for extensions that need
	bot-only features such as <code>bot.api</code>, <code>onStart()</code>, or <code>onStop()</code>.
</p>
<Code code={plugin} title="plugin.ts" />

<h2>bot lifecycle</h2>
<table>
	<thead><tr><th>api</th><th>description</th></tr></thead>
	<tbody>
		<tr><td><code>new Bot(token, options?)</code></td><td>creates an API client and a composer-backed bot.</td></tr>
		<tr><td><code>bot.start()</code></td><td>starts sequential long-polling. resolves when <code>stop()</code> is called.</td></tr>
		<tr><td><code>bot.stop()</code></td><td>stops the polling loop and resolves after stop handlers run.</td></tr>
		<tr><td><code>bot.handleUpdate(update)</code></td><td>runs one update through the frozen middleware chain.</td></tr>
		<tr><td><code>bot.onStart(handler)</code></td><td>runs after <code>getMe()</code> succeeds in <code>start()</code>.</td></tr>
		<tr><td><code>bot.onStop(handler)</code></td><td>runs once when <code>stop()</code> is requested or polling exits.</td></tr>
		<tr><td><code>bot.onError(handler)</code></td><td>handles errors thrown by middleware for a specific context.</td></tr>
		<tr><td><code>bot.onPollingError(handler)</code></td><td>handles <code>getUpdates</code> failures (default: <code>console.error</code>); polling retries after a short pause either way. hung connections are aborted and retried automatically.</td></tr>
	</tbody>
</table>

<h2>BotOptions</h2>
<table>
	<thead><tr><th>option</th><th>description</th></tr></thead>
	<tbody>
		<tr><td><code>apiRoot?: string</code></td><td>Telegram API root. defaults to <code>https://api.telegram.org</code>.</td></tr>
		<tr><td><code>readFile?: FileReader</code></td><td>runtime-provided file reader for <code>media.path()</code>. bare core leaves it unset.</td></tr>
		<tr><td><code>allowedUpdates?: UpdateName[]</code></td><td>update types requested by long polling.</td></tr>
		<tr><td><code>contextFactory?: (...) =&gt; Context</code></td><td>builds a custom context per update. the <code>yaebal</code> meta package uses this for rich generated contexts.</td></tr>
	</tbody>
</table>

<h2>low-level exports</h2>
<Code code={lowLevel} title="low-level.ts" />
<table>
	<thead><tr><th>export</th><th>description</th></tr></thead>
	<tbody>
		<tr><td><code>compose</code></td><td>Koa-style middleware composition with double-<code>next()</code> protection.</td></tr>
		<tr><td><code>matchQuery</code></td><td>runtime evaluator used by <code>on()</code>.</td></tr>
		<tr><td><code>Middleware</code>, <code>NextFn</code></td><td>middleware function types.</td></tr>
		<tr><td><code>Plugin</code>, <code>BotPlugin</code></td><td>typed composer and bot extension types.</td></tr>
		<tr><td><code>Filter</code>, <code>FilterQuery</code>, <code>Filtered</code></td><td>filter and query typing primitives.</td></tr>
		<tr><td><code>ContextOptions</code></td><td>constructor options for the base <code>Context</code>.</td></tr>
	</tbody>
</table>

<h2>formatting helpers in core</h2>
<p>
	Core includes entity-based formatting helpers: <code>format</code>, <code>bold</code>,
	<code>italic</code>, <code>underline</code>, <code>strikethrough</code>, <code>spoiler</code>,
	<code>code</code>, <code>pre</code> (with a language), <code>blockquote</code>,
	<code>expandableBlockquote</code>, <code>link</code>, <code>mention</code>,
	<code>customEmoji</code>, <code>dateTime</code>, and <code>join</code> (keeps entities where
	<code>[].join()</code> would drop them). Helpers nest — <code>bold(italic("x"))</code> — and
	double as tagged templates: <code>bold`…`</code>.
</p>
<p>
	A <code>format</code>/<code>fmt</code> result is accepted by <em>every</em> API call, not just
	<code>ctx.send</code>: the api client splits it into text + the right
	<code>*_entities</code> sibling wherever the schema allows formatted text — including nested
	spots like <code>reply_parameters.quote</code>, poll options, media groups and inline results
	(driven by the code-generated <code>formatFields</code> map in <code>@yaebal/types</code>). For
	HTML/Markdown parsing, use <a href="/docs/plugins/fmt/">@yaebal/fmt</a>. For telegram's
	block-tree rich message format
	(<code>sendRichMessage</code>/<code>sendRichMessageDraft</code>), use
	<a href="/docs/plugins/rich/">@yaebal/rich</a>.
</p>

<div class="note">
	<strong>invariant:</strong> any composer method that enriches the context must return an augmented
	type, never widen to <code>any</code>. that's what keeps the chain honest.
</div>
