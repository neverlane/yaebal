# @yaebal/split

send text of any length as a chain of Telegram-sized messages. splits on newlines and spaces (never mid-surrogate), carries `format` entities across part boundaries, keeps keyboards on the right message, and reports partial failures — the things a naive `.slice(0, 4096)` gets wrong.

## install

```sh
pnpm add @yaebal/split
```

## usage

```ts
import { splitter } from "@yaebal/split";

const bot = new Bot(token).install(splitter()); // adds ctx.sendLong / ctx.replyLong / ctx.sendPhotoLong

bot.on("message:text", async (ctx) => {
	const messages = await ctx.replyLong(hugeReport);
	// messages: Message[] — one per part, sent in order
});
```

formatted text just works — build it with `format`/`fmt` and entities are clipped and re-based per part, so bold text that crosses a boundary stays bold on both sides:

```ts
import { bold, format } from "@yaebal/core";

await ctx.sendLong(format`${bold(veryLongChangelog)}`);
```

`parse_mode` markup cannot survive a split (a `<b>` opened in part one breaks part two), so a multi-part `sendLong` with `parse_mode` in `extra` throws up front instead of 400-ing halfway through. single-part sends pass it through untouched.

## keyboards, quoting, pacing

```ts
await ctx.replyLong(text, { reply_markup: keyboard }, {
	markup: "last",   // default — the keyboard goes on the final message ("first" | "all")
	replyTo: "first", // default — only the first part quotes the origin ("all")
	delayMs: 300,     // pause between parts, plays nice with flood limits
	signal,           // AbortSignal — stop the remaining parts
});
```

plugin-level defaults work the same way: `splitter({ max: 2000, delayMs: 300 })`. a bare number is shorthand for `{ max }`.

## captions

`sendPhotoLong` implements the caption strategy: the first part becomes the photo caption (≤ 1024 chars), the rest go out as regular messages.

```ts
await ctx.sendPhotoLong(media.url(poster), format`${bold(longDescription)}`);
```

## partial failure

if part 3 of 5 fails (network, 429, blocked bot), the promise rejects with a `SplitSendError` that carries what already went out:

```ts
import { SplitSendError } from "@yaebal/split";

try {
	await ctx.sendLong(text);
} catch (error) {
	if (error instanceof SplitSendError) {
		error.sent;  // Message[] — parts that were delivered
		error.part;  // index of the failed part
		error.cause; // the underlying error
	}
}
```

## outside the context (any framework)

`splitSend` is the framework-agnostic loop: split, then run an action per part, in order. each part is `{ text, entities }` — a valid `format` result, so inside yaebal `(part) => ctx.send(part)` just works.

```ts
import { splitSend } from "@yaebal/split";

const results = await splitSend(longText, ({ text, entities }) =>
	someOtherFramework.sendMessage(chatId, text, { entities }),
);
```

the pure splitters are exported too:

```ts
import { split, splitCaption, splitParts, splitText } from "@yaebal/split";

split("a\nb\n…");            // string[]
splitText(formatResult);      // { text, entities }[]
splitCaption(caption);        // first part ≤ 1024, rest ≤ 4096
for (const part of splitParts(text)) { … } // lazy generator
```

whitespace-only parts are dropped (telegram rejects empty messages), boundary whitespace is trimmed, and a surrogate pair is never cut in half — emoji survive hard splits intact.

## api

| export | kind | what it does |
| --- | --- | --- |
| `splitter(max? \| options?)` | plugin | installs `sendLong` / `replyLong` / `sendPhotoLong` on the context |
| `splitSend(text, action, options?)` | function | framework-agnostic sequential delivery |
| `splitText(text, max?)` | function | eager split into `{ text, entities }` parts |
| `splitParts(text, max?)` | generator | lazy `splitText` |
| `split(text, max?)` | function | plain-string split — `string[]` |
| `splitCaption(text, options?)` | function | first part fits a caption, the rest fit messages |
| `SplitSendError` | class | mid-chain failure: `sent`, `part`, `parts`, `cause` |
| `MAX_MESSAGE_LENGTH` | const | `4096` |
| `MAX_CAPTION_LENGTH` | const | `1024` |

---

part of [**yaebal**](https://github.com/neverlane/yaebal) — a type-safe, runtime-agnostic Telegram Bot API framework. MIT.
