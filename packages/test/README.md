# @yaebal/test

**the most complete test framework for Telegram bots on the market — full stop.**

`@yaebal/test` wraps your bot in a `TestEnv` and hands you virtual **users** and **chats** that
send it *real* Telegram updates — messages, commands, media, reactions, inline-button clicks,
joins, payments — exactly the way real users would. every outgoing api call is intercepted (no
real HTTP, ever), recorded, and answered with sensible auto-stubs you can override or fail on
demand. a virtual clock lets you skip real time for TTL/retry tests. satellite plugins can ship
their own test fixtures. and if you need a raw update shape the actors don't cover yet, the whole
low-level fixture-builder layer is still there underneath.

zero dependency on any test runner or assertion library — works with `node:test`, vitest,
bun:test, jest, ava, anything that can `await` a promise and call `assert`.

## install

```sh
pnpm add -D @yaebal/test
```

## quick start

```ts
import { Composer } from "@yaebal/core";
import { createTestEnv } from "@yaebal/test";
import { expect, test } from "vitest"; // or node:test, or whatever you use

const bot = new Composer().command("start", (ctx) => ctx.reply("Welcome!"));

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
});
```

## `createTestEnv(bot, options?)`

the orchestrator. wraps any `Composer`/`Bot`, intercepts every outgoing api call, and gives you
actor factories plus every assertion/stub helper below.

```ts
const env = createTestEnv(bot, {
  results?: Record<string, MockResult>, // seed permanent api replies
  strictApi?: boolean,                  // throw on an unstubbed method with no builtin default
  strictDispatch?: boolean,             // throw if an update falls through with no handler
  packs?: TestPack[],                   // satellite-plugin test fixtures, see below
});
```

- **`env.createUser(options?)`** — a `UserActor` linked to the environment
- **`env.createChat(options)`** — a `ChatActor` (`group`/`supergroup`/`channel`/`private`)
- **`env.dispatch(update)`** / **`env.inject(update)`** — the escape hatch: ship a raw `Update`
  through the bot, for shapes the actors don't cover yet
- **`env.users`** / **`env.chats`** — every actor created so far

## actors — users drive the scenario

```ts
const linia = env.createUser({ firstName: "Linia", username: "linia" });
```

### text, replies, commands

```ts
await linia.sendMessage("hello");
await linia.sendMessage(group, "hello group");           // ChatActor as the first arg
await linia.sendReply(originalMsg, "thanks!");            // reply_to_message + same chat, inferred
await linia.sendCommand("start");                         // text: "/start", bot_command entity
await linia.sendCommand("start", "ref42");                // text: "/start ref42"
```

`sendMessage`/`sendReply`/`sendCommand` all accept a plain string **or a `format()` result** from
`@yaebal/core` (or anything shaped like one) — entities are extracted automatically, the same way
a real client would attach them:

```ts
import { bold, format } from "@yaebal/core";

await linia.sendMessage(format`Check out ${bold("this")}`); // ctx.message.entities is populated
```

### media

every method auto-generates `file_id`/`file_unique_id` and the fields Telegram requires. all
accept an optional leading `ChatActor` to target a specific chat.

```ts
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
await linia.sendVenue({ location: { latitude: 48.85, longitude: 2.35 }, title: "Louvre", address: "Paris" });
await linia.sendDice("🎯");

await linia.sendMediaGroup(group, [
  { photo: [{ file_id: "f1", file_unique_id: "u1", width: 800, height: 600 }] },
  { photo: [{ file_id: "f2", file_unique_id: "u2", width: 800, height: 600 }] },
]); // one update per item, all sharing media_group_id
```

### editing, forwarding, pinning

```ts
const msg = await linia.sendMessage("original");
await linia.editMessage(msg, "edited");        // dispatches edited_message
await linia.forwardMessage(msg, group);        // forward_origin set, defaults to linia's own PM
await linia.pinMessage(msg);                   // service message with pinned_message set
```

### buttons, reactions, joins

```ts
await linia.click("vote:up", msg);             // raw callback_data
await linia.on(msg).click("vote:up");          // same, message pre-bound
await linia.on(msg).clickByText("Next »");     // scans msg's inline_keyboard for the label

await linia.react("👍", msg);                  // old_reaction inferred from linia's last react()
await linia.react(["👍", "🔥"], msg);
await linia.react([], msg);                    // clear all of linia's reactions

await linia.join(group);                       // chat.members + a chat_member update + service msg
await linia.leave(group);
```

