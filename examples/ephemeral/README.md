# @yaebal/example-ephemeral (a runnable bot)

a focused bot that tours `@yaebal/ephemeral` paired with `@yaebal/commands`: ephemeral menu
commands (`is_ephemeral`), private-in-the-group replies via `ctx.replyEphemeral()`, in-place
edits and deletes through the typed handle, rebuilding a handle from a callback query with
`wrapEphemeralMessage`, and the private-chat fallback.

add the bot to a group to see the real thing — `/roll` and `/me` answer so only you see it.
in a private chat the same code transparently sends a normal message instead.

## running

```sh
cp examples/ephemeral/.env.example examples/ephemeral/.env   # then add your token
pnpm --filter @yaebal/example-ephemeral dev                  # reloads on change
```

- dev with reload: `pnpm --filter @yaebal/example-ephemeral dev`
- run once: `pnpm --filter @yaebal/example-ephemeral start`

## environment variables

| name        | example           | description                                                                               |
|:------------|:------------------|:------------------------------------------------------------------------------------------|
| `BOT_TOKEN` | `123456:AA-bc...` | bot token from [@BotFather](https://t.me/BotFather). required - the bot exits without it. |

## commands the example bot answers

| command  | what it shows                                                                                     |
|:---------|:---------------------------------------------------------------------------------------------------|
| `/roll`  | ephemeral reply + `msg.edit()` + inline buttons; reroll/dismiss keep editing the same handle       |
| `/me`    | a second ephemeral command — `is_ephemeral` in the menu, private answer in the group               |
| `/about` | a normal command for contrast — its reply lands in the group history for everyone                  |

ephemeral messages need bot api 10.2+ and exist in group/supergroup chats only; delivery is
best-effort by design (offline users may never see one).

---

part of [**yaebal**](https://github.com/neverlane/yaebal) - a type-safe, runtime-agnostic Telegram Bot API framework. MIT.
