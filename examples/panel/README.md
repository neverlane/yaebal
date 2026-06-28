# @yaebal/example-panel (a runnable operator panel)

a single-file bot that mounts [`@yaebal/panel`](../../packages/panel) — a live operator
dashboard you open in the browser to read incoming DMs and reply, with **media in both
directions**. doubles as a smoke test of the panel's public api.

it wires up every panel feature: the recorder, outgoing-reply logging (`recordOutgoing`),
the login page, realtime SSE updates, the media proxy, and operator file uploads — served
on a native node `serve`.

## running

- dev with reload: `pnpm --filter @yaebal/example-panel dev`
- run once: `pnpm --filter @yaebal/example-panel start`

both read configuration from a `.env` (copy `.env.example`). then open
**http://localhost:3000** and paste your `PANEL_TOKEN` on the login screen.

## environment variables

| name          | example           | description                                                                               |
|:--------------|:------------------|:------------------------------------------------------------------------------------------|
| `BOT_TOKEN`   | `123456:AA-bc...` | bot token from [@BotFather](https://t.me/BotFather). required — the bot exits without it. |
| `PANEL_TOKEN` | `a-long-secret`   | shared secret to log into the panel. required.                                            |

## what to try

| from telegram                         | what you see in the panel                                  |
|:--------------------------------------|:-----------------------------------------------------------|
| send text                             | the message appears live; the bot echoes it back           |
| send a **photo / document / voice**   | rendered inline (image / download link / audio player)     |
| send an **album**                     | grouped into one media bubble                              |
| —                                     | the bot's own replies show up too (via `recordOutgoing`)   |

| from the panel                        | what happens                                               |
|:--------------------------------------|:-----------------------------------------------------------|
| type a reply + **send**               | delivered via `sendMessage`                                |
| **📎** attach a file                  | uploaded as `sendPhoto` / `sendDocument` / `sendVoice` / … |

## notes

- uses `MemoryPanelStore` (lost on restart). for persistence, swap in
  `SqlitePanelStore` from `@yaebal/panel/sqlite` — see the commented line in `src/index.ts`.
- the panel root is a self-contained SPA; no build step, no external assets.

---

part of [**yaebal**](https://github.com/neverlane/yaebal) — a type-safe, runtime-agnostic Telegram Bot API framework. MIT.
