<script lang="ts">
	import Code from "$lib/Code.svelte";

	const send = `import { createBot } from "yaebal";

const bot = createBot(process.env.BOT_TOKEN!);

// the raw method: html (≤32768 bytes, ≤4096 zlib-compressed), optional size and state
bot.command("hello", (ctx) =>
  ctx.sendWidget({
    html: '<button onclick="this.textContent = TelegramWidget.colorScheme">theme?</button>',
    height: 60,
    public_data: "{}",
  }),
);

bot.start();`;

	const query = `import { createBot } from "yaebal";

const bot = createBot(process.env.BOT_TOKEN!);

// a tap in a widget sent with allow_queries: true arrives as widget_query
bot.widgetQuery("ping", async (ctx) => {
  // answer within 15 s — the widget's request() resolves with { result: "pong" }
  await ctx.api.answerWidgetQuery({ widget_query_id: ctx.widgetQuery.id, data: "pong" });
});

bot.on("widget_query", (ctx) => console.log("unhandled widget query", ctx.widgetQuery?.data));

bot.start();`;

	const typed = `import { callbackData, field } from "@yaebal/callback-data";
import { defineWidget, html, widgetClient, widgetState, widgets } from "@yaebal/widget";
import { createBot } from "yaebal";

const vote = callbackData("vote", { option: field.enum(["yes", "no"]) });
const tally = widgetState<{ yes: number; no: number }>({ revision: true });

const poll = defineWidget({
  publicData: tally,
  html: html\`\${widgetClient({ actions: { vote }, revision: true })}
<button onclick="yw.ask('vote', { option: 'yes' })">yes</button>
<button onclick="yw.ask('vote', { option: 'no' })">no</button>\`,
});

const counts = { yes: 0, no: 0 };

const bot = createBot(process.env.BOT_TOKEN!)
  .install(widgets())
  .command("poll", async (ctx) => ctx.sendWidget(await poll.message({ publicData: counts })))
  .widgetQuery(vote, async (ctx) => {
    counts[ctx.queryData.option]++;
    await ctx.widget.setData({ publicData: tally.encode(counts) });
    await ctx.widget.answer(counts);
  });

bot.start();`;

	const shared = `import { defineWidget, sharedWidgetId, widgets } from "@yaebal/widget";
import { createBot } from "yaebal";

const board = defineWidget({ html: "<p id=score></p>", shared: true });

const bot = createBot(process.env.BOT_TOKEN!).install(widgets());

let boardId: string | undefined;

bot.command("board", async (ctx) => {
  if (boardId) return ctx.sendSharedWidget(board.resend(boardId));
  // the first send creates the shared widget — its id is on the returned message
  boardId = sharedWidgetId(await ctx.sendWidget(await board.message({ publicData: "0" })));
});

// one state for every copy: edit it once, every message showing it updates (≤ once per second)
bot.command("score", async (ctx) => {
  if (boardId) await ctx.api.editSharedWidgetData({ widget_id: boardId, public_data: ctx.args[0] ?? "0", cache_time: 10 });
});

bot.start();`;
</script>

<svelte:head>
	<title>html widgets — yaebal</title>
</svelte:head>

<h1>html widgets</h1>
<p class="lead">
	since bot api 10.4 a message can carry an html widget — a small app that renders inside the chat
	bubble, reads state the bot wrote, and sends queries back to the bot when tapped. this guide walks
	the protocol with core alone, then the same thing with
	<a href="/docs/plugins/widget/"><code>@yaebal/widget</code></a>.
</p>

<h2>the moving parts</h2>
<table>
	<thead><tr><th>piece</th><th>who writes it</th><th>what it is</th></tr></thead>
	<tbody>
		<tr><td><code>html</code></td><td>the bot, once</td><td>the widget's code — fixed after sending (≤32768 bytes, ≤4096 zlib-compressed)</td></tr>
		<tr><td><code>public_data</code></td><td>the bot</td><td>state shown wherever the widget is shown — shared by every copy of a shared widget (≤1024 bytes)</td></tr>
		<tr><td><code>chat_data</code></td><td>the bot</td><td>state of this one message (≤1024 bytes, never forwarded)</td></tr>
		<tr><td><code>widget_query</code></td><td>the widget</td><td>a tap: 1–64 bytes of <code>data</code>, answered with <code>answerWidgetQuery</code> within 15 s</td></tr>
		<tr><td><code>shared_widget_query</code></td><td>the widget</td><td>a tap in a forwarded copy of a shared widget — no chat, only <code>widget_id</code></td></tr>
	</tbody>
