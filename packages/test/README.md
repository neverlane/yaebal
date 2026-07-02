# @yaebal/test

testing utilities for yaebal bots — a fake `Api` that records every call (and can drive real
`before`/`after`/`onError` hooks, simulate failures, and retries), update factories for every
update kind telegram sends, context builders, and helpers for webhook/keyboard assertions.

zero dependency on any test runner or assertion library — works with `node:test`, vitest,
bun:test, jest, ava, anything that can `await` a promise and call `assert`.

## install

```sh
pnpm add -D @yaebal/test
```

## usage

```ts
import { callbackUpdate, createContext, messageUpdate, mockApi, runMiddleware } from "@yaebal/test";
import { expect, test } from "vitest"; // or node:test, or whatever you use

test("replies to /start", async () => {
  const { api, calls } = mockApi();
  const update = messageUpdate({ text: "/start", chatId: 42 });
  const ctx = createContext(update, api);

  await runMiddleware(bot, ctx);

  expect(calls[0]?.method).toBe("sendMessage");
});

test("callback query", async () => {
  const { api, calls } = mockApi();
  const update = callbackUpdate({ data: "vote:up", chatId: 1 });
  const ctx = createContext(update, api);

  await runMiddleware(bot, ctx);

  expect(calls[0]?.method).toBe("answerCallbackQuery");
});
```

or skip a step with the `*Context` shortcuts:

```ts
import { messageContext, runMiddleware } from "@yaebal/test";

const ctx = messageContext({ text: "/start", chatId: 42 });
await runMiddleware(bot, ctx);
```

## mockApi

`mockApi(options?)` returns a fake `Api` plus inspection helpers. Every method records
`{ method, params }` into `calls` and resolves to a sensible default: an auto-incrementing
`{ message_id }` for `send*`/`copyMessage`/`forwardMessage`, `true` for `answerCallbackQuery`,
a stub bot for `getMe`, `{}` otherwise.

```ts
const { api, calls, hooks, lastCall, callsTo, setResult, reset } = mockApi();
```

- **`calls`** — every recorded call, in order.
- **`lastCall(method?)`** — the most recent call, optionally filtered to a method.
- **`callsTo(method)`** — every call to a given method, in order.
- **`setResult(method, result)`** — override a method's canned result/error after creation.
- **`reset()`** — clears `calls` and per-method attempt counters (keeps hooks and overrides).
- **`hooks`** — the `before`/`after`/`onError` arrays your code under test registered on the api.

### canned results & error simulation

Pass `results` to control exactly what a method returns — a static value, an `Error` (which
makes the call throw, e.g. `TelegramError`), or a function of `(params, attempt)`:

```ts
import { TelegramError } from "@yaebal/core";
import { mockApi } from "@yaebal/test";

const { api } = mockApi({
  results: {
    sendMessage: { message_id: 42 },
    getChat: () => ({ id: 1, type: "private" }),
    // fails twice, then succeeds — great for testing retry plugins like @yaebal/again
    getMe: (params, attempt) =>
      attempt <= 2 ? new TelegramError("getMe", 429, "retry after 0") : { id: 1, is_bot: true, first_name: "bot" },
  },
});
```

### real hooks, not no-ops

Unlike a bare stub, `before`/`after`/`onError` registered on a `mockApi()` actually run through
the call pipeline — register a hook exactly as you would on the production `Api` and it fires,
including retries requested by an `onError` hook (see [`@yaebal/again`](../again)'s retry
policy). The mock never actually waits on a requested `delayMs`, so retry tests settle instantly:

```ts
const { api } = mockApi({ results: { sendMessage: new TelegramError("sendMessage", 429, "retry after 0") } });

api.onError((_method, _error, attempt) => (attempt === 1 ? { retry: true } : undefined));

await api.sendMessage({ chat_id: 1 }); // retries once, then throws (no result override for attempt 2)
```

## contexts

`createContext(update, api?, updateType?)` wraps an `Update` in a core `Context`. The api
defaults to a fresh `mockApi().api`; the update type is auto-detected via `detectUpdateType`
unless you pass `updateType`. Run a composer's middleware against it with
`runMiddleware(composer, ctx)` — it resolves once the chain settles.

