<script lang="ts">
	import Code from "$lib/Code.svelte";

	const install = `pnpm add -D @yaebal/test`;

	const usage = `import { Composer } from "@yaebal/core";
import { createTestEnv } from "@yaebal/test";
import { expect, test } from "vitest"; // or node:test, or whatever you use
import { bot } from "./bot.js";

test("replies to /start", async () => {
  const env = createTestEnv(bot);
  const linia = env.createUser({ firstName: "Linia" });

  await linia.sendCommand("start");

  expect(env.lastApiCall("sendMessage")?.params?.text).toBe("Welcome!");
});

test("clicking a button fires the callback handler", async () => {
  const env = createTestEnv(bot);
  const linia = env.createUser();

  await linia.sendCommand("start");
  const bubble = env.lastBotMessage({ withReplyMarkup: true });
  if (bubble) await linia.on(bubble).clickByText("Next »");
});`;

	const textAndCommands = `await linia.sendMessage("hello");
await linia.sendMessage(group, "hello group");  // ChatActor as the first arg
await linia.sendReply(originalMsg, "thanks!");  // reply_to_message + same chat, inferred
await linia.sendCommand("start");               // text: "/start", bot_command entity
await linia.sendCommand("start", "ref42");      // text: "/start ref42"

import { bold, format } from "@yaebal/core";

// format()/fmt results work too — entities are extracted automatically
await linia.sendMessage(format\`Check out \${bold("this")}\`);`;

	const media = `// every method auto-generates file_id/file_unique_id and Telegram's required fields
await linia.sendPhoto({ caption: "Look!", spoiler: true });
await linia.sendVideo();
await linia.sendDocument();
await linia.sendVoice();
await linia.sendAudio();
await linia.sendAnimation();
await linia.sendVideoNote();
await linia.sendSticker({ emoji: "🔥" });
await linia.sendLocation({ latitude: 48.8566, longitude: 2.3522 });
await linia.sendContact({ phone_number: "+1234567890", first_name: "Bob" });
await linia.sendDice("🎯");

await linia.sendMediaGroup(group, [
  { photo: [{ file_id: "f1", file_unique_id: "u1", width: 800, height: 600 }] },
  { photo: [{ file_id: "f2", file_unique_id: "u2", width: 800, height: 600 }] },
]); // one update per item, all sharing media_group_id`;

	const buttonsReactions = `await linia.click("vote:up", msg);          // raw callback_data
await linia.on(msg).click("vote:up");        // same, message pre-bound
await linia.on(msg).clickByText("Next »");   // scans msg's inline_keyboard for the label

await linia.react("👍", msg);   // old_reaction inferred from linia's last react()
await linia.react("❤", msg);    // old: ["👍"], new: ["❤"] — inferred, not passed in
await linia.react([], msg);     // clear all of linia's reactions

await linia.join(group);   // chat.members + a chat_member update + service message
await linia.leave(group);`;

	const paymentsInline = `await linia.sendInlineQuery("cats", group);   // chat_type derived from group.type
await linia.chooseInlineResult("result-1", "cats");

// the full flow: pre_checkout_query → verifies the bot answered { ok: true } → successful_payment.
// throws if the bot never answers, or answers with ok: false — just like real Telegram would
// never deliver successful_payment in that case.
await linia.sendSuccessfulPayment({ invoice_payload: "sub_monthly" });`;

	const scopes = `const group = env.createChat({ type: "group", title: "devs" });

await linia.in(group).sendMessage("morning team");
await linia.in(group).sendCommand("help");
await linia.in(group).join();
await linia.in(group).on(msg).clickByText("yes");

await linia.on(msg).click("action:1");
await linia.on(msg).react("👍");
await linia.on(msg).editMessage("updated");`;

	const lastBotMessage = `bot.on("message", (ctx) =>
  ctx.send("Pick:", { reply_markup: { inline_keyboard: [[{ text: "Next", callback_data: "next" }]] } }),
);
bot.callbackQuery("next", async (ctx) => {
  const { chat, message_id } = ctx.callbackQuery.message;
  await ctx.api.call("editMessageText", { chat_id: chat.id, message_id, text: "Done!" });
});

await linia.sendMessage("hi");
const bubble = env.lastBotMessage()!;
await linia.on(bubble).clickByText("Next");
bubble.text; // "Done!" — same object, mutated in place, even though we captured it before the edit`;

	const onApiExample = `env.onApi("getMe", { id: 7, is_bot: true, first_name: "MyBot", username: "my_bot" });

// { times: 1 } is one-shot, then falls back to the next queued/permanent reply —
// perfect for "first call fails, second succeeds":
env.onApi("sendMessage", apiError(429, "Too Many Requests", { retry_after: 1 }), { times: 1 });
env.onApi("sendMessage", { message_id: 1, date: 0, chat: { id: 1, type: "private" } });`;

	const apiErrorExample = `import { apiError } from "@yaebal/test";
import { TelegramError } from "@yaebal/core";

env.onApi("sendMessage", apiError(403, "Forbidden: bot was blocked by the user"));

// the bot sees a real TelegramError (TestApiError extends it):
try {
  await ctx.reply("hi");
} catch (error) {
  error instanceof TelegramError; // true
  error.code;                     // 403
  error.parameters;               // response_parameters when Telegram sends them
}`;

	const strictModes = `const env = createTestEnv(bot, { strictApi: true });      // throw on an unstubbed method
const env2 = createTestEnv(bot, { strictDispatch: true }); // throw if no handler consumed the update`;

	const clockExample = `const env = createTestEnv(bot);
env.useFakeTimers(); // arm it *before* the code under test schedules a timer you want to control

await linia.sendCommand("start"); // handler calls setTimeout(..., 60 * 60 * 1000) internally

await env.advanceTime(60 * 60 * 1000); // fires it instantly
env.shutdown(); // restores real timers — always call this in teardown`;

	const standaloneClock = `import { installTestClock } from "@yaebal/test";

const clock = installTestClock(1_700_000_000_000);
setInterval(() => {/* … */}, 1000);
await clock.advance(3500); // fires 3 times
clock.restore();`;

	const packExample = `import type { TestPack } from "@yaebal/test";

export function myPluginTestPack(options?: MyPluginOptions): TestPack {
  return {
    name: "my-plugin",
    setup(env) {
      installMyPlugin(env.api, options); // wire whatever the plugin needs onto env.api/env
    },
  };
}

const env = createTestEnv(bot, { packs: [myPluginTestPack()] });`;

	const lowLevel = `import { createUpdate, detectUpdateType, pollUpdate } from "@yaebal/test";

const poll = pollUpdate({ question: "coffee or tea?", options: ["coffee", "tea"] });

// hand-build any update shape; update_id is filled in for you
const update = createUpdate({
  edited_message: { message_id: 1, date: 0, chat: { id: 1, type: "private" } },
});

detectUpdateType(update); // → "edited_message"
await env.dispatch(update); // ship it through the bot directly`;

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

	const upgrade = `- const { api, calls } = mockApi();
- await runMiddleware(bot, createContext(messageUpdate({ text: "/start" }), api));
- assert.equal(calls[0]?.method, "sendMessage");
+ const env = createTestEnv(bot);
+ await env.createUser().sendCommand("start");
+ assert.equal(env.lastApiCall("sendMessage")?.method, "sendMessage");`;
</script>

