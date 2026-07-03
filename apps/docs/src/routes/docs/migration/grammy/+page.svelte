<script lang="ts">
	import Code from "$lib/Code.svelte";

	const init = `// grammy
import { Bot } from "grammy";
const bot = new Bot(process.env.BOT_TOKEN!);

// yaebal
import { createBot } from "yaebal";
const bot = createBot(process.env.BOT_TOKEN!);`;

	const handlers = `// grammy
bot.command("start", (ctx) => ctx.reply("hello"));
bot.on("message:text", (ctx) => ctx.reply(ctx.message.text));

// yaebal
bot.command("start", (ctx) => ctx.reply("hello"));
bot.on("message:text", (ctx) => ctx.reply(ctx.text));`;

	const flavor = `// grammy flavor-style state
type MyContext = Context & { user: User };

// yaebal chain state
const bot = createBot(token)
  .derive(async (ctx) => ({ user: await loadUser(ctx.from?.id) }))
  .on("message:text", (ctx) => ctx.user);`;

	const session = `// grammy
bot.use(session({ initial: () => ({ count: 0 }) }));

// yaebal
bot.install(session({ initial: () => ({ count: 0 }) }));`;

	const api = `// grammy
await ctx.api.sendMessage(chatId, "hello");

// yaebal
await ctx.api.sendMessage({ chat_id: chatId, text: "hello" });`;

	const middleware = `// yaebal raw middleware is koa-style
bot.use(async (ctx, next) => {
  const started = Date.now();
  try {
    await next();
  } finally {
    console.log(ctx.updateType, Date.now() - started);
  }
});`;
</script>

<svelte:head>
	<title>migrate from grammy — yaebal</title>
</svelte:head>

<h1>migrate from grammy</h1>
<p class="lead">
	grammy and yaebal both use middleware and filter queries. the main difference is that yaebal's
	composer chain carries context additions forward without manual context flavors.
</p>

<h2>initialization</h2>
<Code code={init} title="init.ts" />

<h2>handlers and filters</h2>
<Code code={handlers} title="handlers.ts" />

<h2>context flavors to derive/decorate</h2>
<p>
	in yaebal, add fields with <code>derive</code>, <code>decorate</code>, or typed plugins instead of
	module augmentation or manually passing flavored context types everywhere.
</p>
<Code code={flavor} title="context.ts" />

<h2>sessions</h2>
<Code code={session} title="session.ts" />

<h2>api params</h2>
<p>
	yaebal uses named bot api params, matching the generated <a href="/docs/api/">bot api reference</a>.
</p>
<Code code={api} title="api.ts" />

<h2>middleware</h2>
<Code code={middleware} title="middleware.ts" />

<h2>migration checklist</h2>
<ul>
	<li>replace flavored context types with <code>derive</code>, <code>decorate</code>, and plugins.</li>
	<li>keep filter queries like <code>message:text</code>; they map well to yaebal.</li>
	<li>convert positional api calls to named params.</li>
	<li>use <code>@yaebal/again</code> and api hooks instead of transformer-style retry code.</li>
	<li>move conversation/session choices to the matching yaebal plugins.</li>
</ul>
