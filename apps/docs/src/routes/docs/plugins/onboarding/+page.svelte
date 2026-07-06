<script lang="ts">
	import Code from "$lib/Code.svelte";

	const install = `pnpm add @yaebal/onboarding`;

	const usage = `import { Bot } from "@yaebal/core";
import { createOnboarding } from "@yaebal/onboarding";

const welcome = createOnboarding({ id: "welcome" })
  .step("hello", {
    text: "hi. i'll show you around.",
    buttons: ["next", "dismiss"],
  })
  .step("commands", {
    text: "use /help for commands and /settings to tune the bot.",
    buttons: ["next", "exit"],
  })
  .step("done", { text: "you're ready." })
  .onComplete((ctx) => ctx.send("welcome aboard."))
  .build();

const bot = new Bot(token).install(welcome);

bot.command("start", (ctx) => ctx.onboarding.welcome.start());
bot.command("tour", (ctx) => ctx.onboarding.welcome.start({ force: true }));`;

	const controls = `bot.command("status", (ctx) => {
  const flow = ctx.onboarding.welcome;
  return ctx.reply("status=" + flow.status + ", step=" + (flow.currentStep ?? "none"));
});

bot.command("skip", (ctx) => ctx.onboarding.welcome.skip());
bot.command("exit", (ctx) => ctx.onboarding.welcome.exit());
bot.command("disable", (ctx) => ctx.onboarding.disableAll());
bot.command("enable", (ctx) => ctx.onboarding.enableAll());`;

	const buttons = `.step("pick", {
  text: "where next?",
  buttons: [
    "next",
    { text: "skip setup", goto: "done" },
    { text: "docs", url: "https://yaebal.mom" },
  ],
})`;

	const storage = `createOnboarding({
  id: "welcome",
  storage: myStorage, // { get(key), set(key, value), delete(key) }
  scope: "user",      // default. use "chat" for per-chat tours
});`;
</script>

<svelte:head>
	<title>@yaebal/onboarding - yaebal</title>
</svelte:head>

<h1>@yaebal/onboarding</h1>
<p class="lead">
	declarative first-run tutorials and product tours. build a flow, install it as a typed plugin,
	then control it from handlers through <code>ctx.onboarding.&lt;id&gt;</code>.
</p>

<h2>install</h2>
<Code code={install} title="terminal" lang="sh" />

<h2>usage</h2>
<p>
	<code>createOnboarding(&#123; id &#125;)</code> returns a fluent builder. each <code>step()</code>
	adds a typed step id; after <code>.build()</code>, <code>bot.install(welcome)</code> widens the
	context with <code>ctx.onboarding.welcome</code>.
</p>
<Code code={usage} title="bot.ts" />

<h2>flow controls</h2>
<Code code={controls} title="controls.ts" />
<table>
	<thead>
		<tr><th>member</th><th>description</th></tr>
	</thead>
	<tbody>
		<tr><td><code>status</code></td><td><code>null | active | paused | exited | completed | dismissed</code></td></tr>
		<tr><td><code>currentStep</code></td><td>the active step id, typed from the builder chain</td></tr>
		<tr><td><code>data</code></td><td>mutable JSON-ish bag persisted with the flow record</td></tr>
		<tr><td><code>start(opts?)</code></td><td>start or resume. pass <code>force: true</code> to restart after completion</td></tr>
		<tr><td><code>next(&#123; from &#125;)</code></td><td>advance with an optional stale-step guard</td></tr>
		<tr><td><code>goto(id)</code></td><td>jump to a typed step id</td></tr>
		<tr><td><code>skip/exit/dismiss/undismiss/complete</code></td><td>terminal and convenience operations</td></tr>
	</tbody>
</table>

<h2>buttons</h2>
<p>
	built-in buttons generate safe onboarding callback tokens. explicit button objects can jump to a
	step, link out, or use your own <code>callback_data</code>.
</p>
<Code code={buttons} title="buttons.ts" />

<h2>storage &amp; scope</h2>
<Code code={storage} title="storage.ts" />
<p>
	state is in memory by default. <code>scope: "user"</code> keys by <code>ctx.from.id</code>;
	<code>scope: "chat"</code> keys by <code>ctx.chat.id</code>; a function can return a custom key.
</p>

<h2>example bot</h2>
<p>
	there is a runnable bot under <a href="https://github.com/neverlane/yaebal/tree/master/examples/onboarding"><code>examples/onboarding</code></a>.
	run it with <code>pnpm --filter @yaebal/example-onboarding dev</code> after adding
	<code>BOT_TOKEN</code> to its <code>.env</code> file.
</p>

<div class="note">
	<strong>callback_data budget matters.</strong> flow and step ids are embedded into Telegram
	callback data. keep them short and use only letters, numbers, <code>_</code>, and <code>-</code>.
	<br /><br />
	<strong>last step completes after render.</strong> if a flow has no next step, onboarding renders the
	current step, marks the flow <code>completed</code>, then runs <code>onComplete</code>.
</div>