reaction state is tracked per-message automatically — you never spell out `old_reaction` by hand,
and it's tracked independently per user:

```ts
await linia.react("👍", msg);   // old: [], new: ["👍"]
await linia.react("❤", msg);    // old: ["👍"], new: ["❤"]  — inferred, not passed in
await bob.react("🔥", msg);      // linia's and bob's state don't interfere
```

### inline mode & payments

```ts
await linia.sendInlineQuery("cats", group);          // chat_type derived from group.type
await linia.chooseInlineResult("result-1", "cats");

await linia.sendPreCheckoutQuery({ currency: "XTR", total_amount: 100, invoice_payload: "sub" });
await linia.sendShippingQuery({ invoice_payload: "physical_item" });

// the full flow: pre_checkout_query → verifies the bot answered { ok: true } → successful_payment.
// throws if the bot never answers, or answers with ok: false — exactly like real Telegram would
// never deliver successful_payment in that case.
await linia.sendSuccessfulPayment({ invoice_payload: "sub_monthly" });
```

### `.in(chat)` — scope every send to one chat

```ts
const group = env.createChat({ type: "group", title: "devs" });

await linia.in(group).sendMessage("morning team");
await linia.in(group).sendCommand("help");
await linia.in(group).sendPhoto({ caption: "lunch" });
await linia.in(group).join();
await linia.in(group).on(msg).clickByText("yes");
```

### `.on(message)` — scope click/react/edit/forward/pin to one message

```ts
await linia.on(msg).click("action:1");
await linia.on(msg).clickByText("Next »");
await linia.on(msg).react("👍");
await linia.on(msg).editMessage("updated");
```

## chats

```ts
const group = env.createChat({ type: "group", title: "devs" });
const channel = env.createChat({ type: "channel", title: "News", username: "news" });
```

- **`chat.members`** — the `Set<UserActor>` currently joined (via `.join()`)
- **`chat.setMembership(userId, { status, since? })`** / **`chat.membershipOf(user)`** — track
  arbitrary membership status for `getChatMember`-style assertions
- **`chat.post(text)`** — an anonymous channel post (`update.channel_post`, no `from` — matches
  real Telegram). throws on non-channel chats.

## inspecting what the bot did

```ts
await linia.sendMessage("hi");

env.apiCalls;                       // every recorded { method, params, result | error, at }
env.lastApiCall("sendMessage");     // most recent call to a method (or overall, with no arg)
env.callsTo("sendMessage");         // every call to a method, in order
env.clearApiCalls();                // reset between logical phases of a test
```

### `env.lastBotMessage(query?)` — the bot's own messages, live

returns a `BotMessage` mirror of the bot's most recent `send*`/`forwardMessage`/`copyMessage` —
populated straight from the outgoing params, no `onApi` override required. **it's kept in sync in
place** as `editMessageText`/`editMessageCaption`/`editMessageReplyMarkup` calls land, even for a
reference captured *before* the edit — so `user.on(bubble).clickByText(...)` always sees the
current buttons:

```ts
bot.on("message", (ctx) =>
  ctx.send("Pick:", { reply_markup: { inline_keyboard: [[{ text: "Next", callback_data: "next" }]] } }),
);
bot.callbackQuery("next", async (ctx) => {
  const { chat, message_id } = ctx.callbackQuery.message;
  await ctx.api.call("editMessageText", { chat_id: chat.id, message_id, text: "Done!" });
});

await linia.sendMessage("hi");
const bubble = env.lastBotMessage()!;
await linia.on(bubble).clickByText("Next");
bubble.text; // "Done!" — same object, mutated in place
```

filters (all optional, combined with AND): `{ chat }` scope to a chat; `{ withReplyMarkup: true }`
skip plain status messages and find the last interactive bubble; `{ where: (call) => boolean }`
for an arbitrary predicate over the call that produced/last touched the message.
**`env.botMessage(chatId, messageId)`** looks one up directly.

## mocking the api

without any setup, `@yaebal/test` returns sensible auto-stubs: an auto-incrementing `message_id`
for `send*`/`copyMessage`/`forwardMessage`, `true` for `answerCallbackQuery`, a stub bot for
`getMe`, `{}` otherwise.

