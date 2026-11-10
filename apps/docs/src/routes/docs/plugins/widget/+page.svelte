<script lang="ts">
	import Code from "$lib/Code.svelte";

	const install = `pnpm add @yaebal/widget @yaebal/callback-data`;

	const usage = `import { callbackData, field } from "@yaebal/callback-data";
import { defineWidget, html, widgetClient, widgetState, widgets } from "@yaebal/widget";
import { createBot } from "yaebal";

// the query a tap sends — the widget packs it, the bot unpacks it, both typed
const vote = callbackData("vote", { option: field.enum(["yes", "no"]) });
// the shared state, revisioned so a late poll never overwrites a newer tally
const tally = widgetState<{ yes: number; no: number }>({ revision: true });

const poll = defineWidget({
  publicData: tally,
  html: html\`\${widgetClient({ actions: { vote }, revision: true })}
<button id="yes">yes <b></b></button> <button id="no">no <b></b></button>
<script>
  const draw = (t) => t && ["yes", "no"].forEach((k) => (document.querySelector("#" + k + " b").textContent = t[k]));
  yw.onState(({ publicData }) => draw(publicData));
  for (const id of ["yes", "no"]) document.getElementById(id).onclick = () => yw.ask("vote", { option: id }).then(draw);
<\/script>\`,
});

const counts = { yes: 0, no: 0 };

const bot = createBot(process.env.BOT_TOKEN!)
  .install(widgets())
  .command("poll", async (ctx) => ctx.sendWidget(await poll.message({ publicData: counts })))
  .widgetQuery(vote, async (ctx) => {
    counts[ctx.queryData.option]++; // ctx.queryData: { option: "yes" | "no" }
    await ctx.widget.setData({ publicData: tally.encode(counts) }); // every viewer redraws
    await ctx.widget.answer(counts); // the tapping user's yw.ask() resolves with it
  });

bot.start();`;

	const control = `bot.install(widgets()).widgetQuery(/^page:(\\d+)$/, async (ctx) => {
  ctx.widget.kind;      // "data" | "sign_data" | "sent_transaction"
  ctx.widget.target;    // { chatId, messageId } | { inlineMessageId } | undefined
  ctx.widget.isShared;  // the query carries widget_id
  ctx.widget.isForward; // shared_widget_query — a forwarded copy, no message to edit

  await ctx.widget.setData({ chatData: JSON.stringify({ page: Number(ctx.match[1]) }) });
  await ctx.widget.answer({ ok: true });
});`;

	const define = `const card = defineWidget({
  html,                 // string or html\`…\` — minified unless minify: false
  publicData: votes,    // widgetState() codec (or omit and pass strings)
  chatData: mine,
  width: 320,           // logical px — omit to fill the bubble
  height: 160,          // omit for auto height (50–600)
  allowQueries: true,   // default
  shared: false,        // true → one state for every copy, resend with sendSharedWidget
});

await ctx.sendWidget(await card.message({ publicData, chatData }, { caption: "vote!" }));
await bot.api.sendWidget(await card.to(chatId, { publicData }));
await ctx.answerInlineQuery([{ type: "article", id: "w", title: "poll", input_message_content: await card.inline() }]);
await bot.api.editMessageWidgetData(card.edit({ chatId, messageId }, { publicData: next, chatData: null }));

const report = await card.check(); // { size: { bytes, compressedBytes, exact, fits }, issues, ok }`;

	const state = `const votes = widgetState<Votes>({ revision: true, validate: isVotes });

votes.encode({ yes: 3, no: 1 }); // '{"r":1731259200000,"v":{"yes":3,"no":1}}' — ≤1024 bytes or it throws
votes.decode(message.widget?.public_data); // Votes | undefined (absent, malformed, failing validate)
votes.revisionOf(raw); // the revision, or undefined`;

	const client = `<script>
  // yw.onState: the decoded state, now and on every change (stale shared-widget polls dropped)
  yw.onState(({ publicData, chatData }) => draw(publicData, chatData));

  button.onclick = () =>
    // synchronously in the tap handler — telegram only unlocks a request inside the tap
    yw.ask("vote", { option: "yes" }).then(
      (answer) => draw(answer),                         // the bot's ctx.widget.answer(...) value, json-parsed
      (error) => (hint.textContent = yw.code(error)),   // NOT_ALLOWED, BUSY, RATE_LIMITED, TIMEOUT, …
    );

  yw.watch(); // a shared widget: poll its public data live while on screen
<\/script>`;

	const ton = `import { callbackData, field } from "@yaebal/callback-data";
import { defineWidget, html, toNano, tonTransaction, widgetClient } from "@yaebal/widget";

const tip = callbackData("tip", { amount: field.enum(["0.1", "0.5", "1"]) });

const jar = defineWidget({
  html: html\`\${widgetClient({ actions: { tip }, wallet: true })}
<button onclick="yw.pay('tip', { amount: '0.5' }).then(() => (this.textContent = 'thanks!'))">tip 0.5 TON</button>\`,
});

bot.install(widgets()).widgetQuery(tip, async (ctx) => {
  if (ctx.widget.kind === "data") {
    // 1. yw.pay() asked with { wallet: true } — answer with the transaction to send
    return ctx.widget.answer(
      tonTransaction({ messages: [{ address: SHOP_ADDRESS, amount: toNano(ctx.queryData.amount) }], validFor: 120 }),
    );
  }
  if (ctx.widget.kind === "sent_transaction") {
    // 2. the wallet sent it — verify ctx.widget.msgHash on-chain before delivering anything
    await verifyOnChain(ctx.widget.wallet, ctx.widget.msgHash);
    await ctx.widget.answer({ ok: true });
  }
});`;

	const tooling = `import { checkHtml, guardWidgets, lintHtml, measureHtml, minifyHtml, previewPage } from "@yaebal/widget";

await measureHtml(source);   // { bytes, compressedBytes, exact: true, fits } — zlib level 9, like telegram
await checkHtml(source);     // throws WidgetError("INPUT_MEDIA_WIDGET_TOO_LARGE", "… 4211 bytes zlib-compressed …")
lintHtml(source);            // [{ rule: "no-network", severity: "error", line: 12, match: "fetch(", message }]
minifyHtml(source);          // comments out, css minified, whitespace collapsed — scripts untouched
guardWidgets(bot.api);       // validate every widget payload before it is sent

writeFileSync("preview.html", previewPage(source, {
  publicData: votes.encode({ yes: 4, no: 7 }),
  answers: { [vote.pack({ option: "yes" })]: { yes: 5, no: 7 } }, // what request() resolves with
  colorScheme: "dark",
}));`;

	const testing = `import assert from "node:assert/strict";
import { createTestEnv } from "@yaebal/test";

const env = createTestEnv(bot);
const user = env.createUser();

const query = await user.queryWidget(vote.pack({ option: "yes" }));      // widget_query from a pm message
assert.deepEqual(env.widgetAnswer(query.id), { data: '{"yes":1,"no":0}' });

await user.on(message).queryWidget("refresh", { widgetId: "sw" });      // a specific (shared) widget
await user.queryWidget("ping", { inlineMessageId: "im", chatType: "group" });
await user.querySharedWidget("sw", "ping");                             // a forwarded shared widget
await user.queryWidget("pay", { type: { type: "sent_transaction", wallet, msg_hash: "…" } });`;
</script>

