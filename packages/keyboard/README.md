# @yaebal/keyboard

fluent inline & reply keyboard builders — full coverage of Telegram's button types
(callback, url, web app, login, switch-inline, copy-text, pay, game, request user/chat/managed-bot,
poll) plus `Keyboard.remove()` / `Keyboard.forceReply()` for the other `reply_markup` shapes.

## install

```sh
pnpm add @yaebal/keyboard
```

## usage

```ts
import { InlineKeyboard, Keyboard } from "@yaebal/keyboard";

const inline = new InlineKeyboard()
  .text("ban", "action:ban")
  .text("warn", "action:warn")
  .row()
  .url("profile", "https://t.me/username")
  .build();

const reply = new Keyboard()
  .requestUsers("pick a user", 1, { max_quantity: 1 })
  .row()
  .requestChat("pick a channel", 2, true)
  .resized()
  .oneTime()
  .build();

// hide/force-reply markups
Keyboard.remove();
Keyboard.forceReply({ input_field_placeholder: "type here" });
```

### dynamic buttons

`add()` appends raw button objects — pair it with the static, instance-free `text`/`url`/`webApp`
(and `requestUsers`/`requestChat`/`requestManagedBot` on `Keyboard`) to build buttons from an
array. `columns(n)` auto-wraps into rows of `n` so you don't drive `.row()` by hand:

```ts
const products = await getProducts();

const kb = new InlineKeyboard()
  .columns(2)
  .add(...products.map((p) => InlineKeyboard.text(p.name, `buy:${p.id}`)))
  .build();
```

`InlineKeyboard`/`Keyboard` instances also implement `toJSON()`, so you can pass the builder
itself as `reply_markup` and skip the trailing `.build()` — `Api` stringifies the body either way.

---

part of [**yaebal**](https://github.com/neverlane/yaebal) — a type-safe, runtime-agnostic Telegram Bot API framework. MIT.
