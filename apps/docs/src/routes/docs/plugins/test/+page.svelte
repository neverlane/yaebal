<script lang="ts">
	import Code from "$lib/Code.svelte";

	const install = `pnpm add -D @yaebal/test`;

	const usage = `import {
  callbackUpdate,
  createContext,
  messageUpdate,
  mockApi,
  runMiddleware,
} from "@yaebal/test";
import { expect, test } from "vitest"; // or node:test, or whatever you use
import { bot } from "./bot.js";

test("replies to /start", async () => {
  const { api, calls } = mockApi();
  const update = messageUpdate({ text: "/start", chatId: 42 });
  const ctx = createContext(update, api);

  await runMiddleware(bot, ctx);

  expect(calls[0]?.method).toBe("sendMessage");
  expect(calls[0]?.params?.chat_id).toBe(42);
});

test("answers a callback query", async () => {
  const { api, calls } = mockApi();
  const update = callbackUpdate({ data: "vote:up", chatId: 1 });
  const ctx = createContext(update, api);

  await runMiddleware(bot, ctx);

  expect(calls[0]?.method).toBe("answerCallbackQuery");
});`;

	const shortcuts = `import { messageContext, runMiddleware } from "@yaebal/test";

// build the update and wrap it in a Context in one call
const ctx = messageContext({ text: "/start", chatId: 42 });
await runMiddleware(bot, ctx);`;

	const results = `import { TelegramError } from "@yaebal/core";
import { mockApi } from "@yaebal/test";

const { api } = mockApi({
  results: {
    sendMessage: { message_id: 42 },
    getChat: () => ({ id: 1, type: "private" }),
    // fails twice, then succeeds — great for testing retry plugins like @yaebal/again
    getMe: (params, attempt) =>
      attempt <= 2
        ? new TelegramError("getMe", 429, "retry after 0")
        : { id: 1, is_bot: true, first_name: "bot" },
  },
});`;

	const hooks = `const { api } = mockApi({
  results: { sendMessage: new TelegramError("sendMessage", 429, "retry after 0") },
});

// before/after/onError registered on mockApi() actually run — not no-ops.
// the mock never waits on delayMs, so retry tests settle instantly.
api.onError((_method, _error, attempt) => (attempt === 1 ? { retry: true } : undefined));

await api.sendMessage({ chat_id: 1 }); // retries once, then throws`;

	const inspect = `const { api, calls, lastCall, callsTo, setResult, reset } = mockApi();

await api.sendMessage({ chat_id: 1, text: "a" });
await api.answerCallbackQuery({ callback_query_id: "1" });

lastCall()?.method;              // → "answerCallbackQuery"
lastCall("sendMessage")?.method; // → "sendMessage"
callsTo("sendMessage").length;   // → 1

setResult("sendMessage", { message_id: 42 }); // override after creation
reset();                                      // clear calls + attempt counters`;

	const lowLevel = `import { createUpdate, detectUpdateType, pollUpdate } from "@yaebal/test";

const poll = pollUpdate({ question: "coffee or tea?", options: ["coffee", "tea"] });

// hand-build any update shape; update_id is filled in for you
const update = createUpdate({
  edited_message: { message_id: 1, date: 0, chat: { id: 1, type: "private" } },
});

detectUpdateType(update); // → "edited_message"`;

	const buttons = `import { findButton, messageContext, mockApi, runMiddleware } from "@yaebal/test";

const { api, calls } = mockApi();
await runMiddleware(bot, messageContext({ text: "/menu" }, api));

const next = findButton(calls[0]?.params?.reply_markup, "Next »");
next?.callback_data; // → "page:2"
next?.row;            // → 1
next?.col;            // → 2`;

	const webhooks = `import { webhookCallback } from "@yaebal/core";
import { webhookRequest, messageUpdate } from "@yaebal/test";

const handler = webhookCallback(bot, { secretToken: "s3cret" });
const res = await handler(
  webhookRequest(messageUpdate({ text: "hi" }), { secretToken: "s3cret" }),
);
res.status; // → 200`;

	const collector = `import { collectUpdates, messageUpdate } from "@yaebal/test";

const { sink, updates } = collectUpdates();
await sink.handleUpdate(messageUpdate({ text: "hi" }));
updates.length; // → 1`;

	const withFetchExample = `import { withFetch } from "@yaebal/test";

await withFetch(
  async () =>
    new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "image/jpeg" } }),
  async () => {
    const res = await panelHandler(request);
    res.status; // → 200
  },
);`;
</script>

