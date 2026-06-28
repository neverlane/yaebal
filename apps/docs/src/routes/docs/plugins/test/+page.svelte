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
import { expect, test } from "vitest";
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

	const lowLevel = `import { createUpdate, detectUpdateType } from "@yaebal/test";

// hand-build any update shape; update_id is filled in for you
const update = createUpdate({
  edited_message: { message_id: 1, date: 0, chat: { id: 1, type: "private" } },
});

detectUpdateType(update); // → "edited_message"`;
</script>

<svelte:head>
	<title>@yaebal/test — yaebal</title>
</svelte:head>

<h1>@yaebal/test</h1>
<p class="lead">testing utilities for yaebal bots</p>

<h2>install</h2>
<Code code={install} title="terminal" lang="sh" />

<h2>usage</h2>
<p>
	a fake <code>Api</code> that records every call, update factories that produce real
	<code>Update</code> shapes, and helpers to run middleware in isolation. wire them into vitest (or
	any runner) and assert against the recorded <code>calls</code>.
</p>
<Code code={usage} title="bot.test.ts" />

<h2>mockApi</h2>
<p>
	<code>mockApi()</code> returns <code>&#123; api, calls &#125;</code>. every method on
	<code>api</code> records <code>&#123; method, params &#125;</code> into the <code>calls</code> array
	and resolves to a sensible default: <code>&#123; message_id: 1 &#125;</code> for
	<code>send*</code>, <code>copyMessage</code> and <code>forwardMessage</code>; <code>true</code> for
	<code>answerCallbackQuery</code>; a stub bot for <code>getMe</code>; <code>&#123;&#125;</code>
	otherwise. hook registrars (<code>before</code>/<code>after</code>/<code>onError</code>) are no-ops
	that return the api for chaining.
</p>

<h2>contexts</h2>
<p>
	<code>createContext(update, api?, updateType?)</code> wraps an <code>Update</code> in a core
	<code>Context</code>. the api defaults to a fresh <code>mockApi().api</code>; the update type is
	auto-detected via <code>detectUpdateType</code> unless you pass <code>updateType</code>. run a
	composer's middleware against it with <code>runMiddleware(composer, ctx)</code> — it resolves once
	the chain settles.
</p>

<h2>building updates</h2>
<p>
	the factories cover the common cases; <code>createUpdate</code> is the escape hatch for anything
	else, filling in a fresh <code>update_id</code>. use <code>detectUpdateType</code> to infer which
	payload key an update carries.
</p>
<Code code={lowLevel} title="updates.ts" />

<h2>api</h2>
<table>
	<thead>
		<tr><th>export</th><th>signature</th><th>description</th></tr>
	</thead>
	<tbody>
		<tr><td><code>mockApi</code></td><td><code>() =&gt; MockApi</code></td><td>fake <code>Api</code> recording every call into <code>calls</code></td></tr>
		<tr><td><code>createUpdate</code></td><td><code>(partial?: Partial&lt;Update&gt;) =&gt; Update</code></td><td>build an update, filling in a fresh <code>update_id</code></td></tr>
		<tr><td><code>messageUpdate</code></td><td><code>(options?: MessageUpdateOptions) =&gt; Update</code></td><td>build a <code>message</code> update</td></tr>
		<tr><td><code>callbackUpdate</code></td><td><code>(options?: CallbackUpdateOptions) =&gt; Update</code></td><td>build a <code>callback_query</code> update</td></tr>
		<tr><td><code>createContext</code></td><td><code>(update, api?, updateType?) =&gt; Context</code></td><td>wrap an update in a core <code>Context</code></td></tr>
		<tr><td><code>runMiddleware</code></td><td><code>(composer: Composer&lt;C&gt;, ctx: C) =&gt; Promise&lt;void&gt;</code></td><td>run a composer's middleware against a context</td></tr>
		<tr><td><code>detectUpdateType</code></td><td><code>(update: Update) =&gt; UpdateName</code></td><td>infer the payload key; defaults to <code>"message"</code></td></tr>
	</tbody>
</table>

<h3>interfaces</h3>
<table>
	<thead>
		<tr><th>type</th><th>fields</th></tr>
	</thead>
	<tbody>
		<tr><td><code>RecordedCall</code></td><td><code>method: string</code> · <code>params: Record&lt;string, unknown&gt; | undefined</code></td></tr>
		<tr><td><code>MockApi</code></td><td><code>api: Api</code> · <code>calls: RecordedCall[]</code></td></tr>
		<tr><td><code>MessageUpdateOptions</code></td><td><code>text?: string</code> · <code>chatId?: number</code> · <code>fromId?: number</code> · <code>chatType?: "private" | "group" | "supergroup" | "channel"</code></td></tr>
		<tr><td><code>CallbackUpdateOptions</code></td><td><code>data?: string</code> · <code>chatId?: number</code> · <code>fromId?: number</code></td></tr>
	</tbody>
</table>