<svelte:head>
	<title>@yaebal/widget — yaebal</title>
</svelte:head>

<h1>@yaebal/widget</h1>
<p class="lead">
	html widgets (bot api 10.4), both halves. a widget is a small html app that lives inside a
	message: it draws its state, the bot edits that state, and taps come back as
	<code>widget_query</code> updates. this package covers the bot side (<code>ctx.widget</code>,
	typed queries, json state, send params, limit checks), the widget side (a ~1.1 kb script that packs
	typed queries, decodes state and runs TON payments), and the tooling in between.
</p>

<h2>install</h2>
<Code code={install} title="terminal" lang="sh" />

<h2>a live poll in one file</h2>
<p>
	one <a href="/docs/plugins/callback-data/"><code>callbackData</code></a> namespace describes the
	query, one <code>widgetState</code> codec the state, one <code>defineWidget</code> the widget.
	<code>widgetClient()</code> embeds the namespace's wire format into the widget, so
	<code>yw.ask("vote", …)</code> produces exactly what <code>bot.widgetQuery(vote, …)</code>
	unpacks into <code>ctx.queryData</code>.
</p>
<Code code={usage} title="bot.ts" />

<h2>ctx.widget</h2>
<p>
	<code>widgets()</code> adds <code>ctx.widget</code> to every update (empty outside widget
	queries) and routes nothing itself — use core's <a href="/docs/core/"><code>bot.widgetQuery()</code></a>
	(a string, a RegExp, or a callback-data namespace) or <code>on("widget_query")</code>.