<svelte:head>
	<title>@yaebal/test — yaebal</title>
</svelte:head>

<h1>@yaebal/test</h1>
<p class="lead">testing utilities for yaebal bots — with zero dependency on any test runner</p>

<h2>install</h2>
<Code code={install} title="terminal" lang="sh" />

<h2>usage</h2>
<p>
	a fake <code>Api</code> that records every call (and can drive real
	<code>before</code>/<code>after</code>/<code>onError</code> hooks, simulate failures, and retries),
	update factories for every update kind telegram sends, context builders, and helpers for
	webhook/keyboard assertions. wire them into vitest (or <code>node:test</code>, or any runner) and
	assert against the recorded <code>calls</code>.
</p>
<Code code={usage} title="bot.test.ts" />

<p>
	skip a step with the <code>*Context</code> shortcuts, which build the update and wrap it in a
	<code>Context</code> in one call:
</p>
<Code code={shortcuts} title="shortcut.ts" />

<h2>mockApi</h2>
<p>
	<code>mockApi(options?)</code> returns <code>&#123; api, calls, hooks, lastCall, callsTo, setResult,
	reset &#125;</code>. every method on <code>api</code> records <code>&#123; method, params &#125;</code>
	into <code>calls</code> and resolves to a sensible default: an auto-incrementing
	<code>&#123; message_id &#125;</code> for <code>send*</code>, <code>copyMessage</code> and
	<code>forwardMessage</code>; <code>true</code> for <code>answerCallbackQuery</code>; a stub bot for
	<code>getMe</code>; <code>&#123;&#125;</code> otherwise.
</p>

<h3>canned results & error simulation</h3>
<p>
	pass <code>results</code> to control exactly what a method returns — a static value, an
	<code>Error</code> (which makes the call throw, e.g. a <code>TelegramError</code>), or a function of
	<code>(params, attempt)</code> so you can simulate "fails N times, then succeeds":
</p>
<Code code={results} title="results.ts" />

<h3>real hooks, not no-ops</h3>
<p>
	unlike a bare stub, <code>before</code>/<code>after</code>/<code>onError</code> registered on a
	<code>mockApi()</code> actually run through the call pipeline — register a hook exactly as you would
	on the production <code>Api</code> and it fires, including retries requested by an
	<code>onError</code> hook (the same contract <a href="/docs/plugins/again"><code>@yaebal/again</code></a>
	uses). the mock never actually waits on a requested <code>delayMs</code>, so retry tests settle
	instantly.
</p>
<Code code={hooks} title="hooks.ts" />

<h3>inspecting calls</h3>
<Code code={inspect} title="inspect.ts" />

<h2>contexts</h2>
<p>
	<code>createContext(update, api?, updateType?)</code> wraps an <code>Update</code> in a core
	<code>Context</code>. the api defaults to a fresh <code>mockApi().api</code>; the update type is
	auto-detected via <code>detectUpdateType</code> unless you pass <code>updateType</code>. run a
	composer's middleware against it with <code>runMiddleware(composer, ctx)</code> — it resolves once
	the chain settles. <code>messageContext</code> and <code>callbackContext</code> combine the update
	factory and <code>createContext</code> into one call.
</p>

<h2>building updates</h2>
<p>
	factories exist for every update kind telegram sends — <code>messageUpdate</code>,
	<code>editedMessageUpdate</code>, <code>channelPostUpdate</code>, <code>editedChannelPostUpdate</code>,
	<code>callbackUpdate</code>, <code>inlineQueryUpdate</code>, <code>chosenInlineResultUpdate</code>,
	<code>shippingQueryUpdate</code>, <code>preCheckoutQueryUpdate</code>, <code>pollUpdate</code>,
	<code>pollAnswerUpdate</code>, <code>myChatMemberUpdate</code>, <code>chatMemberUpdate</code>, and
	<code>chatJoinRequestUpdate</code>. <code>createUpdate</code> is the escape hatch for anything else,
	filling in a fresh <code>update_id</code>. use <code>detectUpdateType</code> to infer which payload
	key an update carries.
