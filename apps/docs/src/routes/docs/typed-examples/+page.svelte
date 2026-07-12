<script lang="ts">
	import Code from "$lib/Code.svelte";

	const filter = `import { createBot } from "yaebal";

const bot = createBot(process.env.BOT_TOKEN!);

bot.on("message:text", (ctx) => {
  ctx.text;
  // ^ string, narrowed by the filter query
});

bot.on("callback_query:data", (ctx) => {
  ctx.callbackQuery.data;
  // ^ string | undefined on the raw payload, but callbackQuery itself is guaranteed
});`;

	const accumulate = `import { createBot } from "yaebal";

const loadUser = async (id: number) => ({ id, name: "somebody" });
const token = process.env.BOT_TOKEN!;

const bot = createBot(token)
  .decorate({ appName: "shop" })
  .derive(async (ctx) => ({ user: await loadUser(ctx.from!.id) }))
  .on("message:text", (ctx) => {
    ctx.appName;
    // ^ string
    ctx.user;
    // ^ Awaited<ReturnType<typeof loadUser>>
    ctx.text;
    // ^ string
  });`;

	const sessionType = `import { createBot, session } from "yaebal";

interface SessionData {
  cart: string[];
}

const token = process.env.BOT_TOKEN!;

const bot = createBot(token)
  .install(session<SessionData>({ initial: () => ({ cart: [] }) }))
  .command("cart", (ctx) => {
    ctx.session.cart.push("sku_1");
    // ^ string[]
  });`;

	const dependency = `import { createBot, session, type Context, type Plugin } from "yaebal";

type NeedsSession = Context & { session: { userId?: number } };
type UserRecord = { id: number; name: string };

function currentUser(
  loadUser: (id: number) => Promise<UserRecord>,
): Plugin<NeedsSession, { user: UserRecord | null }> {
  return (composer) => composer.derive(async (ctx) => ({
    user: ctx.session.userId ? await loadUser(ctx.session.userId) : null,
  }));
}

const loadUser = async (id: number) => ({ id, name: "somebody" });
const token = process.env.BOT_TOKEN!;

// @ts-expect-error — session isn't installed on this chain yet, so \`ctx.session\`
// doesn't exist. this is a real compile error: our docs health check compiles
// this exact snippet, so if plugin-dependency checking ever regresses, this
// page's build breaks too — not just a paraphrased comment.
createBot(token).install(currentUser(loadUser));

createBot(token)
  .install(session({ initial: () => ({}) }))
  .install(currentUser(loadUser));
// ok.`;

	const generated = `import { createBot } from "yaebal";

const bot = createBot(process.env.BOT_TOKEN!);

bot.on("message:text", (ctx) => {
  ctx.react("🔥");
  // ^ generated MessageContext shortcut
});

bot.on("callback_query:data", (ctx) => {
  ctx.answer("ok");
  // ^ generated CallbackQueryContext shortcut
});`;

	const composer = `import { Composer, createBot, session } from "yaebal";

const shared = new Composer()
  .install(session({ initial: () => ({ count: 0 }) }))
  .decorate({ feature: "shared" });

const feature = new Composer()
  .extend(shared)
  .command("count", (ctx) => {
    ctx.session.count;
    ctx.feature;
  });

createBot(process.env.BOT_TOKEN!).extend(feature);
// feature already carries shared's middleware — extend it once.`;

	const guardPredicate = `import { createBot, type Context } from "yaebal";

type WithUser = Context & { from: NonNullable<Context["from"]> };

const bot = createBot(process.env.BOT_TOKEN!)
  .guard((ctx): ctx is WithUser => ctx.from !== undefined)
  .on("message", (ctx) => {
    ctx.from.id;
    // ^ number — no \`!\` needed. guard() with a type-predicate narrows every
    //   handler registered after it, the same way derive()/filter() do.
  });`;

	const filterStaged = `import { createBot } from "yaebal";
import { regex } from "@yaebal/filters";

const bot = createBot(process.env.BOT_TOKEN!)
  .filter(regex(/^\\/order (\\d+)$/), (ctx) => {
    ctx.match[1];
    // ^ string | undefined — \`regex()\` stages { text, match } in the filter's
    //   bag; filter() commits it onto the context only once the whole filter
    //   tree matches, so a rejected filter never touches ctx at all.
    return ctx.reply("order: " + (ctx.match[1] ?? "?"));
  });`;
</script>

<svelte:head>
	<title>typed examples — yaebal</title>
</svelte:head>

<h1>typed examples</h1>
<p class="lead">
	yaebal's main feature is not just runtime convenience. it is the way the context type changes as
	you build the chain. these examples are compiled by the docs' own health check against real
	package source, so the shapes shown are what TypeScript actually infers — not a paraphrase.
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

<h2><code>guard</code> narrows with a type predicate</h2>
<p>
	<code>guard</code> has two forms: a plain <code>boolean</code> predicate just gates the chain, but
	a type-guard predicate (<code>ctx is C2</code>) also narrows the context type for every handler
	registered after it — the same mechanism <code>filter</code> uses for staged data.
</p>
<Code code={guardPredicate} title="guard.ts" />

<h2><code>filter</code> stages typed data</h2>
<p>
	a filter from <a href="/docs/plugins/filters/">@yaebal/filters</a> can stage extra fields (a
	regex match, a resolved chat member, …) without touching the context until the whole filter tree
	matches — a rejected branch leaves <code>ctx</code> exactly as it was.
</p>
<Code code={filterStaged} title="filter.ts" />

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
