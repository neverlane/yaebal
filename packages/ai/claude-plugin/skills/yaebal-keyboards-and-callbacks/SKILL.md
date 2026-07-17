---
name: yaebal-keyboards-and-callbacks
description: Use when adding inline/reply keyboards or handling button presses in a yaebal bot — @yaebal/keyboard builders and @yaebal/callback-data typed payloads.
---

# keyboards and callback queries

use `InlineKeyboard`/`Keyboard` builders for markup and `callbackData` schemas for button
payloads. never invent raw `callback_data` string formats (`"buy_42_pro"`) and parse them with
`split(":")` — the typed schema packs tighter, validates on unpack, and routes for you.
both are re-exported from `"yaebal"`.

## keyboards

```typescript
import { InlineKeyboard, Keyboard } from "yaebal";

const inline = new InlineKeyboard()
	.text("ban", "action:ban")       // callback button: label, callback_data
	.text("warn", "action:warn")
	.row()
	.url("profile", "https://t.me/username");

await ctx.reply("choose:", { reply_markup: inline }); // builders implement toJSON() — no .build() needed

const reply = new Keyboard().text("menu").row().text("help").resized().oneTime();
Keyboard.remove();                                     // hide a reply keyboard
Keyboard.forceReply({ input_field_placeholder: "type here" });

// dynamic grids: columns(n) auto-wraps, add() takes button objects
const kb = new InlineKeyboard()
	.columns(2)
	.add(...products.map((p) => InlineKeyboard.text(p.name, buy.pack({ id: p.id }))));
```

## typed callback payloads

```typescript
import { callbackData, field } from "yaebal";

const buy = callbackData("buy", {
	id: Number,                                  // required scalar shorthand
	plan: field.enum(["free", "pro"] as const),  // one char on the wire
	page: field.number().default(1),             // absent → 1
});

bot.command("shop", (ctx) =>
	ctx.reply("pick:", {
		reply_markup: new InlineKeyboard()
			.text("pro", buy.pack({ id: 42, plan: "pro" })), // "buy:16:1:1"
	}),
);

// pass the namespace itself — handler runs only on a clean unpack
bot.callbackQuery(buy, async (ctx) => {
	const { id, plan, page } = ctx.queryData; // fully typed
	await ctx.answerCallbackQuery({ text: `buying ${plan} #${id} (p${page})` });
});
```

field codecs: `field.string()`, `field.number()`, `field.boolean()`, `field.enum([...])`,
`field.uuid()` (36 → 22 chars), `field.bigint()` (lossless 64-bit ids); each chains
`.optional()` / `.default(v)`.

## rules

- **always answer callback queries** — `await ctx.answerCallbackQuery()` (optionally with
  `{ text }` or `{ show_alert: true }`), or the user's client shows a spinner for ~30s.
- telegram caps `callback_data` at 64 bytes. `pack()` throws at build time if exceeded —
  shorten the prefix or use `field.uuid()`/`field.bigint()` for ids.
- `unpack()` never throws — it returns `undefined` for foreign/stale/malformed data (old
  buttons outlive deploys). `bot.callbackQuery(namespace, ...)` handles that for you.
- schema evolution: appending an `.optional()` field or an enum member keeps old buttons
  working; adding a required field, reordering, or changing a type breaks them.
- `bot.callbackQuery("exact-string", handler)` and regex matching also exist for trivial
  cases, but prefer a `callbackData` namespace as soon as a payload carries data.
- after handling a press, update the message (`editMessageText`/`editMessageReplyMarkup`)
  rather than sending a new one, when the ui is a menu.

## learn more

- https://yaebal.mom/docs/plugins/keyboard/
- https://yaebal.mom/docs/plugins/callback-data/