</p>
<Code code={control} title="control.ts" />
<table>
	<thead><tr><th>member</th><th>what it is</th></tr></thead>
	<tbody>
		<tr><td><code>query</code></td><td>the <code>widget_query</code> / <code>shared_widget_query</code>, or <code>undefined</code></td></tr>
		<tr><td><code>kind</code></td><td><code>"data"</code>, <code>"sign_data"</code> or <code>"sent_transaction"</code></td></tr>
		<tr><td><code>isShared</code> / <code>isForward</code> / <code>isInline</code></td><td>where the tap came from</td></tr>
		<tr><td><code>widgetId</code></td><td>the shared widget's id</td></tr>
		<tr><td><code>target</code></td><td><code>{"{ chatId, messageId }"}</code> or <code>{"{ inlineMessageId }"}</code> — the widget's message</td></tr>
		<tr><td><code>wallet</code> / <code>walletCard</code> / <code>msgHash</code> / <code>signData</code></td><td>the TON wallet fields of the query</td></tr>
		<tr><td><code>answered</code></td><td>an answer already went out — also catches raw <code>answerWidgetQuery</code> calls</td></tr>
		<tr><td><code>answer(value?)</code></td><td>answer with <code>value</code> as json (≤1024 bytes); once only, later calls resolve <code>false</code></td></tr>
		<tr><td><code>answerRaw(data?)</code></td><td>answer with a string verbatim</td></tr>
		<tr><td><code>setData({"{ publicData?, chatData? }"}, target?)</code></td><td><code>editMessageWidgetData</code> on the query's message — <code>null</code> clears a slot</td></tr>
		<tr><td><code>setSharedData(publicData, {"{ cacheTime?, widgetId? }"})</code></td><td><code>editSharedWidgetData</code> (at most once per second)</td></tr>
		<tr><td><code>skipAutoAnswer()</code></td><td>the handler will answer later, outside the chain</td></tr>
	</tbody>
</table>

<h3>options</h3>
<table>
	<thead><tr><th>option</th><th>default</th><th>what it does</th></tr></thead>
	<tbody>
		<tr><td><code>autoAnswer</code></td><td><code>true</code></td><td>an unanswered query gets an empty answer when the chain finishes, so the widget resolves <code>null</code> instead of hitting <code>TIMEOUT</code> after 15 s. a chain that throws is left unanswered.</td></tr>
		<tr><td><code>guard</code></td><td><code>true</code></td><td>installs <code>guardWidgets</code> on every update's <code>ctx.api</code></td></tr>
		<tr><td><code>onError</code></td><td>—</td><td>observes a failed auto-answer (the error is swallowed either way)</td></tr>
	</tbody>
</table>

<h2>defineWidget</h2>
<p>
	html, state codecs and send options in one place. every method that produces send params checks
	the html against telegram's limits first, and the result is cached.
