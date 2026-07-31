# @yaebal/hydrate

api call results come back "hydrated" — the `Message` returned by `ctx.send` / `ctx.reply` / `api.sendMessage` (and friends) carries methods bound to itself, so a follow-up edit, delete, pin, forward, copy or reaction needs no chat id or message id. inspired by grammY's hydrate plugin, fitted to yaebal idioms (it hangs off `@yaebal/core`'s `api.after` hook).

## install

```sh
pnpm add @yaebal/hydrate
```

## usage

```ts
import { hydrate, type HydratedMessage } from "@yaebal/hydrate";

bot.install(hydrate());

bot.command("start", async (ctx) => {
	const msg = (await ctx.send("counting…")) as HydratedMessage;

	await msg.editText("done");
	await msg.pin();
	// later
	await msg.delete();
});
```

every message an api call returns is hydrated at runtime — `ctx.send` still types its result as
`Message` (core owns that signature), so cast to `HydratedMessage`, or run it through `ctx.hydrate`
to type it without a cast:

```ts
bot.on("callback_query", async (ctx) => {
	const message = ctx.callbackQuery?.message;
	if (message) await ctx.hydrate(message).editText("updated");
});
```

`ctx.hydrate` also covers messages the api never handed you directly (the callback query's
message, an update payload) — it's idempotent, so calling it on an already-hydrated message is a
no-op.

## methods

each method targets the message it's attached to:

- `editText(text, extra?)` — `editMessageText`; resolves to the edited, re-hydrated message.
- `editCaption(caption, extra?)` — `editMessageCaption`.
- `editReplyMarkup(replyMarkup?, extra?)` — `editMessageReplyMarkup`; omit the markup to clear it.
- `delete(extra?)` — `deleteMessage`.
- `pin(extra?)` / `unpin(extra?)` — `pinChatMessage` / `unpinChatMessage`.
- `forward(chatId, extra?)` — `forwardMessage`; resolves to the new hydrated message.
- `copy(chatId, extra?)` — `copyMessage`; resolves to a `MessageId`.
- `react(reaction, extra?)` — `setMessageReaction`; a bare emoji string (or array) is wrapped into
  `{ type: "emoji", emoji }`, a full `ReactionType` passes through.

`text` and `caption` accept a plain string or a `format`/`fmt` result. the business connection a
message belongs to is threaded into its edits and pins automatically, the same way `ctx.send`
routes new messages.

## behavior

- hydration is shape-detected: any result with a numeric `message_id` and a `chat` object gets the
  methods, so it covers every message-returning method — including future ones — with no per-method
  list. `sendMediaGroup`'s array is walked element by element. `copyMessage`'s `MessageId` (no
  `chat`) is deliberately left alone.
- the methods are added as non-enumerable properties, so `JSON.stringify(msg)` and object spreads
  see the plain telegram payload, never the helpers.

## extension points

- `hydrateApi(api)` — install the after-hook directly on an `Api` client, the plugin-free form
  (mirrors `autoRetry(bot.api)`).
- `hydrateMessage(api, message)` — hydrate one message by hand, bound to a given client.

## testing

```ts
import { hydrateApi } from "@yaebal/hydrate";
import { createTestEnv } from "@yaebal/test";

const env = createTestEnv(bot);
hydrateApi(env.api);
env.onApi("sendMessage", (p) => ({ message_id: 1, date: 0, chat: { id: p?.chat_id, type: "private" } }));
```

---

part of [**yaebal**](https://github.com/neverlane/yaebal) — a type-safe, runtime-agnostic Telegram Bot API framework. MIT.
