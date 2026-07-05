# @yaebal/example-media-studio (a runnable bot)

a media-heavy bot that receives albums, resolves telegram files, caches uploaded media,
sends generated svg previews and splits long reports.

## running

```sh
cp examples/media-studio/.env.example examples/media-studio/.env   # then add your token
pnpm --filter @yaebal/example-media-studio dev                     # reloads on change
```

- dev with reload: `pnpm --filter @yaebal/example-media-studio dev`
- run once: `pnpm --filter @yaebal/example-media-studio start`

both load `examples/media-studio/.env`. on start the bot registers its command menu with
telegram, so the commands below show up in the `/` picker.

## environment variables

| name        | example           | description                                                                               |
|:------------|:------------------|:------------------------------------------------------------------------------------------|
| `BOT_TOKEN` | `123456:aa-bc...` | bot token from [@BotFather](https://t.me/BotFather). required - the bot exits without it. |

## commands the example bot answers

| command    | what it shows                                           |
|:-----------|:--------------------------------------------------------|
| `/start`   | explains the media studio                               |
| `/poster`  | sends a remote photo through `media.url()`              |
| `/cache`   | sends the same cached photo twice                       |
| `/preview` | generates and sends an svg chat mockup                  |
| `/long`    | sends a long report with automatic splitting            |

send a photo, document or album to trigger the receive-side demos for `@yaebal/files` and
`@yaebal/media-group`.

---

part of [**yaebal**](https://github.com/neverlane/yaebal) - a type-safe, runtime-agnostic Telegram Bot API framework. MIT.
