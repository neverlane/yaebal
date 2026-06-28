# @yaebal/preview

> ⚠️ **experimental / wip.** api and rendering may change without notice. not ready for production.

render a telegram-style chat from plain objects to an **SVG string** — rich text, every
common media type, the lot. zero runtime, no `<foreignObject>` (so it rasterizes and
survives github's SVG sanitizer). media fields use the real `@yaebal/types` shapes, so you
can hand it a `ctx.message` almost verbatim. drop the result into docs, a README, or a
landing page.

## install

```sh
pnpm add @yaebal/preview
```

## use

```ts
import { renderChat } from "@yaebal/preview";
import { md } from "@yaebal/fmt"; // optional — produces { text, entities }

const svg = renderChat(
	[
		{ from: "user", text: "/start", time: "23:33", status: "read" },
		{ from: "bot", name: "yaebal", ...md`Hello, **unknown** person`, time: "23:33" },
		{ from: "bot", name: "yaebal", photo: [], src: "cat.jpg", caption: "a cat" },
		{ from: "bot", name: "yaebal", voice: { duration: 7 } },
		{ from: "bot", name: "yaebal", buttons: [["Useless button"]] },
	],
	{ theme: "light", width: 400 },
);

await writeFile("chat.svg", svg); // it's just a string
```

## messages

| field                                  | meaning                                                                                                                               |
|:---------------------------------------|:--------------------------------------------------------------------------------------------------------------------------------------|
| `from`                                 | `"user"` → outgoing (right, ticks) · `"bot"` → incoming (left, avatar)                                                                |
| `text`                                 | message text — wrapped automatically                                                                                                  |
| `entities`                             | telegram `MessageEntity[]` — bold/italic/underline/strike/code/spoiler/link. spread `@yaebal/fmt`'s `md`/`html` to get these for free |
| `caption` / `captionEntities`          | text under a media message                                                                                                            |
| `time` · `status` · `buttons` · `name` | time · ticks (`sent`/`delivered`/`read`) · keyboard rows · sender label + avatar                                                      |

## media

all use the real `@yaebal/types` shapes. for picture-like media add `src` (a URL/data-URI)
to show real pixels — a `file_id` has none, so without `src` you get a clean placeholder.

| field                | renders as                                            |
|:---------------------|:------------------------------------------------------|
| `photo`              | image (or placeholder) + optional `caption`           |
| `sticker`            | standalone image, or its `emoji` big                  |
| `animation`          | image + `GIF` badge                                   |
| `video`              | image + play button + duration                        |
| `voice`              | waveform + duration                                   |
| `audio`              | play disc + title / performer                         |
| `document`           | file icon + name + size                               |
| `venue` / `location` | map tile + pin (+ title/address)                      |
| `contact`            | avatar + name + phone                                 |
| `poll`               | question + options with percentage bars               |

add `spoiler: true` to cover picture media.

## options

| option   | default      | meaning                                 |
|:---------|:-------------|:----------------------------------------|
| `theme`  | `"light"`    | `"light"` (green wallpaper) or `"dark"` |
| `width`  | `380`        | canvas width in px                      |
| `avatar` | name initial | override the incoming avatar glyph      |

---

part of [**yaebal**](https://github.com/neverlane/yaebal) — a type-safe, runtime-agnostic Telegram Bot API framework. MIT.