</p>
<Code code={define} title="widget.ts" />
<table>
	<thead><tr><th>method</th><th>returns</th></tr></thead>
	<tbody>
		<tr><td><code>message(values?, extra?)</code></td><td><code>sendWidget</code> params minus <code>chat_id</code></td></tr>
		<tr><td><code>to(chatId, values?, extra?)</code></td><td>full <code>sendWidget</code> params</td></tr>
		<tr><td><code>inline(values?, extra?)</code></td><td><code>InputWidgetMessageContent</code></td></tr>
		<tr><td><code>resend(widgetId, values?, extra?)</code> / <code>resendInline(…)</code></td><td><code>sendSharedWidget</code> params / <code>InputSharedWidgetMessageContent</code></td></tr>
		<tr><td><code>edit(target, values)</code></td><td><code>editMessageWidgetData</code> params</td></tr>
		<tr><td><code>encodePublic</code> / <code>encodeChat</code> / <code>decodePublic</code> / <code>decodeChat</code></td><td>through the codecs (strings verbatim without one)</td></tr>
		<tr><td><code>check()</code> / <code>assert()</code></td><td><code>{"{ size, issues, ok }"}</code> without throwing / a <code>WidgetError</code> unless it fits</td></tr>
		<tr><td><code>preview(values?, options?)</code></td><td>a standalone browser page</td></tr>
	</tbody>
</table>

<h2>state</h2>
<p>
	both slots are opaque text of at most 1024 bytes. <code>widgetState&lt;T&gt;()</code> is a json
	codec that enforces the limit on the way out and validates on the way in. with
	<code>revision: true</code> each value is wrapped as <code>{"{ r, v }"}</code> with a strictly
	increasing <code>r</code> — telegram asks shared widgets to ignore polls older than what they
	already drew, and the client does exactly that.
</p>
<Code code={state} title="state.ts" />

<h2>the widget side</h2>
<p>
	<code>widgetClient({"{ actions, revision?, wallet?, global? }"})</code> is a
	<code>&lt;script&gt;</code> for the top of the widget's html that installs <code>window.yw</code>
	(typed as <code>WidgetClientApi</code>). answers come back json-parsed; outside telegram it is
	inert, so the same html works in the preview. the uuid codec and the wallet calls are only
	emitted when an action needs them — the base runtime costs about 1.1 kb of the 4096-byte budget.
</p>
<Code code={client} title="widget.html" lang="html" />
<table>
	<thead><tr><th>member</th><th>what it does</th></tr></thead>
	<tbody>
		<tr><td><code>ask(action, data?)</code></td><td>pack <code>data</code> in the action's wire format and send it</td></tr>
		<tr><td><code>pack(action, data?)</code></td><td>just the packing (throws on a bad payload or over 64 bytes)</td></tr>
		<tr><td><code>request(data, options?)</code></td><td>raw query data</td></tr>
		<tr><td><code>onState(fn)</code> / <code>publicData()</code> / <code>chatData()</code></td><td>the decoded state</td></tr>
		<tr><td><code>on(event, fn)</code> / <code>watch()</code> / <code>unwatch()</code></td><td>widget events and live shared-widget polling</td></tr>
		<tr><td><code>pay(action, data?)</code> / <code>sign(payload, action, data?)</code></td><td>TON wallet flows (<code>wallet: true</code>)</td></tr>
		<tr><td><code>code(error)</code></td><td>the <code>WidgetRequestError</code> code</td></tr>
		<tr><td><code>w</code> / <code>available</code></td><td><code>window.TelegramWidget</code>, and whether it exists</td></tr>
	</tbody>
</table>
<p>
	<code>TelegramWidget</code> and the rest of telegram's widget api (<code>WidgetThemeParams</code>,
	<code>WidgetViewer</code>, <code>WidgetWallet</code>, …) are exported as types for widget code
	written in typescript.
