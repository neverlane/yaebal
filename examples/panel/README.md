# @yaebal/example-panel (a runnable bot)

a runnable support inbox for `@yaebal/panel`: identity sidebar, generated avatars,
text/media previews, media viewer, voice/video cards, albums, inline keyboards,
callbacks, polls, reactions, outgoing logging, login and realtime sse.

## running

```sh
cp examples/panel/.env.example examples/panel/.env   # then add your token and panel secret
pnpm --filter @yaebal/example-panel dev              # reloads on change
```

- dev with reload: `pnpm --filter @yaebal/example-panel dev`
- run once: `pnpm --filter @yaebal/example-panel start`

both load `examples/panel/.env`. after startup, open `http://localhost:3000` and paste
`PANEL_TOKEN` on the login screen.

## environment variables

| name          | example           | description                                                                               |
|:--------------|:------------------|:------------------------------------------------------------------------------------------|
| `BOT_TOKEN`   | `123456:aa-bc...` | bot token from [@BotFather](https://t.me/BotFather). required - the bot exits without it. |
| `PANEL_TOKEN` | `a-long-secret`   | shared secret used to log into the browser panel. required.                               |

## commands the example bot answers

| command  | what it shows                                                              |
|:---------|:---------------------------------------------------------------------------|
| `/start` | sends the panel demo intro with callback buttons                           |
| `/demo`  | sends a keyboard, poll and dice so the panel has rich events to display    |

it also echoes text, records callback queries, sends photos/videos/voice notes back by
`file_id`, records documents and lets operators reply from the browser panel.

---

part of [**yaebal**](https://github.com/neverlane/yaebal) - a type-safe, runtime-agnostic Telegram Bot API framework. MIT.