</p>
<Code code={lowLevel} title="updates.ts" />

<h2>inline keyboards</h2>
<p>
	<code>findButton(markup, match)</code> searches a <code>reply_markup</code>-shaped object (e.g. from a
	recorded call's params) for a button whose text matches a string or regex, returning it with its
	<code>row</code>/<code>col</code>.
</p>
<Code code={buttons} title="buttons.ts" />

<h2>webhooks & runners</h2>
<p>
	<code>webhookRequest(update, options?)</code> builds a <code>Request</code> the way telegram would
	POST it to a webhook handler (<code>@yaebal/core</code>'s <code>webhookCallback</code>, or
	<code>@yaebal/web</code>'s <code>webhook</code>).
</p>
<Code code={webhooks} title="webhook.test.ts" />
<p>
	<code>collectUpdates()</code> gives you a minimal <code>UpdateSink</code> (the
	<code>&#123; handleUpdate &#125;</code> shape webhooks and runners expect) that just records what it
	receives — handy when you don't need a full <code>Bot</code>.
</p>
<Code code={collector} title="collector.test.ts" />
<p>
	<code>withFetch(handler, fn)</code> stubs <code>globalThis.fetch</code> for the duration of
	<code>fn</code>, restoring the original afterwards even if <code>fn</code> throws — for code that
	proxies uploads or downloads.
</p>
<Code code={withFetchExample} title="fetch.test.ts" />

<h2>api</h2>
<table>
	<thead>
		<tr><th>export</th><th>signature</th><th>description</th></tr>
	</thead>
	<tbody>
		<tr><td><code>mockApi</code></td><td><code>(options?: MockApiOptions) =&gt; MockApi</code></td><td>fake <code>Api</code> recording every call, with working hooks and configurable results</td></tr>
		<tr><td><code>createUpdate</code></td><td><code>(partial?: Partial&lt;Update&gt;) =&gt; Update</code></td><td>build an update, filling in a fresh <code>update_id</code></td></tr>
		<tr><td><code>messageUpdate</code></td><td><code>(options?: MessageUpdateOptions) =&gt; Update</code></td><td>build a <code>message</code> update</td></tr>
		<tr><td><code>editedMessageUpdate</code></td><td><code>(options?: MessageUpdateOptions) =&gt; Update</code></td><td>build an <code>edited_message</code> update</td></tr>
		<tr><td><code>channelPostUpdate</code></td><td><code>(options?: MessageUpdateOptions) =&gt; Update</code></td><td>build a <code>channel_post</code> update</td></tr>
		<tr><td><code>editedChannelPostUpdate</code></td><td><code>(options?: MessageUpdateOptions) =&gt; Update</code></td><td>build an <code>edited_channel_post</code> update</td></tr>
		<tr><td><code>callbackUpdate</code></td><td><code>(options?: CallbackUpdateOptions) =&gt; Update</code></td><td>build a <code>callback_query</code> update</td></tr>
		<tr><td><code>inlineQueryUpdate</code></td><td><code>(options?: InlineQueryUpdateOptions) =&gt; Update</code></td><td>build an <code>inline_query</code> update</td></tr>
		<tr><td><code>chosenInlineResultUpdate</code></td><td><code>(options?: ChosenInlineResultUpdateOptions) =&gt; Update</code></td><td>build a <code>chosen_inline_result</code> update</td></tr>
		<tr><td><code>shippingQueryUpdate</code></td><td><code>(options?: ShippingQueryUpdateOptions) =&gt; Update</code></td><td>build a <code>shipping_query</code> update</td></tr>
		<tr><td><code>preCheckoutQueryUpdate</code></td><td><code>(options?: PreCheckoutQueryUpdateOptions) =&gt; Update</code></td><td>build a <code>pre_checkout_query</code> update</td></tr>
		<tr><td><code>pollUpdate</code></td><td><code>(options?: PollUpdateOptions) =&gt; Update</code></td><td>build a <code>poll</code> update</td></tr>
		<tr><td><code>pollAnswerUpdate</code></td><td><code>(options?: PollAnswerUpdateOptions) =&gt; Update</code></td><td>build a <code>poll_answer</code> update</td></tr>
		<tr><td><code>myChatMemberUpdate</code></td><td><code>(options?: ChatMemberUpdateOptions) =&gt; Update</code></td><td>build a <code>my_chat_member</code> update</td></tr>
		<tr><td><code>chatMemberUpdate</code></td><td><code>(options?: ChatMemberUpdateOptions) =&gt; Update</code></td><td>build a <code>chat_member</code> update</td></tr>
		<tr><td><code>chatJoinRequestUpdate</code></td><td><code>(options?: ChatJoinRequestUpdateOptions) =&gt; Update</code></td><td>build a <code>chat_join_request</code> update</td></tr>
		<tr><td><code>createContext</code></td><td><code>(update, api?, updateType?) =&gt; Context</code></td><td>wrap an update in a core <code>Context</code></td></tr>
		<tr><td><code>messageContext</code></td><td><code>(options?: MessageUpdateOptions, api?: Api) =&gt; Context</code></td><td>build a <code>message</code> update and wrap it in one call</td></tr>
		<tr><td><code>callbackContext</code></td><td><code>(options?: CallbackUpdateOptions, api?: Api) =&gt; Context</code></td><td>build a <code>callback_query</code> update and wrap it in one call</td></tr>
		<tr><td><code>runMiddleware</code></td><td><code>(composer: Composer&lt;C&gt;, ctx: C) =&gt; Promise&lt;void&gt;</code></td><td>run a composer's middleware against a context</td></tr>
		<tr><td><code>detectUpdateType</code></td><td><code>(update: Update) =&gt; UpdateName</code></td><td>infer the payload key; defaults to <code>"message"</code></td></tr>
		<tr><td><code>findButton</code></td><td><code>(markup, match: string | RegExp) =&gt; FoundButton | undefined</code></td><td>find an inline keyboard button by text</td></tr>
		<tr><td><code>collectUpdates</code></td><td><code>() =&gt; UpdateCollector</code></td><td>a minimal <code>UpdateSink</code> that records what it receives</td></tr>
		<tr><td><code>webhookRequest</code></td><td><code>(update, options?: WebhookRequestOptions) =&gt; Request</code></td><td>build a webhook POST request carrying an update</td></tr>
		<tr><td><code>withFetch</code></td><td><code>(handler: typeof fetch, fn) =&gt; Promise&lt;T&gt;</code></td><td>stub <code>globalThis.fetch</code> for <code>fn</code>, restoring it after</td></tr>
	</tbody>
</table>

<h3>interfaces</h3>
<table>
	<thead>
		<tr><th>type</th><th>fields</th></tr>
	</thead>
	<tbody>
		<tr><td><code>RecordedCall</code></td><td><code>method: string</code> · <code>params: Record&lt;string, unknown&gt; | undefined</code></td></tr>
		<tr><td><code>MockApiOptions</code></td><td><code>results?: Record&lt;string, unknown | Error | ((params, attempt: number) =&gt; unknown)&gt;</code></td></tr>
		<tr><td><code>MockApi</code></td><td><code>api: Api</code> · <code>calls: RecordedCall[]</code> · <code>hooks</code> · <code>lastCall</code> · <code>callsTo</code> · <code>setResult</code> · <code>reset</code></td></tr>
		<tr><td><code>MessageUpdateOptions</code></td><td><code>text?: string</code> · <code>chatId?: number</code> · <code>fromId?: number</code> · <code>chatType?: "private" | "group" | "supergroup" | "channel"</code></td></tr>
		<tr><td><code>CallbackUpdateOptions</code></td><td><code>data?: string</code> · <code>chatId?: number</code> · <code>fromId?: number</code></td></tr>
		<tr><td><code>FoundButton</code></td><td>the button's own fields, plus <code>row: number</code> · <code>col: number</code></td></tr>
		<tr><td><code>UpdateCollector</code></td><td><code>sink: UpdateSink</code> · <code>updates: Update[]</code></td></tr>
		<tr><td><code>WebhookRequestOptions</code></td><td><code>url?: string</code> · <code>method?: string</code> · <code>secretToken?: string</code> · <code>headers?: Record&lt;string, string&gt;</code></td></tr>
	</tbody>
</table>
