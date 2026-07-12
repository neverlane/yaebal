# @yaebal/example-guards (a runnable bot)

a focused bot that tours `@yaebal/guards`: the safe "guard only what's already narrowed"
pattern, `membership()`'s cached `getChatMember` lookups, `guardOr` answering a denial instead
of dropping it, checking the bot's own permissions, and telegram's anonymous-admin/owner edge
case.

## running

```sh
cp examples/guards/.env.example examples/guards/.env   # then add your token
pnpm --filter @yaebal/example-guards dev               # reloads on change
```

- dev with reload: `pnpm --filter @yaebal/example-guards dev`
- run once: `pnpm --filter @yaebal/example-guards start`

both load `examples/guards/.env`. add the bot to a group as an administrator to see `/ban`,
`/mute`, `/pin` and `/whoami` behave differently for admins vs. regular members.

## environment variables

| name        | example           | description                                                                               |
|:------------|:------------------|:------------------------------------------------------------------------------------------|
| `BOT_TOKEN` | `123456:AA-bc...` | bot token from [@BotFather](https://t.me/BotFather). required - the bot exits without it. |

## commands the example bot answers

| command   | what it shows                                                                                  |
|:----------|:-------------------------------------------------------------------------------------------------|
| `/start`  | explains the demo                                                                                 |
| `/ban`    | `bot.filter(and(command("ban"), isAdmin), …)` — `getChatMember` only runs for `/ban`, cached 60s  |
| `/mute`   | `guardOr(isAdmin, …)` — a non-admin gets "admins only." instead of silence                        |
| `/pin`    | `botHasPermission("can_pin_messages")` — checks the *bot's* own standing, not the caller's        |
| `/whoami` | dumps `isAdmin`/`isOwner`/`hasPermission`/`isAnonymousAdmin` for you — try it as an anonymous admin |

the bot installs `membership({ ttl: 60_000 })` up front and logs every cache hit/miss/store to
the console via `onEvent`, so repeated commands from the same admin visibly stop hitting the
Bot API.

---

part of [**yaebal**](https://github.com/neverlane/yaebal) - a type-safe, runtime-agnostic Telegram Bot API framework. MIT.
