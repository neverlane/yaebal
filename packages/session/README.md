# @yaebal/session

typed session state for yaebal bots: `ctx.session` is loaded before your handlers run and
persisted after — but only when it actually changed. per-chat by default, per-user or
per-anything via key strategies, with lazy loading, multiple independent sessions, schema
migrations, self-expiring fields and any [`@yaebal/sklad`](../sklad) storage behind it.

## install

```sh
pnpm add @yaebal/session
```

## usage

```ts
import { Bot } from "@yaebal/core";
import { session } from "@yaebal/session";

interface MySession {
	count: number;
}

const bot = new Bot(process.env.BOT_TOKEN!).install(
	session<MySession>({ initial: () => ({ count: 0 }) }),
);

bot.on("message", (ctx) => ctx.send(`message #${++ctx.session.count}`));

bot.start();
```

the context type is augmented automatically — no declaration merging, no flavors.

## what it does for you

- **dirty-checked saves.** a save is skipped when the state didn't change (deep mutations count —
  tracked by snapshot, not proxies, so there is no class of "mutation the proxy didn't see").
  untouched fresh sessions are never written at all: lurkers don't fill your storage with
  `initial()` records. pass `alwaysSave: true` to opt out.
- **sliding expiry.** when the adapter advertises `touch` (redis/sqlite/file/memory with `ttl`),
  an unchanged read refreshes the ttl, so sessions live as long as the chat is active.
- **honest types.** `initial` is required, so `ctx.session` is always `S` — never `S | undefined`.

## storage

defaults to a cloning in-memory store. bring any `StorageAdapter` from
[`@yaebal/sklad`](../sklad) — redis, sqlite, cloudflare kv, a json file — or implement the
three-method interface yourself:

```ts
import { redisStorage } from "@yaebal/sklad";

bot.install(
	session({
		initial: () => ({ count: 0 }),
		storage: redisStorage(redis, { prefix: "session:", ttl: 24 * 60 * 60_000 }),
	}),
);
```

## key strategies

```ts
import { keyBy, session } from "@yaebal/session";

session({ initial, getKey: keyBy.chat });       // default: one session per chat
session({ initial, getKey: keyBy.user });       // per user — also covers inline queries
session({ initial, getKey: keyBy.chatUser });   // per user per chat
session({ initial, getKey: keyBy.chatThread }); // per forum topic
```

`getKey` may be async and may return a composite descriptor —
`{ chat: 42, user: 7 }` becomes the storage key `"user:7:chat:42"`:

```ts
session({ initial, getKey: (ctx) => ({ chat: ctx.chat?.id, key: "quiz" }) });
```

updates that yield no key (a `poll` update, an inline query under the per-chat default) get a
throwaway session by default; choose with `onMissingKey`: `"throwaway"` | `"skip"` | `"error"`.

## multiple sessions

give installs distinct `key` names — each gets its own field, storage and partition, and the
types flow for both:

```ts
bot
	.install(session({ key: "chatState", initial: () => ({ topic: "" }) }))
	.install(session({ key: "userState", initial: () => ({ visits: 0 }), getKey: keyBy.user }));

bot.on("message", (ctx) => {
	ctx.chatState.topic = "pricing";
	ctx.userState.visits++;
});
```

(pick names that don't collide with existing context fields — two installs sharing one field
fail loud at runtime.)

## lazy sessions

`lazySession` defers the storage read until the first `await ctx.session` — handlers that never
touch the session cost zero storage round-trips:

```ts
import { lazySession } from "@yaebal/session";

bot.install(lazySession({ initial: () => ({ count: 0 }) }));

bot.on("message", async (ctx) => {
	const session = await ctx.session; // ← the only storage read, and only if you get here
	session.count++;
});
```

## clearing and flushing

```ts
import { clearSession, saveSession } from "@yaebal/session";

bot.command("reset", async (ctx) => {
	await clearSession(ctx); // delete from storage + fresh initial()
	await ctx.send("state wiped");
});

bot.command("checkout", async (ctx) => {
	ctx.session.step = "paying";
	await saveSession(ctx); // flush now, before the risky long call
	await startPayment(ctx);
});
```

both take the field name for multi-session setups: `clearSession(ctx, "userState")`.

## self-expiring fields

`ttl()` wraps a value with its own expiry; expired fields are deleted on the next load. explicit
by design — the envelope is visible in your session type, no proxy magic:

```ts
import { ttl, unwrapTtl, type TtlValue } from "@yaebal/session";

interface MySession {
	otp?: TtlValue<string>;
}

ctx.session.otp = ttl("1234", 60_000);       // valid for a minute
const code = unwrapTtl(ctx.session.otp);     // string | undefined
```

## migrations

change the session shape without wiping old data — versioned, gapless steps starting at 1;
records written before migrations existed count as version 0:

```ts
session<{ fullName: string; visits: number }>({
	initial: () => ({ fullName: "", visits: 0 }),
	migrations: {
		1: (old) => ({ fullName: (old as { name: string }).name }),
		2: (v1) => ({ ...(v1 as { fullName: string }), visits: 0 }),
	},
});
```

migrated records are re-persisted immediately (wrapped in a small version envelope), so each
record upgrades exactly once.

## error semantics & concurrency

- a throwing handler skips the save: half-applied state is not persisted. the default
  `MemoryStorage` clones values, so this guarantee holds in dev exactly like it does with redis.
- long polling processes updates sequentially, and `@yaebal/runner` sequentializes per chat —
  matching the default per-chat key, so read-modify-write races don't happen there. webhook
  deliveries can run concurrently: if you handle webhooks in parallel, updates of one chat may
  race like in every session middleware in every framework — keep handlers short or serialize
  per key upstream.

---

part of [**yaebal**](https://github.com/neverlane/yaebal) — a type-safe, runtime-agnostic Telegram Bot API framework. MIT.