`messageContext(options?, api?)` and `callbackContext(options?, api?)` build the update and the
context in one call, for the two most common cases.

## building updates

Factories exist for every update kind telegram sends:

| factory                    | update key             |
|:---------------------------|:-----------------------|
| `messageUpdate`            | `message`              |
| `editedMessageUpdate`      | `edited_message`       |
| `channelPostUpdate`        | `channel_post`         |
| `editedChannelPostUpdate`  | `edited_channel_post`  |
| `callbackUpdate`           | `callback_query`       |
| `inlineQueryUpdate`        | `inline_query`         |
| `chosenInlineResultUpdate` | `chosen_inline_result` |
| `shippingQueryUpdate`      | `shipping_query`       |
| `preCheckoutQueryUpdate`   | `pre_checkout_query`   |
| `pollUpdate`               | `poll`                 |
| `pollAnswerUpdate`         | `poll_answer`          |
| `myChatMemberUpdate`       | `my_chat_member`       |
| `chatMemberUpdate`         | `chat_member`          |
| `chatJoinRequestUpdate`    | `chat_join_request`    |

`createUpdate` is the escape hatch for anything else, filling in a fresh `update_id`.
`detectUpdateType` infers which payload key an update carries.

```ts
import { createUpdate, detectUpdateType, pollUpdate } from "@yaebal/test";

const poll = pollUpdate({ question: "coffee or tea?", options: ["coffee", "tea"] });

// hand-build any update shape; update_id is filled in for you
const custom = createUpdate({
  edited_message: { message_id: 1, date: 0, chat: { id: 1, type: "private" } },
});

detectUpdateType(custom); // → "edited_message"
```

## inline keyboards

`findButton(markup, match)` searches a `reply_markup`-shaped object (e.g. from a recorded call's
params) for a button whose text matches a string or regex, returning it with its `row`/`col`:

```ts
import { findButton, messageContext, mockApi, runMiddleware } from "@yaebal/test";

const { api, calls } = mockApi();
await runMiddleware(bot, messageContext({ text: "/menu" }, api));

const next = findButton(calls[0]?.params?.reply_markup, "Next »");
assert.equal(next?.callback_data, "page:2");
```

## webhooks & runners

`webhookRequest(update, options?)` builds a `Request` the way telegram would POST it to a
webhook handler (`@yaebal/core`'s `webhookCallback`, or `@yaebal/web`'s `webhook`):

```ts
import { webhookRequest } from "@yaebal/test";
import { webhookCallback } from "@yaebal/core";

const handler = webhookCallback(bot, { secretToken: "s3cret" });
const res = await handler(webhookRequest(messageUpdate({ text: "hi" }), { secretToken: "s3cret" }));
assert.equal(res.status, 200);
```

`collectUpdates()` gives you a minimal `UpdateSink` (the `{ handleUpdate }` shape webhooks and
runners expect) that just records what it receives — handy when you don't need a full `Bot`:

```ts
import { collectUpdates, messageUpdate } from "@yaebal/test";

const { sink, updates } = collectUpdates();
await sink.handleUpdate(messageUpdate({ text: "hi" }));
assert.equal(updates.length, 1);
```

`withFetch(handler, fn)` stubs `globalThis.fetch` for the duration of `fn`, restoring the
original afterwards even if `fn` throws — for code that proxies uploads or downloads:

```ts
import { withFetch } from "@yaebal/test";

await withFetch(
  async (url) => new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "image/jpeg" } }),
  async () => {
    const res = await panelHandler(request);
    assert.equal(res.status, 200);
  },
);
```

## api reference

