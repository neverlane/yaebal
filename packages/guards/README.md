# @yaebal/guards

reusable `bot.guard()` predicates so every project stops hand-rolling "is this user allowed"
checks: `isPrivate`/`isGroup` reuse `@yaebal/filters`' chat-type filters, `isAdmin`/
`hasMembership`/`hasPermission`/`hasAnyPermission`/`hasAllPermissions` do a live `getChatMember`
lookup against the Bot API, `botIsAdmin`/`botHasPermission` check the bot's own standing,
`membership()` caches that lookup with event-driven invalidation, and `guardOr` answers a denied
check instead of silently dropping the update.

## install

```sh
pnpm add @yaebal/guards
```

## usage

a membership-based guard (`isAdmin`, `hasPermission`, …) calls `getChatMember` — put it behind
something narrower than "every update" so it isn't called on every message in the chat:

```ts
import { and, command } from "@yaebal/filters";
import { isAdmin } from "@yaebal/guards";

// getChatMember only runs for an actual /ban, not for every message that passes through
bot.filter(and(command("ban"), isAdmin), banHandler);
```

`bot.guard()` still works the same way — it's just as unconditional as any other `bot.guard()`
call, so reach for it once you're already narrowed down (e.g. inside a sub-composer mounted only
under `/admin`), not as the very first thing in the chain:

```ts
import { isAdmin, isGroup } from "@yaebal/guards";

const adminOnly = new Composer().guard(isGroup).guard(isAdmin);
adminOnly.command("ban", banHandler);
adminOnly.command("mute", muteHandler);
```

## caching: `membership()`

every guard here also works without any setup — falling back to a direct `getChatMember` call.
install `membership()` to cache that lookup per `(chat, user)`, so a burst of commands from the
same admin doesn't cost a burst of API calls:

```ts
import { isAdmin, membership } from "@yaebal/guards";

bot.install(membership({ ttl: 60_000 }));
bot.filter(and(command("ban"), isAdmin), banHandler); // cached for 60s per (chat, user)
```

cached entries are also dropped the instant telegram reports a real membership change
(`chat_member`/`my_chat_member`) — a fresh promotion or demotion is never served stale, which a
plain TTL alone can't guarantee. pass an existing `@yaebal/cache` client via `{ cache }` to share
one cache across plugins, or read `membership().cache` to pre-warm/inspect it directly.

## answering a denial: `guardOr`

`bot.guard()` drops a failing update silently — right for background filtering, wrong for a
user-facing command, where `/ban` from a non-admin should get a reply, not silence:

```ts
import { guardOr, isAdmin } from "@yaebal/guards";

bot.use(guardOr(isAdmin, (ctx) => ctx.reply("admins only"))).command("ban", banHandler);
```

## anonymous admins & linked channels

an admin/owner posting with "hide my identity" on arrives with `from` set to
`GroupAnonymousBot` and no user id bots can look up — a plain `getChatMember` on that `from.id`
would just 400. every guard here already handles it:

- `isAdmin`/`isGroup`/… treat an anonymous poster as at least an administrator, without an api
  call — telegram guarantees that much.
- `isOwner` denies an anonymous poster: telegram never says whether they're the owner or "just"
  an administrator, and granting owner-only access on a guess would be wrong half the time.
- `hasMembership(...)` grants an anonymous poster only when it would be correct under *either*
  possibility — i.e. only when both `"creator"` and `"administrator"` are in the accepted list.
- `hasPermission`/`hasAnyPermission`/`hasAllPermissions` deny an anonymous poster by default
  (their actual flags are unknowable), unless you opt in with `{ allowAnonymous: true }`.

`isAnonymousAdmin(ctx)` and `fromLinkedChannel(ctx)` (an automatic forward from a channel linked
to this group — a different, unrelated case that also sets `ctx.senderChat`) are exported
directly if you need to branch on either yourself.

## checking the bot's own permissions

`botIsAdmin`/`botHasPermission(permission)` mirror `isAdmin`/`hasPermission`, but for the bot
itself (`ctx.me`) — check before an action that needs standing, e.g. before `pinChatMessage`:

```ts
import { botHasPermission } from "@yaebal/guards";

bot.filter(and(command("pin"), botHasPermission("can_pin_messages")), (ctx) =>
	ctx.reply("I don't have permission to pin messages here."),
);
```

`ctx.me` is only known once the bot has resolved its own identity (long polling fills it in
after `getMe`); until then these deny.

## composes with @yaebal/filters

every guard here also fits `@yaebal/filters`' `Filter<Context>` shape, so it composes with
`and`/`or`/`not` too:

