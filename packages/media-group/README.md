# @yaebal/media-group

telegram delivers an album as separate updates sharing a `media_group_id`. this plugin collects
them and hands you the whole album in one piece — sorted, deduplicated, keyed per chat.

## install

```sh
pnpm add @yaebal/media-group
```

## usage

two modes.

**handler mode** — fires once per album; album parts are consumed and don't reach other handlers:

```ts
import { mediaGroup } from "@yaebal/media-group";

bot.install(
	mediaGroup(async (ctx, messages) => {
		// ctx — the first part's context; messages — the whole album, sorted by message_id
		await ctx.reply(`got ${messages.length} items`);
	}),
);
```

**pass-through mode** — no handler: the album's first update continues down the chain with
`ctx.mediaGroup` set to the whole album, so filter queries, sessions and downstream plugins keep
working:

```ts
bot.install(mediaGroup()).on("message", async (ctx) => {
	if (ctx.mediaGroup) return ctx.reply(`album of ${ctx.mediaGroup.length}`);
	// plain messages arrive as usual — ctx.mediaGroup is undefined
});
```

## options

| option    | default                                            | description                                                                                                                              |
| --------- | -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `delayMs` | `200`                                              | how long to wait for the next album part before flushing.                                                                                 |
| `updates` | `["message", "channel_post", "business_message"]`  | which update kinds are collected. edited updates pass through untouched unless listed here; each kind collects into its own group.        |
| `onError` | `console.error`                                    | called when the album handler (or the downstream chain in pass-through mode) throws — albums flush from a timer, outside `bot.onError`.   |

## behavior

- groups are keyed by update kind + chat id + `media_group_id` — the same id in two chats (e.g. a
  channel album auto-forwarded into its linked discussion group) never merges.
- messages flush sorted by `message_id` and deduplicated, so out-of-order or redelivered webhook
  parts don't corrupt the album.
- a full album (10 parts) flushes immediately, without waiting out the debounce.
- `mediaGroup(...)` returns the plugin with a `flush()` method — call it before shutdown (e.g.
  from `bot.onStop`) so a half-collected album isn't lost.

## caveats

- state is in-memory: all parts of an album must land in the same process. behind multiple
  workers or serverless instances, route each chat's updates to one instance.
- in handler mode album parts never reach middleware installed after this plugin — use
  pass-through mode when albums should flow through the chain.
- the context the album arrives on is the first part's context. enrichments from plugins
  installed *before* this one are present on it at runtime; to see their types in handler mode,
  pin the context explicitly: `mediaGroup<Context & { session: MySession }>(...)`.

---

part of [**yaebal**](https://github.com/neverlane/yaebal) — a type-safe, runtime-agnostic Telegram Bot API framework. MIT.