### `env.onApi(method, reply, opts?)` — override a reply

```ts
env.onApi("getMe", { id: 7, is_bot: true, first_name: "MyBot", username: "my_bot" });
env.onApi("sendMessage", (params) => ({ message_id: 1, date: 0, chat: { id: params.chat_id, type: "private" }, text: params.text }));
```

permanent by default; `{ times: 1 }` (or any N) makes it a one-shot that then falls back to the
next queued or permanent reply — perfect for "first call fails, second succeeds":

```ts
env.onApi("sendMessage", apiError(429, "Too Many Requests", { retry_after: 1 }), { times: 1 });
env.onApi("sendMessage", { message_id: 1, date: 0, chat: { id: 1, type: "private" } });
```

### `apiError(code, description, parameters?)` — simulate a real Telegram failure

```ts
import { apiError } from "@yaebal/test";
import { TelegramError } from "@yaebal/core";

env.onApi("sendMessage", apiError(403, "Forbidden: bot was blocked by the user"));

// the bot sees a real TelegramError (TestApiError extends it):
try {
  await ctx.reply("hi");
} catch (error) {
  error instanceof TelegramError; // true
  error.code;                     // 403
  error.parameters;               // response_parameters when Telegram sends them
}
```

**`env.offApi(method?)`** drops a method's override (or every override, with no argument).

### `strictApi` / `strictDispatch`

```ts
const env = createTestEnv(bot, { strictApi: true });    // throw on an unstubbed method — catch "forgot to mock this"
const env2 = createTestEnv(bot, { strictDispatch: true }); // throw if no handler consumed the dispatched update
```

## the virtual clock — skip real time

TTL expirations, retry backoffs, debounces — none of it should cost real wall-clock time in a
test suite.

```ts
const env = createTestEnv(bot);
env.useFakeTimers(); // arm it *before* the code under test schedules a timer you want to control

await linia.sendCommand("start"); // handler calls setTimeout(..., 60 * 60 * 1000) internally

await env.advanceTime(60 * 60 * 1000); // fires it instantly
```

`advanceTime` arms the clock for you if you haven't already (handy when you're timing something
your own test code schedules, after the fact). Intervals re-arm and may fire multiple times in one
`advance()` call; timers scheduled from inside a firing callback are picked up by the same call.
**Always call `env.shutdown()` in your teardown** — it restores the real `Date.now`/timers so the
next test isn't left on virtual time.

For standalone use outside a `TestEnv`:

```ts
import { installTestClock } from "@yaebal/test";

const clock = installTestClock(1_700_000_000_000);
setInterval(() => {/* … */}, 1000);
await clock.advance(3500); // fires 3 times
clock.restore();
```

## satellite-plugin test packs