<svelte:head>
	<title>@yaebal/test — yaebal</title>
</svelte:head>

<h1>@yaebal/test</h1>
<p class="lead">
	the most complete test framework for Telegram bots on the market — virtual users and chats
	that send your bot real updates, a fully intercepted api, a virtual clock, and zero dependency
	on any test runner
</p>

<h2>install</h2>
<Code code={install} title="terminal" lang="sh" />

<h2>quick start</h2>
<p>
	<code>createTestEnv(bot)</code> wraps any <code>Composer</code>/<code>Bot</code>, intercepts every
	outgoing api call (no real HTTP, ever), and hands you actor factories. actors send the bot real
	updates — messages, commands, media, reactions, button clicks, joins, payments — the way real
	Telegram users would.
</p>
<Code code={usage} title="bot.test.ts" />

<h2>actors — users drive the scenario</h2>
<p>
	<code>env.createUser(options?)</code> returns a <code>UserActor</code>. text and commands accept a
	plain string or a <code>format()</code>/<code>fmt</code> result — entities are extracted
	automatically:
</p>
<Code code={textAndCommands} title="text.ts" />

<h3>media</h3>
<p>
	every media shortcut auto-generates <code>file_id</code>/<code>file_unique_id</code> and whatever
	fields Telegram requires, and accepts an optional leading <code>ChatActor</code> to target a
	specific chat.
</p>
<Code code={media} title="media.ts" />

<h3>buttons, reactions, joins</h3>
<p>
	reaction state is tracked per-message automatically — <code>old_reaction</code> is inferred from
	that user's last <code>react()</code> on the message, tracked independently per user.
</p>
<Code code={buttonsReactions} title="interactions.ts" />

<h3>inline mode & payments</h3>
<Code code={paymentsInline} title="payments.ts" />

<h3><code>.in(chat)</code> / <code>.on(message)</code> — scopes</h3>
<p>
	<code>.in(chat)</code> pre-binds every send method to a chat; <code>.on(message)</code> pre-binds
	click/react/edit/forward/pin to a message. chain them for "as this user, in this chat, on this
	message."
</p>
<Code code={scopes} title="scopes.ts" />