```ts
import { and } from "@yaebal/filters";
import { isAdmin, isGroup } from "@yaebal/guards";

bot.filter(and(isGroup, isAdmin), (ctx) => ctx.reply("welcome, admin"));
```

## api

| export | signature | description |
| --- | --- | --- |
| `isPrivate` | `<C extends Context>(ctx: C) => ctx is C & { chat: Chat & { type: "private" } }` | chat is a private (1:1) chat |
| `isGroup` | `<C extends Context>(ctx: C) => ctx is C & { chat: Chat & { type: "group" \| "supergroup" } }` | chat is a group or supergroup |
| `isAdmin` | `(ctx: Context) => Promise<boolean>` | chat owner, administrator, or an anonymous poster |
| `isOwner` | `(ctx: Context) => Promise<boolean>` | specifically the chat's owner (anonymous poster denied) |
| `hasMembership(...statuses)` | `(...statuses: ChatMemberStatus[]) => (ctx: Context) => Promise<boolean>` | current status is one of `statuses` |
| `hasPermission(permission, opts?)` | `(permission: ChatPermission, opts?: PermissionOptions) => (ctx: Context) => Promise<boolean>` | owner always passes; administrator passes when the flag is set |
| `hasAnyPermission(permissions, opts?)` | `(permissions: ChatPermission[], opts?: PermissionOptions) => (ctx: Context) => Promise<boolean>` | owner always passes; administrator passes when any flag is set |
| `hasAllPermissions(permissions, opts?)` | `(permissions: ChatPermission[], opts?: PermissionOptions) => (ctx: Context) => Promise<boolean>` | owner always passes; administrator passes when every flag is set |
| `botIsAdmin` | `(ctx: Context) => Promise<boolean>` | the bot itself is owner/administrator |
| `botHasPermission(permission)` | `(permission: ChatPermission) => (ctx: Context) => Promise<boolean>` | the bot itself has the flag set |
| `isAnonymousAdmin` | `(ctx: Context) => boolean` | update is an anonymous admin/owner post |
| `fromLinkedChannel` | `(ctx: Context) => boolean` | update is an automatic forward from a linked channel |
| `resolveMember` | `(ctx: Context, userId?: number) => Promise<MemberResolution>` | the low-level lookup every predicate above is built on |
| `membership(options?)` | `(options?: MembershipOptions) => MembershipPlugin` | cache `getChatMember` lookups, invalidated by `chat_member`/`my_chat_member` |
| `guardOr(predicate, onDeny)` | `<C extends Context>(predicate, onDeny) => Middleware<C>` | gate like `guard()`, but answer a denial instead of dropping it |
| `asGuard(filter)` | `(filter: Filter<Context, Add>) => <C extends Context>(ctx: C) => ctx is C & Add` | adapt a sync, non-staging `@yaebal/filters` predicate into a guard |

### ChatPermission

derived from `ChatMemberAdministrator`'s `can_*` flags (minus `can_be_edited` and
`is_anonymous`), so it always matches the current Bot API schema: `can_manage_chat`,
`can_delete_messages`, `can_manage_video_chats`, `can_restrict_members`, `can_promote_members`,
`can_change_info`, `can_invite_users`, `can_post_stories`, `can_edit_stories`,
`can_delete_stories`, `can_post_messages`, `can_edit_messages`, `can_pin_messages`,
`can_manage_topics`, `can_manage_direct_messages`, `can_manage_tags`.

## behavior

a `getChatMember` lookup that fails as telegram saying "no" (user not found, bot isn't in the
chat, …) denies access. anything else — a network failure, a malformed response — throws through
the predicate instead of masquerading as a deny; a permission check that fails silently and
looks like a permissions bug forever is worse than one that's loud about an actual outage. an
update's user is never treated as privileged by default.

`asGuard` only accepts synchronous, non-staging filters — passing an async filter or one that
stages bag data (`command()`, `regex()`, …) throws immediately rather than silently misbehaving
(an async filter always denies as a guard predicate; staged data would be silently dropped).
reach for `bot.filter()` for those instead.

## testing

```ts
import { createTestEnv } from "@yaebal/test";

const env = createTestEnv(bot);
env.onApi("getChatMember", {
	status: "administrator",
	user: { id: 1, is_bot: false, first_name: "admin" },
	can_restrict_members: true,
});
```

`chatMemberUpdate`/`myChatMemberUpdate` (also from `@yaebal/test`) simulate the promotion/demotion
events `membership()` listens for.

---

part of [**yaebal**](https://github.com/neverlane/yaebal) — a type-safe, runtime-agnostic Telegram Bot API framework. MIT.
