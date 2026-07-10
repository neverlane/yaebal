# @yaebal/pagination

paginated lists over any data source. renders a page as a telegram message with ◀ / ▶
navigation (plus optional ⏮ ⏭ jumps and a counter/refresh button), edits it in place on
every press, and optionally turns each item into a tappable button with a typed
`onSelect`. sources can be a plain array or a lazy `{ fetch, count? }` that paginates in
the database; a typed payload parameterizes one list instance per category, owner, or
filter.

built for the ways pagination actually fails in production: every callback query is
answered (the spinner never hangs), double-taps (`message is not modified`) are swallowed,
presses on 48h-old messages fall back to re-sending the page, forged callback data is
clamped, text is capped at telegram's 4096-char limit with entities clipped, and
inline-mode / business-chat messages are edited through the right routing.

## install

```sh
pnpm add @yaebal/pagination
```

## usage

```ts
import { pagination } from "@yaebal/pagination";

const users = pagination({
	id: "users",
	pageSize: 10,
	source: {
		fetch: ({ offset, limit }) => db.user.findMany({ skip: offset, take: limit }),
		count: () => db.user.count(), // optional — omit it and the plugin probes limit + 1
	},
	line: (u, i) => `${i + 1}. ${u.name}`,
});

bot.install(users.plugin());
bot.command("users", (ctx) => users.send(ctx));
```

items as buttons, with a typed payload riding every press:

```ts
import { field } from "@yaebal/callback-data";

const byGenre = pagination({
	id: "genre",
	payload: { genre: field.enum(["fantasy", "sci-fi", "poetry"]) },
	source: {
		fetch: ({ offset, limit, payload }) => db.books(payload.genre, offset, limit),
		count: (ctx, payload) => db.countBooks(payload.genre),
	},
	item: (b) => ({ label: b.title, id: b.id }),
	onSelect: (ctx, sel) => showCard(ctx, sel.id, sel.page),
});

bot.command("fantasy", (ctx) => byGenre.send(ctx, { payload: { genre: "fantasy" } }));
```

beyond `send`: `view()` renders without sending, `edit()` re-renders an existing message,
and `button()` turns any keyboard button into a jump into the list. docs:
[yaebal.mom/docs/plugins/pagination](https://yaebal.mom/docs/plugins/pagination).

---

part of [**yaebal**](https://github.com/neverlane/yaebal) — a type-safe, runtime-agnostic Telegram Bot API framework. MIT.
