# @yaebal/widget

html widgets ([bot api 10.4](https://core.telegram.org/bots/widgets)), both halves. a widget is a small html app that lives inside a message: it draws its state, the bot edits that state, and taps come back as `widget_query` updates. this package covers the bot side (`ctx.widget`, typed queries, json state, send params, limit checks), the widget side (a ~1.1 kb script that packs typed queries, decodes state and runs TON payments), and the tooling in between (telegram-exact size checks, a sandbox linter, a minifier, a browser preview).

## install

```sh
pnpm add @yaebal/widget @yaebal/callback-data
```

## usage

one action, one state codec, one widget:

```ts
import { callbackData, field } from "@yaebal/callback-data";
import { defineWidget, html, widgetClient, widgetState, widgets } from "@yaebal/widget";

const vote = callbackData("vote", { option: field.enum(["yes", "no"]) });
const tally = widgetState<{ yes: number; no: number }>({ revision: true });

const poll = defineWidget({
	publicData: tally,
	html: html`${widgetClient({ actions: { vote }, revision: true })}
<button id="yes">yes <b></b></button> <button id="no">no <b></b></button>
<script>
	const draw = (t) => t && ["yes", "no"].forEach((k) => (document.querySelector("#" + k + " b").textContent = t[k]));
	yw.onState(({ publicData }) => draw(publicData));
	for (const id of ["yes", "no"]) document.getElementById(id).onclick = () => yw.ask("vote", { option: id }).then(draw);
</script>`,
});

const counts = { yes: 0, no: 0 };

bot.install(widgets())
	.command("poll", async (ctx) => ctx.sendWidget(await poll.message({ publicData: counts })))
	.widgetQuery(vote, async (ctx) => {
		counts[ctx.queryData.option]++; // ctx.queryData: { option: "yes" | "no" }
		await ctx.widget.setData({ publicData: tally.encode(counts) }); // every viewer redraws
		await ctx.widget.answer(counts); // the tapping user's yw.ask() resolves with it
	});
```

`bot.widgetQuery()` is core's router (string, regex, or a callback-data namespace — like `callbackQuery()`). `widgets()` adds `ctx.widget`.

## ctx.widget

| member | what it is |
| --- | --- |
| `query` | the `widget_query` / `shared_widget_query`, or `undefined` |
| `kind` | `"data"`, `"sign_data"` or `"sent_transaction"` |
| `isShared` / `isForward` / `isInline` | where the tap came from |
| `widgetId` | the shared widget's id |
| `target` | `{ chatId, messageId }` or `{ inlineMessageId }` — the widget's message |
| `wallet` / `walletCard` / `msgHash` / `signData` | TON wallet fields of the query |
| `answered` | an answer already went out (also catches raw `answerWidgetQuery` calls) |
| `answer(value?)` | answer with `value` as json (≤1024 bytes); once only |
| `answerRaw(data?)` | answer with a string verbatim |
| `setData({ publicData?, chatData? }, target?)` | `editMessageWidgetData` — `null` clears a slot |
| `setSharedData(publicData, { cacheTime?, widgetId? })` | `editSharedWidgetData` |
| `skipAutoAnswer()` | the handler will answer later itself |

options: `autoAnswer` (default `true` — an unanswered query gets an empty answer when the chain finishes, so the widget resolves `null` instead of a 15 s `TIMEOUT`; a throwing chain is left unanswered), `guard` (default `true` — `guardWidgets` on every `ctx.api`), `onError`.

## defineWidget

```ts
const card = defineWidget({ html, publicData?, chatData?, width?, height?, allowQueries?, shared?, minify? });
```

| method | returns |
| --- | --- |
| `message(values?, extra?)` | `sendWidget` params minus `chat_id` (checks the html first) |
| `to(chatId, values?, extra?)` | full `sendWidget` params |
| `inline(values?, extra?)` | `InputWidgetMessageContent` for inline results |
| `resend(widgetId, values?, extra?)` / `resendInline(...)` | a shared widget again |
| `edit(target, values)` | `editMessageWidgetData` params |
| `encodePublic` / `encodeChat` / `decodePublic` / `decodeChat` | through the codecs |
| `check()` | `{ size, issues, ok }` — measured + linted, never throws |
| `assert()` | throws a `WidgetError` unless it fits |
| `preview(values?, options?)` | a standalone browser page |

`allowQueries` defaults to `true`, `minify` to `true`. `sharedWidgetId(message)` reads the id `sendWidget({ is_shared: true })` returns.

## state

```ts
const votes = widgetState<Votes>({ revision: true, validate: isVotes });
votes.encode(v); // json, ≤1024 bytes or INPUT_MEDIA_WIDGET_DATA_TOO_LARGE
votes.decode(raw); // Votes | undefined (absent, malformed, or failing validate)
```

`revision: true` wraps values as `{ r, v }` with a strictly increasing `r` — telegram asks shared widgets to drop polls older than what they already drew, and the client does exactly that.

## the widget side — widgetClient

`widgetClient({ actions, revision?, wallet?, global? })` is a `<script>` for the top of the widget's html. it installs `window.yw` (typed as `WidgetClientApi`):

| member | what it does |
| --- | --- |
| `ask(action, data?)` | packs `data` in the action's `@yaebal/callback-data` wire format and sends it — call it synchronously in a tap handler |
| `pack(action, data?)` | just the packing (throws on a bad payload or >64 bytes) |
| `request(data, options?)` | raw query data |
| `onState(fn)` | `fn({ publicData, chatData })` now and on every change, decoded |
| `publicData()` / `chatData()` | the decoded state |
| `on(event, fn)` / `watch()` / `unwatch()` | events and live shared-widget polling |
| `pay(action, data?)` | `wallet: true` — asks the bot for a transaction and passes it to the TON wallet |
| `sign(payload, action, data?)` | `wallet: true` — asks the wallet to sign |
| `code(error)` | the `WidgetRequestError` code (`NOT_ALLOWED`, `BUSY`, `TIMEOUT`, …) |
| `w` / `available` | `window.TelegramWidget`, and whether it exists |

answers come back json-parsed. outside telegram it's inert (`available: false`, requests reject with `NOT_ALLOWED`), so the same html works in the preview. the uuid codec and wallet calls are only emitted when used.

`TelegramWidget` and the rest of telegram's widget api are exported as types, for widget code written in typescript.

## TON payments

```ts
.widgetQuery(tip, async (ctx) => {
	if (ctx.widget.kind === "data") {
		// the widget called yw.pay(): answer with the transaction to send
		return ctx.widget.answer(tonTransaction({ messages: [{ address: SHOP, amount: toNano("0.5") }] }));
	}
	if (ctx.widget.kind === "sent_transaction") {
		await verifyOnChain(ctx.widget.msgHash); // yours — toncenter, tonapi, …
		await ctx.widget.answer({ ok: true });
	}
});
```

`tonTransaction` checks 1–255 messages, nanoton amounts, base64 payloads and a future `valid_until` (default now + 300 s). `toNano` / `fromNano` convert exactly. `parseSignData` parses a `sign_data` query's payload — verify its signature against `ctx.widget.wallet.public_key` (domain `bot<bot_id>`) before trusting it.

## limits, lint, minify, preview

- `measureHtml(html)` / `checkHtml(html)` — bytes and zlib level-9 compressed bytes, exactly as telegram counts them (`node:zlib`, also on bun and deno; elsewhere a `CompressionStream` upper bound).
- `guardWidgets(api)` — validates `sendWidget`, `sendSharedWidget`, `editMessageWidgetData`, `editSharedWidgetData`, `answerWidgetQuery` and widget inline results before they're sent. `widgets()` installs it per update; call it on `bot.api` for sends outside handlers.
- `lintHtml(html)` — flags what the widget sandbox removes: network calls, external scripts and resources, form/media elements, unsupported svg, `vh`, scrolling, `@import`/`@font-face`, keyboard and touch events, `alert`.
- `minifyHtml(html)` — comments out, css minified, whitespace collapsed; scripts and `<pre>` untouched.
- `html` / `raw` / `json` / `escapeHtml` — an escaping template tag and script-safe json.
- `previewPage(html, options)` — a page with a `TelegramWidget` stub (theme, state, `answers` map, wallet). `window.__widget.setData(...)` fires change events, `window.__widget.requests` lists what was sent.
- `WIDGET_LIMITS`, `WidgetError` (with telegram's error names as `code`), `assertData` / `assertAnswer` / `assertQueryData` / `assertCacheTime`.

## testing

`@yaebal/test` drives widgets: `user.queryWidget(data, options?)` / `user.on(message).queryWidget(data)` dispatch `widget_query`, `user.querySharedWidget(widgetId, data)` a forwarded shared widget, and `env.widgetAnswer(queryId)` reads the bot's answer.

```ts
const env = createTestEnv(bot);
const query = await env.createUser().queryWidget(vote.pack({ option: "yes" }));
assert.deepEqual(env.widgetAnswer(query.id), { data: '{"yes":1,"no":0}' });
```

## caveats

- in production, widgets can currently be sent only to private chats, and they are protected (no forwards); inline-result widgets work in the test environment only.
- a query must be answered within 15 s; one query is in flight per widget; 5 queries per 5 s per user.
- shared widgets' public data can be edited at most once per second.
- the widget engine isn't a browser: no network, 8 mb memory, 2000 nodes, 300 ms cpu per second. see [the docs](https://core.telegram.org/bots/widgets).

---

part of [**yaebal**](https://github.com/neverlane/yaebal) - a type-safe, runtime-agnostic Telegram Bot API framework. MIT.
