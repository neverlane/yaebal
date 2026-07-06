# @yaebal/callback-data

typed `callback_data`. declare a prefix + a field schema, then `pack`/`unpack` with full
type inference and a compact wire format built for telegram's 64-byte cap.

```ts
import { Bot } from "@yaebal/core";
import { InlineKeyboard } from "@yaebal/keyboard";
import { callbackData, field } from "@yaebal/callback-data";

const user = callbackData("user", {
  id: Number,                                   // required scalar (shorthand)
  action: field.enum(["ban", "kick", "mute"]),  // union type, one char on the wire
  note: field.string().optional(),              // may be absent
  page: field.number().default(1),              // absent → filled with 1
});

user.pack({ id: 42, action: "ban" }); // "user:16:0:1"

new Bot(process.env.BOT_TOKEN!)
  .command("manage", (ctx) =>
    ctx.reply("choose:", {
      reply_markup: new InlineKeyboard()
        .text("ban", user.pack({ id: 42, action: "ban" }))
        .text("kick", user.pack({ id: 42, action: "kick", note: "spam" })),
    }),
  )
  // pass the namespace itself — the payload is validated + decoded to `ctx.queryData`,
  // and the handler runs only on a clean unpack
  .callbackQuery(user, (ctx) => {
    const { id, action, page } = ctx.queryData; // fully typed
    return ctx.answerCallbackQuery({ text: `${action} ${id} (p${page})` });
  });
```

## fields

bare `Number` / `String` / `Boolean` are shorthand for required scalars. reach for the
`field` builders when you need an enum, an optional, or a default:

| codec | wire form | type |
| --- | --- | --- |
| `Number` / `field.number()` | base36 int, decimal fallback | `number` |
| `String` / `field.string()` | raw utf-8, only `:`/`\` escaped | `string` |
| `Boolean` / `field.boolean()` | `1` / `0` | `boolean` |
| `field.enum([...] as const)` | member index (base36) | union of the members |
| `field.uuid()` | 22 base64url chars (down from 36) | `string` |
| `field.bigint()` | base36 — lossless for 64-bit ids | `bigint` |

any field chains `.optional()` (absent → `undefined` on unpack) and `.default(v)` (absent →
`v` on unpack, optional in the packed input).

`field.uuid()` is for database keys (postgres/supabase/prisma defaults): a raw uuid is 36
bytes — over half the budget — so it's repacked into 16 raw bytes + base64url.
`field.number()` refuses integers beyond `Number.MAX_SAFE_INTEGER` (they can't round-trip
exactly through a js `number`); `field.bigint()` is the lossless home for 64-bit ids.

## compact by design

numbers are base36, booleans one byte, enums a single index char, and strings stay raw
utf-8 — so a payload spends a fraction of the 64-byte budget compared with a query string
or json. `pack` **throws** if the result exceeds the limit (raise it with
`callbackData(prefix, schema, { maxBytes })`), so you find out at build time, not from a
telegram `400`.

## total unpack — never throws

`unpack` returns `undefined` for anything that isn't valid data for this namespace: a
foreign prefix, wrong arity, a number that isn't a number, an enum index out of range, a
malformed payload. telegram itself warns a callback query can arrive with data that no
longer matches any live button, so this is a real path — handle the `undefined`.

## schema evolution

appending an **optional** field, or appending a member to an **enum**, is
backward-compatible — buttons packed before the change still `unpack`. adding a required
field, reordering fields, or changing a field's type breaks old buttons.

```ts
const v1 = callbackData("p", { id: Number });
const v2 = callbackData("p", { id: Number, note: field.string().optional() });
v2.unpack(v1.pack({ id: 7 })); // { id: 7 } — old button still decodes
```

## api

- `callbackData(prefix, schema, options?)` → a `CallbackData` namespace. `options.maxBytes`
  overrides the 64-byte guard.
- `field` — `string()`, `number()`, `boolean()`, `enum(values)`, `uuid()`, `bigint()`,
  each chainable with `.optional()` / `.default(v)`.
- on a namespace: `pack(data)`, `unpack(raw)`, `filter(raw)` (cheap prefix check),
  `pattern` (regex), `extend(extraSchema)` (immutable — returns a new namespace), `prefix`.
- `bot.callbackQuery(namespace, handler)` routes on a successful unpack and exposes the
  typed payload as `ctx.queryData`.

## install

```sh
pnpm add @yaebal/callback-data
```

---

part of [**yaebal**](https://github.com/neverlane/yaebal) — a type-safe, runtime-agnostic Telegram Bot API framework. MIT.
