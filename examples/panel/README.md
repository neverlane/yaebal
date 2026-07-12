# @yaebal/example-panel (a runnable bot)

the full tour of `@yaebal/panel`: handoff, multi-operator login with an audit trail,
reply/edit/delete, search, canned responses, conversation export, a typing indicator,
admin notifications, identity sidebar, media viewer, voice/video cards, albums, inline
keyboards, callbacks, polls, reactions, location/contact sharing, outgoing logging and
realtime SSE.

## running

```sh
cp examples/panel/.env.example examples/panel/.env   # then add your token and panel secret
pnpm --filter @yaebal/example-panel dev              # reloads on change
```

- dev with reload: `pnpm --filter @yaebal/example-panel dev`
- run once: `pnpm --filter @yaebal/example-panel start`

both load `examples/panel/.env`. after startup, open `http://localhost:3000` and log in.

## environment variables

| name            | example           | description                                                                                        |
|:----------------|:------------------|:----------------------------------------------------------------------------------------------------|
| `BOT_TOKEN`     | `123456:aa-bc...` | bot token from [@BotFather](https://t.me/BotFather). required — the bot exits without it.           |
| `PANEL_TOKEN`   | `a-long-secret`   | shared secret for a single-operator login. required unless `ALICE_TOKEN`/`BOB_TOKEN` are both set.  |
| `ALICE_TOKEN`   | `a-long-secret`   | optional — set alongside `BOB_TOKEN` to demo multi-operator login and the audit trail instead.      |
| `BOB_TOKEN`     | `a-long-secret`   | optional — see `ALICE_TOKEN`.                                                                        |
| `ADMIN_CHAT_ID` | `123456789`       | optional — your own telegram user/chat id, DM'd when a message arrives with no panel connected.     |

## what to try in the panel

- **handoff** — click the status pill in the thread header to mark a chat `handled`; the
  bot's own handlers (the echo, the media echoes) go quiet for that chat until you release
  it back to `open`.
- **reply / edit / delete** — click a message bubble to reveal its action bar. reply
  targets `reply_parameters`; edit calls `editMessageText`; delete soft-deletes with a
  tombstone. edit a message you sent from telegram itself too — it patches in place.
- **search** — the sidebar search box hits `GET /api/search` across every chat.
- **canned responses** — the composer's quick-reply icon opens the templates configured
  in `src/index.ts`.
- **assign / pin** — claim a chat for yourself, or pin it to the top of the sidebar.
- **export** — download a conversation as JSON or plain text from the thread header.
- **multi-operator audit** — set `ALICE_TOKEN`/`BOB_TOKEN` and log in as either; every
  panel-sent message records who sent it.

## commands the example bot answers

| command  | what it shows                                                                          |
|:---------|:----------------------------------------------------------------------------------------|
| `/start` | the demo intro with callback buttons and a tour of what to try in the panel              |
| `/demo`  | a keyboard, poll, dice, and a reply keyboard requesting your location/contact           |

it also echoes text (as a reply, so the panel's reply strip shows up), records callback
queries, location and contact shares, sends photos/videos/voice notes back by `file_id`,
records documents, and lets operators reply, edit, delete, search and export from the
browser panel.

---

part of [**yaebal**](https://github.com/neverlane/yaebal) - a type-safe, runtime-agnostic Telegram Bot API framework. MIT.