| export                     | signature                                                       | description                                                                  |
|:---------------------------|:----------------------------------------------------------------|:-----------------------------------------------------------------------------|
| `mockApi`                  | `(options?: MockApiOptions) => MockApi`                         | fake `Api` recording every call, with working hooks and configurable results |
| `createUpdate`             | `(partial?: Partial<Update>) => Update`                         | build an update, filling in a fresh `update_id`                              |
| `messageUpdate`            | `(options?: MessageUpdateOptions) => Update`                    | build a `message` update                                                     |
| `editedMessageUpdate`      | `(options?: MessageUpdateOptions) => Update`                    | build an `edited_message` update                                             |
| `channelPostUpdate`        | `(options?: MessageUpdateOptions) => Update`                    | build a `channel_post` update                                                |
| `editedChannelPostUpdate`  | `(options?: MessageUpdateOptions) => Update`                    | build an `edited_channel_post` update                                        |
| `callbackUpdate`           | `(options?: CallbackUpdateOptions) => Update`                   | build a `callback_query` update                                              |
| `inlineQueryUpdate`        | `(options?: InlineQueryUpdateOptions) => Update`                | build an `inline_query` update                                               |
| `chosenInlineResultUpdate` | `(options?: ChosenInlineResultUpdateOptions) => Update`         | build a `chosen_inline_result` update                                        |
| `shippingQueryUpdate`      | `(options?: ShippingQueryUpdateOptions) => Update`              | build a `shipping_query` update                                              |
| `preCheckoutQueryUpdate`   | `(options?: PreCheckoutQueryUpdateOptions) => Update`           | build a `pre_checkout_query` update                                          |
| `pollUpdate`               | `(options?: PollUpdateOptions) => Update`                       | build a `poll` update                                                        |
| `pollAnswerUpdate`         | `(options?: PollAnswerUpdateOptions) => Update`                 | build a `poll_answer` update                                                 |
| `myChatMemberUpdate`       | `(options?: ChatMemberUpdateOptions) => Update`                 | build a `my_chat_member` update                                              |
| `chatMemberUpdate`         | `(options?: ChatMemberUpdateOptions) => Update`                 | build a `chat_member` update                                                 |
| `chatJoinRequestUpdate`    | `(options?: ChatJoinRequestUpdateOptions) => Update`            | build a `chat_join_request` update                                           |
| `createContext`            | `(update, api?, updateType?) => Context`                        | wrap an update in a core `Context`                                           |
| `messageContext`           | `(options?: MessageUpdateOptions, api?: Api) => Context`        | build a `message` update and wrap it in one call                             |
| `callbackContext`          | `(options?: CallbackUpdateOptions, api?: Api) => Context`       | build a `callback_query` update and wrap it in one call                      |
| `runMiddleware`            | `(composer: Composer<C>, ctx: C) => Promise<void>`              | run a composer's middleware against a context                                |
| `detectUpdateType`         | `(update: Update) => UpdateName`                                | infer the payload key; defaults to `"message"`                               |
| `findButton`               | `(markup, match: string \| RegExp) => FoundButton \| undefined` | find an inline keyboard button by text                                       |
| `collectUpdates`           | `() => UpdateCollector`                                         | a minimal `UpdateSink` that records what it receives                         |
| `webhookRequest`           | `(update, options?: WebhookRequestOptions) => Request`          | build a webhook POST request carrying an update                              |
| `withFetch`                | `(handler: typeof fetch, fn) => Promise<T>`                     | stub `globalThis.fetch` for `fn`, restoring it after                         |

### interfaces

| type                    | fields                                                                                                                   |
|:------------------------|:-------------------------------------------------------------------------------------------------------------------------|
| `RecordedCall`          | `method: string` · `params: Record<string, unknown> \| undefined`                                                        |
| `MockApiOptions`        | `results?: Record<string, unknown \| Error \| ((params, attempt: number) => unknown)>`                                   |
| `MockApi`               | `api: Api` · `calls: RecordedCall[]` · `hooks` · `lastCall` · `callsTo` · `setResult` · `reset`                          |
| `MessageUpdateOptions`  | `text?: string` · `chatId?: number` · `fromId?: number` · `chatType?: "private" \| "group" \| "supergroup" \| "channel"` |
| `CallbackUpdateOptions` | `data?: string` · `chatId?: number` · `fromId?: number`                                                                  |
| `FoundButton`           | the button's own fields, plus `row: number` · `col: number`                                                              |
| `UpdateCollector`       | `sink: UpdateSink` · `updates: Update[]`                                                                                 |
| `WebhookRequestOptions` | `url?: string` · `method?: string` · `secretToken?: string` · `headers?: Record<string, string>`                         |

---

part of [**yaebal**](https://github.com/neverlane/yaebal) — a type-safe, runtime-agnostic Telegram Bot API framework. MIT.