</p>

<h2>TON payments</h2>
<p>
	<code>yw.pay()</code> sends the wallet card with the query; the bot answers with a TON Connect
	transaction (<code>tonTransaction</code> checks 1–255 messages, nanoton amounts, base64 payloads
	and a future <code>valid_until</code>); the widget hands it to the wallet; the bot gets a
	<code>sent_transaction</code> query with <code>msg_hash</code>. <code>toNano</code> /
	<code>fromNano</code> convert exactly.
</p>
<Code code={ton} title="tip.ts" />
<div class="note">
	<strong>verify before delivering.</strong> a <code>sent_transaction</code> query only says the
	wallet sent something. look <code>msg_hash</code> up on-chain and check destination and amount
	before granting anything. a <code>sign_data</code> payload (<code>parseSignData</code>) must be
	checked against <code>ctx.widget.wallet.public_key</code> — the signed domain is
	<code>bot&lt;bot_id&gt;</code>. after a <code>TIMEOUT</code>, ask the bot about the order instead of
	paying again.
</div>

<h2>limits, lint, minify, preview</h2>
<Code code={tooling} title="tooling.ts" />
<ul>
	<li>
		<code>measureHtml</code> / <code>checkHtml</code> measure bytes and zlib level-9 compressed bytes
		exactly as telegram does (<code>node:zlib</code>, also on bun and deno; elsewhere a
		<code>CompressionStream</code> upper bound, flagged <code>exact: false</code>).
	</li>
	<li>
		<code>guardWidgets(api)</code> validates <code>sendWidget</code>, <code>sendSharedWidget</code>,
		<code>editMessageWidgetData</code>, <code>editSharedWidgetData</code>,
		<code>answerWidgetQuery</code> and widget inline results before they're sent.
	</li>
	<li>
		<code>lintHtml</code> flags what the widget sandbox removes: network calls, external scripts and
		resources, form and media elements, unsupported svg, <code>vh</code>, scrolling,
		<code>@import</code>/<code>@font-face</code>, keyboard and touch events, <code>alert</code>.
	</li>
	<li><code>html</code> / <code>raw</code> / <code>json</code> / <code>escapeHtml</code> — an escaping template tag and script-safe json.</li>
	<li>
		<code>previewPage</code> runs a widget in a browser with a <code>TelegramWidget</code> stub;
		<code>window.__widget.setData(…)</code> fires change events and
		<code>window.__widget.requests</code> lists what was sent.
	</li>
	<li><code>WIDGET_LIMITS</code>, and <code>WidgetError</code> whose <code>code</code> uses telegram's own error names.</li>
</ul>

<h2>testing</h2>
<p>
	<a href="/docs/plugins/test/"><code>@yaebal/test</code></a> drives widgets directly:
	<code>user.queryWidget(data, options?)</code>, <code>user.on(message).queryWidget(data)</code>,
	<code>user.querySharedWidget(widgetId, data)</code>, and <code>env.widgetAnswer(queryId)</code> to
	read the bot's answer.
</p>
<Code code={testing} title="widget.test.ts" />

<h2>caveats</h2>
<ul>
	<li>in production, widgets can currently be sent only to private chats and are protected (no forwards); inline-result widgets work in the test environment only.</li>
	<li>a query must be answered within 15 s; one query is in flight per widget; 5 queries per 5 s per user.</li>
	<li>a shared widget's public data can be edited at most once per second.</li>
	<li>the widget engine is not a browser: no network, 8 mb memory, 2000 nodes, 300 ms of cpu per second.</li>
</ul>
<p>
	see the <a href="/docs/telegram/widgets/">widgets guide</a> for the protocol end to end, the
	<a href="https://github.com/neverlane/yaebal/tree/master/examples/widget">widget example</a> (a live
	poll and a TON tip jar), and telegram's <a href="https://core.telegram.org/bots/widgets">widget docs</a>.
</p>
