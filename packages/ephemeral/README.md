# @yaebal/ephemeral

`ctx.replyEphemeral()` — answer in a group so only the asker (and the bot) sees it, via
telegram's ephemeral messages (bot api 10.2+). returns a typed handle that hides the awkward
addressing (`message_id` is `0` on ephemeral messages — edits go through `chat_id` +
`receiver_user_id` + `ephemeral_message_id`), falls back to a normal message in private chats
(where a message already is visible to one user only), and has a policy for the "message
already expired" case. no more spamming the whole chat with "you are not an admin".

ephemeral messages are best-effort by design: delivery to offline users is not guaranteed,
and telegram reuses `ephemeral_message_id`s after expiry — never persist a handle or its ids,
and never gate a required flow on an ephemeral reply.

## install

```sh
pnpm add @yaebal/ephemeral
```

## usage

```ts
import { ephemeral } from "@yaebal/ephemeral";

bot.install(ephemeral());

bot.command("stats", async (ctx) => {
	// in a group: a real ephemeral message, visible only to the sender.
	// in a private chat: a normal message (same visibility), same handle.
	const msg = await ctx.replyEphemeral("crunching…");
	const stats = await computeStats(ctx.from.id);
	await msg.edit(`you sent ${stats.count} messages this week`);
});
```

`ctx.sendEphemeral(userId, text)` targets a specific user in the current group instead of the
update's author — e.g. a private nudge to an admin. it never falls back (a normal message
would be visible to everyone) and rejects outside group/supergroup chats.

## the handle

`replyEphemeral`/`sendEphemeral` resolve to an `EphemeralMessage`:

```ts
const msg = await ctx.replyEphemeral("step 1/3…");
await msg.edit("step 2/3…");                 // editEphemeralMessageText
await msg.editReplyMarkup(keyboard);          // editEphemeralMessageReplyMarkup
await msg.delete();                           // deleteEphemeralMessage; false if already gone
msg.isEphemeral;                              // false on the private-chat fallback path
```

on the fallback path the same methods are backed by `editMessageText` /
`editMessageReplyMarkup` / `deleteMessage` — one code path either way.

## options

```ts
bot.install(
	ephemeral({
		// what replyEphemeral does in a private chat:
		// "message" (default) — send a normal message behind the same handle; "error" — reject.
		fallback: "message",
		// what edit/editReplyMarkup do when the ephemeral message already expired:
		// "throw" (default), "ignore" (resolve false), or "resend" (send the new content as
		// a fresh ephemeral message and retarget the handle).
		onExpired: "resend",
		// override the "message is gone" detector (default: a telegram 400 whose
		// description says not found / expired / invalid).
		isExpiredError: (error) => myDetector(error),
	}),
);
```

`delete()` is always idempotent: an already-gone message resolves `false` instead of throwing,
whatever `onExpired` is set to.

## standalone

sent an ephemeral message through the raw api? wrap it:

```ts
import { wrapEphemeralMessage } from "@yaebal/ephemeral";

const sent = await bot.api.call("sendMessage", {
	chat_id: chatId,
	ephemeral_message_parameters: { receiver_user_id: userId }, // bot api 10.3
	text: "psst",
});
const msg = wrapEphemeralMessage(bot.api, sent, { onExpired: "ignore" });
await msg.edit("psst — updated");
```

`supportsEphemeral(chat)` (group/supergroup check) and `isExpiredEphemeralError(error)` (the
default expiry detector) are exported too.

## ephemeral commands

marking a command ephemeral in the menu (`is_ephemeral`) is `@yaebal/commands`' job — pair the
two: register the command as ephemeral there, answer it with `ctx.replyEphemeral()` here.

---

part of [**yaebal**](https://github.com/neverlane/yaebal) — a type-safe, runtime-agnostic Telegram Bot API framework. MIT.

## rich content, media and callback overlays

`replyEphemeral` and `sendEphemeral` also accept `{ rich_message }` and `{ media }`.
rich content accepts `InputRichMessage` or a `RichDocument` from `@yaebal/rich`.
media accepts `InputMedia` (photo, video, animation, audio, document, live photo) or
`InputMediaVoiceNote`. use the same `media.*` upload helpers as regular bot api calls.

```ts
const rich = await ctx.replyEphemeral({ rich_message: { html: "<p>your summary</p>" } });
await rich.editRich({ blocks: [{ type: "divider" }] });

const photo = await ctx.replyEphemeral({ media: { type: "photo", media: "file-id" } });
await photo.editMedia({ type: "photo", media: media.path("./updated.jpg") });
await photo.editCaption("updated", { show_caption_above_media: true });
```

`editMedia` follows `InputMedia`: voice notes can be sent but cannot be edited through
this method. private-chat fallbacks use the matching regular send/edit methods.
`onExpired: "resend"` preserves the last known rich/media payload, caption formatting
and keyboard. use reusable upload sources (file ids, buffers or paths) for recovery;
a consumed one-shot stream cannot be resent. unknown read-side rich content wrapped with
`wrapEphemeralMessage` cannot be faithfully reconstructed for a markup-only resend.

from a callback on a regular group message, `ctx.replaceWithEphemeral(content)` shows a
personalized overlay in its place. it supplies `callback_query_id` and
`replace_callback_query_message` automatically. callbacks from an existing ephemeral
message must use its handle's edit methods instead. replacement rejects outside groups,
and expiry recovery sends a fresh ephemeral message without replaying the old callback.

incoming ephemeral commands are answered using `reply_parameters.ephemeral_message_id`.
answer within 15 seconds; later work can continue by editing the returned handle.
`isExpiredEphemeralError` recognizes message-related 400 errors, not unrelated invalid
content or a missing chat. all extra options and handle edit options are typed.