a `TestPack` is an explicit (never a global registry — yaebal doesn't do implicit plugin wiring)
hook a plugin package can ship so its own tests — or yours — get sensible fixtures for free:

```ts
import type { TestPack } from "@yaebal/test";

export function myPluginTestPack(options?: MyPluginOptions): TestPack {
  return {
    name: "my-plugin",
    setup(env) {
      installMyPlugin(env.api, options); // wire whatever the plugin needs onto env.api/env
    },
  };
}
```

```ts
const env = createTestEnv(bot, { packs: [myPluginTestPack()] });
```

`@yaebal/again` ships one: `import { againTestPack } from "@yaebal/again/test-pack"` wires
`autoRetry` onto `env.api` so retry tests don't call it by hand.

## fixture builders — the escape hatch

every actor method is sugar over a raw `Update`. reach for these directly for shapes the actors
don't cover, or full field-by-field control — `createUpdate` fills in a fresh `update_id`, the
rest build one payload key each: `messageUpdate`, `editedMessageUpdate`, `channelPostUpdate`,
`editedChannelPostUpdate`, `callbackUpdate`, `inlineQueryUpdate`, `chosenInlineResultUpdate`,
`shippingQueryUpdate`, `preCheckoutQueryUpdate`, `pollUpdate`, `pollAnswerUpdate`,
`myChatMemberUpdate`, `chatMemberUpdate`, `chatJoinRequestUpdate`. `detectUpdateType` infers which
payload key an update carries, and `buildUser` builds a `User` with an auto-allocated id.

```ts
import { createUpdate } from "@yaebal/test";

const custom = createUpdate({
  edited_message: { message_id: 1, date: 0, chat: { id: 1, type: "private" } },
});
await env.dispatch(custom);
```

`findButton(markup, match)` searches a `reply_markup` (plain JSON, or a builder instance like
`InlineKeyboard` — unwrapped via `toJSON()` automatically) for a button whose text matches a
string or regex, returning it with its `row`/`col`. this is what `clickByText` uses internally.

## webhooks & runners

```ts
import { webhookCallback } from "@yaebal/core";
import { messageUpdate, webhookRequest } from "@yaebal/test";

const handler = webhookCallback(bot, { secretToken: "s3cret" });
const res = await handler(webhookRequest(messageUpdate({ text: "hi" }), { secretToken: "s3cret" }));
assert.equal(res.status, 200);
```

`collectUpdates()` gives a minimal `UpdateSink` (the `{ handleUpdate }` shape webhooks/runners
expect) that just records what it receives. `withFetch(handler, fn)` stubs `globalThis.fetch` for
the duration of `fn`, restoring it after — even if `fn` throws — for code that proxies uploads or
downloads.

## api reference

| export | signature | description |
|:---|:---|:---|
| `createTestEnv` | `(bot, options?) => TestEnv` | the main entry point |
| `TestEnv` | class | `api`, `apiCalls`, `hooks`, `users`, `chats`, `createUser`, `createChat`, `dispatch`/`inject`, `onApi`/`offApi`, `lastApiCall`/`callsTo`/`clearApiCalls`, `lastBotMessage`/`botMessage`, `useFakeTimers`/`advanceTime`, `onPostDispatch`, `answeredPreCheckoutQuery`, `shutdown` |
| `UserActor` | class | see actors above |
| `ChatActor` | class | `id`, `type`, `title?`, `username?`, `members`, `setMembership`/`membershipOf`, `post` |
| `apiError` | `(code, description, parameters?) => ApiErrorSentinel` | simulate a real Telegram error response |
| `isApiErrorSentinel` | `(value) => value is ApiErrorSentinel` | typeguard for a stored `apiError(...)` |
| `TestApiError` | class extends `TelegramError` | test subclass carrying the same structured `.parameters` |
| `installTestClock` | `(startAt?) => TestClock` | standalone virtual clock: `.now()`, `.advance(ms)`, `.restore()` |
| `mockApi` | `(options?) => MockApi` | the fake `Api` underneath `TestEnv` — usable standalone |
| `findButton` | `(markup, match) => FoundButton \| undefined` | find an inline keyboard button by text |
| `toPlain` | `(value) => T` | unwrap a builder's `toJSON()`, or pass through |
| `createUpdate` / `messageUpdate` / … | see fixture builders above | raw update construction |
| `detectUpdateType` | `(update) => UpdateName` | infer the payload key; defaults to `"message"` |
| `collectUpdates` | `() => UpdateCollector` | a minimal `UpdateSink` that records what it receives |
| `webhookRequest` | `(update, options?) => Request` | build a webhook POST request carrying an update |
| `withFetch` | `(handler, fn) => Promise<T>` | stub `globalThis.fetch` for `fn`, restoring it after |

## upgrading from 0.1.x

`@yaebal/test` `0.2` replaces the old flat api (`mockApi()` + `createContext()` + `messageUpdate()` + `runMiddleware()` wired together by hand) with the actor-driven `TestEnv` above:

```diff
- const { api, calls } = mockApi();
- await runMiddleware(bot, createContext(messageUpdate({ text: "/start" }), api));
- assert.equal(calls[0]?.method, "sendMessage");
+ const env = createTestEnv(bot);
+ await env.createUser().sendCommand("start");
+ assert.equal(env.lastApiCall("sendMessage")?.method, "sendMessage");
```

`mockApi`, `createUpdate`/`messageUpdate`/etc., `findButton`, `webhookRequest`, `collectUpdates`,
and `withFetch` are all still here, unchanged in spirit — only `createContext`, `messageContext`,
`callbackContext`, and `runMiddleware` are gone, folded into `TestEnv.dispatch`/actors. `setResult`
is now `onApi`.

---

part of [**yaebal**](https://github.com/neverlane/yaebal) — a type-safe, runtime-agnostic Telegram Bot API framework. MIT.