</table>
<p>
	inside the widget, <code>window.TelegramWidget</code> exposes the state
	(<code>publicData</code>, <code>chatData</code>), the theme, the viewer, events
	(<code>publicDataChanged</code>, <code>chatDataChanged</code>, …) and
	<code>request(data)</code>. an answer only reaches the widget that asked — it never changes state;
	the bot edits state with <code>editMessageWidgetData</code> / <code>editSharedWidgetData</code>.
</p>

<h2>send a widget</h2>
<Code code={send} title="send.ts" />

<h2>route queries</h2>
<p>
	core routes widget queries like callback queries: <code>bot.widgetQuery(trigger, …)</code> takes a
	string, a RegExp (<code>ctx.match</code>) or a <code>callbackData</code> namespace
	(<code>ctx.queryData</code>), and handles both <code>widget_query</code> and
	<code>shared_widget_query</code>. <code>ctx.widgetQuery</code>, <code>ctx.from</code> and
	<code>ctx.chat</code> are filled for both.
</p>
<Code code={query} title="query.ts" />

<h2>typed end to end</h2>
<p>
	<code>@yaebal/widget</code> puts the same <code>callbackData</code> namespace on both sides:
	<code>widgetClient()</code> embeds its wire format into the widget so <code>yw.ask()</code> packs
	what <code>bot.widgetQuery(vote, …)</code> unpacks. state goes through json codecs, answers come
	back parsed, and every payload is checked against telegram's limits before sending.
</p>
<Code code={typed} title="poll.ts" />

<h2>shared widgets</h2>
<p>
	<code>is_shared: true</code> turns a widget into one object with one public state: send it again
	with <code>sendSharedWidget</code>, and each edit updates every message that shows it. widgets on
	screen poll the state (every <code>cache_time</code> seconds, 30 by default) while they call
	<code>watchPublicData()</code> — use a revisioned state so a late poll never rolls the view back.
</p>
<Code code={shared} title="board.ts" />

<h2>where queries work</h2>
<table>
	<thead><tr><th>message</th><th>on a tap</th><th>in the background</th></tr></thead>
	<tbody>
		<tr><td>private chat, original</td><td>yes</td><td>yes — once on appearance, then at most every 5 s</td></tr>
		<tr><td>group / inline-sent original</td><td>yes</td><td>no</td></tr>
		<tr><td>forwarded shared widget</td><td>yes (<code>shared_widget_query</code>)</td><td>no</td></tr>
		<tr><td>forwarded static widget, preview</td><td>no</td><td>no</td></tr>
	</tbody>
</table>

<h2>checklist</h2>
<ul>
	<li>call <code>request()</code> synchronously inside the tap handler — one tap unlocks one call, and one query is in flight at a time.</li>
	<li>always answer (the <code>widgets()</code> auto-answer does it for you) — an unanswered query costs the user a 15 s <code>TIMEOUT</code>.</li>
	<li>the widget has no network, no keyboard or touch events, no scrolling and an 8 mb memory cap — <code>lintHtml</code> flags what the sandbox drops.</li>
	<li>the 4096-byte compressed limit is the real one: measure with <code>measureHtml</code> (zlib level 9, like telegram) and keep the html static — put data in state, not in markup.</li>
	<li>in production, widgets can currently be sent only to private chats, and they are protected (no forwards).</li>
	<li>TON payments: verify <code>sent_transaction</code>'s <code>msg_hash</code> on-chain before delivering anything.</li>
</ul>
<p>
	see <a href="/docs/plugins/widget/"><code>@yaebal/widget</code></a>, the
	<a href="https://github.com/neverlane/yaebal/tree/master/examples/widget">widget example</a>, and
	telegram's <a href="https://core.telegram.org/bots/widgets">widget documentation</a>.
</p>
