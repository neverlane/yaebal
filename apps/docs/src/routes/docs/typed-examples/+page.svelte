<script lang="ts">
	import Code from "$lib/Code.svelte";

	const filter = `bot.on("message:text", (ctx) => {
  ctx.text;
  // ^ string, narrowed by the filter query
});

bot.on("callback_query:data", (ctx) => {
  ctx.callbackQuery.data;
  // ^ string | undefined on the raw payload, but callbackQuery itself is guaranteed
});`;

	const accumulate = `const bot = createBot(token)
  .decorate({ appName: "shop" })
  .derive(async (ctx) => ({ user: await loadUser(ctx.from?.id) }))
  .on("message:text", (ctx) => {
    ctx.appName;
    // ^ string
    ctx.user;
    // ^ Awaited<ReturnType<typeof loadUser>>
    ctx.text;
    // ^ string
  });`;

	const sessionType = `interface SessionData {
  cart: string[];
}

const bot = createBot(token)
  .install(session<SessionData>({ initial: () => ({ cart: [] }) }))
  .command("cart", (ctx) => {
    ctx.session.cart.push("sku_1");
    // ^ string[]
  });`;

	const dependency = `type NeedsSession = Context & { session: { userId?: number } };

function currentUser(
  loadUser: (id: number) => Promise<User>,
): Plugin<NeedsSession, { user: User | null }> {
  return (composer) => composer.derive(async (ctx) => ({
    user: ctx.session.userId ? await loadUser(ctx.session.userId) : null,
  }));
}

createBot(token).install(currentUser(loadUser));
// TypeScript error: session is not installed yet.

createBot(token)
  .install(session({ initial: () => ({}) }))
  .install(currentUser(loadUser));
// ok.`;

	const generated = `const bot = createBot(token);

bot.on("message:text", (ctx) => {
  ctx.react("🔥");
  // ^ generated MessageContext shortcut
});

bot.on("callback_query:data", (ctx) => {
  ctx.answer("ok");
  // ^ generated CallbackQueryContext shortcut
});`;

	const composer = `const shared = new Composer()
  .install(session({ initial: () => ({ count: 0 }) }))
  .decorate({ feature: "shared" });

const feature = new Composer()
  .extend(shared)
  .command("count", (ctx) => {
    ctx.session.count;
    ctx.feature;
  });

createBot(token).extend(feature);
// feature already carries shared's middleware — extend it once.`;
</script>

<svelte:head>
	<title>typed examples — yaebal</title>
</svelte:head>

<h1>typed examples</h1>
<p class="lead">
	yaebal's main feature is not just runtime convenience. it is the way the context type changes as
	you build the chain. these examples show the intended typescript shape.
</p>

<h2>filter queries narrow context</h2>
<p>
	a query like <code>message:text</code> is both a runtime route and a type-level narrowing rule.
</p>
<Code code={filter} title="filters.ts" />

<h2>derive and decorate accumulate</h2>
<p>
	<code>decorate</code> adds static fields and <code>derive</code> adds per-update fields. handlers
	downstream see both.
</p>
<Code code={accumulate} title="accumulate.ts" />

<h2>plugin-added context stays typed</h2>
<p>
	the session shape comes from the generic you pass to <code>session()</code> and flows into later
	handlers. see the <a href="/docs/plugins/session/">session plugin</a> for storage options.
</p>
<Code code={sessionType} title="session.ts" />

<h2>plugin dependencies are explicit</h2>
<p>
	a plugin can say which context fields it requires. installing it too early becomes a compile-time
	error instead of a hidden middleware-order bug. see
	<a href="/docs/plugins/authoring/">plugin authoring</a> for the full <code>Plugin</code> contract.
</p>
<Code code={dependency} title="dependency.ts" />

<h2>generated contexts are runtime shortcuts</h2>
<p>
	use <code>createBot()</code> from the meta package when you want generated per-update shortcuts at
	runtime. the full shortcut list and positional overloads live on
	<a href="/docs/contexts/">generated contexts</a>.
</p>
<Code code={generated} title="generated-contexts.ts" />

<h2>feature composers inherit types</h2>
<p>
	build features as plain composers, extend shared plugin setup, then attach them to the bot. the
	context type follows the chain. note that <code>extend</code> copies middleware — attach a
	feature that already extends <code>shared</code> without extending <code>shared</code> again, or
	its plugins run twice per update.
</p>
<Code code={composer} title="feature-composer.ts" />

<div class="note">
	<strong>no declaration merging required.</strong> do not add <code>declare module</code> just to make
	<code>ctx.foo</code> exist. add it with <code>derive</code>, <code>decorate</code>, or a typed plugin
	so both runtime and typescript stay aligned.
</div>
