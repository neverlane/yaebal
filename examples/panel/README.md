# @yaebal/example-panel (a runnable bot with operator panel)

a runnable bot for the [`@yaebal/panel`](../../packages/panel) operator console. it exercises the panel as
a real support inbox: identity sidebar, generated avatars, text/media previews, media
viewer, styled voice/video cards, albums, inline keyboards, callbacks, polls, reactions,
event rows, outgoing logging, login and SSE.

## running

- dev with reload: `pnpm --filter @yaebal/example-panel dev`
- run once: `pnpm --filter @yaebal/example-panel start`

copy `.env.example`, fill `BOT_TOKEN` and `PANEL_TOKEN`, then open
`http://localhost:3000` and paste `PANEL_TOKEN` on the login screen.

## environment variables

| name          | example           | description                                                                               |
|:--------------|:------------------|:------------------------------------------------------------------------------------------|
| `BOT_TOKEN`   | `123456:AA-bc...` | bot token from [@BotFather](https://t.me/BotFather). required.                            |
| `PANEL_TOKEN` | `a-long-secret`   | shared secret to log into the panel. required.                                            |

## what to try

| from telegram                         | what you see in the panel                                         |
|:--------------------------------------|:------------------------------------------------------------------|
| `/start`                              | inline keyboard preview and identity sidebar                      |
| press an inline button                | callback event row plus bot response                              |
| `/demo`                               | keyboard, poll, dice placeholder and outgoing message recording   |
| send text                             | live text preview and echo                                        |
| send a photo or album                 | media preview, grouped album and viewer dialog                    |
| send a video                          | styled video card with expandable viewer                          |
| send a voice note                     | styled voice message card with waveform                           |
| send a document                       | document card with file name and MIME preview                     |
| react to a message or answer a poll   | event rows when Telegram delivers those updates                   |

| from the panel                        | what happens                                                                     |
|:--------------------------------------|:---------------------------------------------------------------------------------|
| type a reply and send                 | delivered via `sendMessage`                                                      |
| attach a file                         | uploaded as `sendPhoto`, `sendVideo`, `sendVoice`, `sendAudio` or `sendDocument` |

## notes

- uses `MemoryPanelStore`; swap in `SqlitePanelStore` from `@yaebal/panel/sqlite` for persistence.
- requests `callback_query`, reaction, poll and member update types through `allowedUpdates`.
- the panel root is a self-contained SPA with inline SVG icons and no external assets.

---

part of [**yaebal**](https://github.com/neverlane/yaebal) — a type-safe, runtime-agnostic Telegram Bot API framework. MIT.
