# @yaebal/guards

reusable `bot.guard()` predicates so every project stops hand-rolling "is this user allowed"
checks: `isPrivate`/`isGroup` reuse `@yaebal/filters`' chat-type filters, `isAdmin`/
`hasMembership`/`hasPermission` do a live `getChatMember` lookup against the Bot API.

## install

```sh
pnpm add @yaebal/guards
```

## usage

```ts
import { hasPermission, isAdmin, isGroup } from "@yaebal/guards";

bot.guard(isGroup).guard(isAdmin).command("ban", banHandler);

bot.guard(hasPermission("can_restrict_members")).command("mute", muteHandler);
```

every predicate here also fits `@yaebal/filters`' `Filter<Context>` shape, so they compose with
`and`/`or`/`not` too:

```ts
import { and } from "@yaebal/filters";
import { isAdmin, isGroup } from "@yaebal/guards";

bot.filter(and(isGroup, isAdmin), (ctx) => ctx.reply("welcome, admin"));
```

## guards

- **`isPrivate`** / **`isGroup`** — adapted from `@yaebal/filters`' `isPrivate`/`isGroup`; narrow
  `ctx.chat.type` just like the filter form does.
- **`isAdmin`** — the update's user is the chat's owner or an administrator. one live
  `getChatMember` call per check.
- **`hasMembership(...statuses)`** — the update's user currently holds one of the given
  `ChatMemberStatus` values (`"creator" | "administrator" | "member" | "restricted" | "left" |
  "kicked"`) — a live lookup, not the `chat_member` update payload (see `chatMemberStatus` in
  `@yaebal/filters` for that).
- **`hasPermission(permission)`** — the chat owner always passes; an administrator passes when
  their specific `ChatPermission` flag (e.g. `"can_restrict_members"`, `"can_pin_messages"`,
  `"can_delete_messages"`) is set; anyone else fails. `ChatPermission` is derived from
  `ChatMemberAdministrator`, so it always matches the current Bot API schema.
- **`asGuard(filter)`** — adapt any synchronous, non-staging `@yaebal/filters` predicate (the
  "who/where" filters in `peer.ts`: `chatType(...)`, `fromUser(...)`, `isChannel`, `isForum`, …)
  into a narrowing `bot.guard()` predicate.

## behavior

a failed `getChatMember` lookup — no `chat`/`from` on the update, or the bot can't see the
chat — denies access rather than throwing. an update's user is never treated as privileged by
default.

## testing

```ts
import { createTestEnv } from "@yaebal/test";

const env = createTestEnv(bot);
env.onApi("getChatMember", { status: "administrator", user: { id: 1, is_bot: false, first_name: "a" } });
```

---

part of [**yaebal**](https://github.com/neverlane/yaebal) — a type-safe, runtime-agnostic Telegram Bot API framework. MIT.