<h2>chats</h2>
<p>
	<code>env.createChat(&#123; type, title?, username? &#125;)</code> builds a
	<code>ChatActor</code> (<code>group</code>/<code>supergroup</code>/<code>channel</code>/<code
	>private</code>). <code>chat.members</code> tracks who's joined;
	<code>chat.setMembership</code>/<code>chat.membershipOf</code> track arbitrary status for
	<code>getChatMember</code>-style assertions; <code>chat.post(text)</code> emits an anonymous
	channel post (<code>update.channel_post</code>, no <code>from</code>) and throws on non-channel
	chats.
</p>

<h2>inspecting what the bot did</h2>
<p>
	<code>env.apiCalls</code> records every <code>&#123; method, params, result | error, at &#125;</code
	>. <code>env.lastApiCall(method?)</code> and <code>env.callsTo(method)</code> filter it;
	<code>env.clearApiCalls()</code> resets between logical phases of a test.
</p>

<h3><code>env.lastBotMessage(query?)</code> — the bot's own messages, live</h3>
<p>
	a <code>BotMessage</code> mirror of the bot's most recent
	<code>send*</code>/<code>forwardMessage</code>/<code>copyMessage</code> — populated straight from
	the outgoing params, no <code>onApi</code> override required — and kept in sync in place as
	<code>editMessageText</code>/<code>editMessageCaption</code>/<code
	>editMessageReplyMarkup</code> calls land, even for a reference captured before the edit:
</p>
<Code code={lastBotMessage} title="bubble.test.ts" />
<p>
	filters (optional, combined with AND): <code>&#123; chat &#125;</code> scope to a chat;
	<code>&#123; withReplyMarkup: true &#125;</code> skip plain status messages and find the last
	interactive bubble; <code>&#123; where: (call) =&gt; boolean &#125;</code> an arbitrary predicate
	over the call that produced/last touched the message. <code>env.botMessage(chatId, messageId)</code>
	looks one up directly.
</p>

<h2>mocking the api</h2>
<p>
	without any setup: an auto-incrementing <code>message_id</code> for
	<code>send*</code>/<code>copyMessage</code>/<code>forwardMessage</code>, <code>true</code> for
	<code>answerCallbackQuery</code>, a stub bot for <code>getMe</code>, <code>&#123;&#125;</code>
	otherwise.
</p>
<Code code={onApiExample} title="onApi.ts" />

<h3><code>apiError(code, description, parameters?)</code></h3>
<p>simulate a real Telegram failure — the bot sees exactly what it would see in production:</p>
<Code code={apiErrorExample} title="apiError.ts" />
<p>
	<code>env.offApi(method?)</code> drops a method's override (or every override, with no argument).
</p>

<h3><code>strictApi</code> / <code>strictDispatch</code></h3>
<Code code={strictModes} title="strict.ts" />

<h2>the virtual clock — skip real time</h2>
<p>
	TTL expirations, retry backoffs, debounces — none of it should cost real wall-clock time in a
	test suite.
</p>
<Code code={clockExample} title="clock.test.ts" />
<p>
	intervals re-arm and may fire multiple times in one <code>advance()</code> call; timers scheduled
	from inside a firing callback are picked up by the same call. for standalone use outside a
	<code>TestEnv</code>:
</p>
<Code code={standaloneClock} title="standalone-clock.ts" />

<h2>satellite-plugin test packs</h2>
<p>
	a <code>TestPack</code> is an explicit hook (never a global registry — yaebal doesn't do implicit
	plugin wiring) a plugin package can ship so its own tests, or yours, get sensible fixtures for
	free. <a href="/docs/plugins/again"><code>@yaebal/again</code></a> ships one:
	<code>import &#123; againTestPack &#125; from "@yaebal/again/test-pack"</code> wires
	<code>autoRetry</code> onto <code>env.api</code> automatically.
</p>
<Code code={packExample} title="test-pack.ts" />

<h2>fixture builders — the escape hatch</h2>
<p>
	every actor method is sugar over a raw <code>Update</code>. reach for these directly for shapes
	the actors don't cover, or full field-by-field control — <code>messageUpdate</code>,
	<code>editedMessageUpdate</code>, <code>channelPostUpdate</code>, <code>editedChannelPostUpdate</code>,
	<code>callbackUpdate</code>, <code>inlineQueryUpdate</code>, <code>chosenInlineResultUpdate</code>,
	<code>shippingQueryUpdate</code>, <code>preCheckoutQueryUpdate</code>, <code>pollUpdate</code>,
	<code>pollAnswerUpdate</code>, <code>myChatMemberUpdate</code>, <code>chatMemberUpdate</code>, and
	<code>chatJoinRequestUpdate</code>. <code>buildUser</code> builds a <code>User</code> with an
	auto-allocated id.
</p>
<Code code={lowLevel} title="updates.ts" />
<p>
	<code>findButton(markup, match)</code> searches a <code>reply_markup</code> (plain JSON, or a
	builder instance like <code>InlineKeyboard</code> — unwrapped via <code>toJSON()</code>
	automatically) for a button whose text matches a string or regex, returning it with its
	<code>row</code>/<code>col</code>. this is what <code>clickByText</code> uses internally.
</p>

<h2>webhooks & runners</h2>
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

<h2>upgrading from 0.1.x</h2>
<p>
	<code>0.2</code> replaces the old flat api (<code>mockApi()</code> + <code>createContext()</code> +
	<code>runMiddleware()</code> wired together by hand) with the actor-driven <code>TestEnv</code>
	above. <code>mockApi</code>, the update factories, <code>findButton</code>,
	<code>webhookRequest</code>, <code>collectUpdates</code>, and <code>withFetch</code> are all still
	here — only <code>createContext</code>, <code>messageContext</code>, <code>callbackContext</code>,
	and <code>runMiddleware</code> are gone, folded into <code>TestEnv.dispatch</code>/actors.
	<code>setResult</code> is now <code>onApi</code>.
</p>
<Code code={upgrade} title="migration.diff" lang="diff" />

<h2>api</h2>
<table>
	<thead>
		<tr><th>export</th><th>signature</th><th>description</th></tr>
	</thead>
	<tbody>
		<tr><td><code>createTestEnv</code></td><td><code>(bot, options?) =&gt; TestEnv</code></td><td>the main entry point</td></tr>
		<tr><td><code>TestEnv</code></td><td>class</td><td><code>api</code>, <code>apiCalls</code>, <code>hooks</code>, <code>users</code>, <code>chats</code>, <code>createUser</code>, <code>createChat</code>, <code>dispatch</code>/<code>inject</code>, <code>onApi</code>/<code>offApi</code>, <code>lastApiCall</code>/<code>callsTo</code>/<code>clearApiCalls</code>, <code>lastBotMessage</code>/<code>botMessage</code>, <code>useFakeTimers</code>/<code>advanceTime</code>, <code>onPostDispatch</code>, <code>answeredPreCheckoutQuery</code>, <code>shutdown</code></td></tr>
		<tr><td><code>UserActor</code></td><td>class</td><td>send/media/click/react/join/payments — see actors above</td></tr>
		<tr><td><code>ChatActor</code></td><td>class</td><td><code>id</code>, <code>type</code>, <code>title?</code>, <code>username?</code>, <code>members</code>, <code>setMembership</code>/<code>membershipOf</code>, <code>post</code></td></tr>
		<tr><td><code>apiError</code></td><td><code>(code, description, parameters?) =&gt; ApiErrorSentinel</code></td><td>simulate a real Telegram error response</td></tr>
		<tr><td><code>isApiErrorSentinel</code></td><td><code>(value) =&gt; value is ApiErrorSentinel</code></td><td>typeguard for a stored <code>apiError(...)</code></td></tr>
		<tr><td><code>TestApiError</code></td><td>class extends <code>TelegramError</code></td><td>test subclass carrying the same structured <code>.parameters</code></td></tr>
		<tr><td><code>installTestClock</code></td><td><code>(startAt?) =&gt; TestClock</code></td><td>standalone virtual clock: <code>.now()</code>, <code>.advance(ms)</code>, <code>.restore()</code></td></tr>
		<tr><td><code>mockApi</code></td><td><code>(options?) =&gt; MockApi</code></td><td>the fake <code>Api</code> underneath <code>TestEnv</code> — usable standalone</td></tr>
		<tr><td><code>findButton</code></td><td><code>(markup, match) =&gt; FoundButton | undefined</code></td><td>find an inline keyboard button by text</td></tr>
		<tr><td><code>toPlain</code></td><td><code>(value) =&gt; T</code></td><td>unwrap a builder's <code>toJSON()</code>, or pass through</td></tr>
		<tr><td><code>createUpdate</code> / <code>messageUpdate</code> / …</td><td>see fixture builders above</td><td>raw update construction</td></tr>
		<tr><td><code>detectUpdateType</code></td><td><code>(update) =&gt; UpdateName</code></td><td>infer the payload key; defaults to <code>"message"</code></td></tr>
		<tr><td><code>collectUpdates</code></td><td><code>() =&gt; UpdateCollector</code></td><td>a minimal <code>UpdateSink</code> that records what it receives</td></tr>
		<tr><td><code>webhookRequest</code></td><td><code>(update, options?) =&gt; Request</code></td><td>build a webhook POST request carrying an update</td></tr>
		<tr><td><code>withFetch</code></td><td><code>(handler, fn) =&gt; Promise&lt;T&gt;</code></td><td>stub <code>globalThis.fetch</code> for <code>fn</code>, restoring it after</td></tr>
	</tbody>
</table>
