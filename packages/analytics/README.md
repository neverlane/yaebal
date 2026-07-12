# @yaebal/analytics

typed event tracking and funnels, straight from middleware: `ctx.track("purchase", { amount: 9 })`
fans out to whatever sinks you configure — posthog, plausible, your own sqlite/clickhouse table, a
generic HTTP collector, or a console log for local dev. event names and their properties are
checked against a catalog you declare once, the same way `@yaebal/feature-flags` types flag keys —
a typo in an event name or a missing required property is a compile error, not a silent gap in
your funnel three months later.

## install

```sh
pnpm add @yaebal/analytics
```

## quickstart

```ts
import { Bot } from "@yaebal/core";
import { analytics, consoleAdapter, p } from "@yaebal/analytics";

const bot = new Bot(process.env.BOT_TOKEN!).install(
	analytics({
		events: {
			start: true, // declared, untyped — any properties allowed
			purchase: { props: p.object({ amount: p.number(), plan: p.optional(p.string()) }) },
		},
		adapters: [consoleAdapter()],
	}),
);

bot.command("start", (ctx) => {
	ctx.track("start", { source: "deeplink" });
	return ctx.reply("hi!");
});

bot.command("buy", (ctx) => {
	ctx.track("purchase", { amount: 9, plan: "pro" }); // name + props type-checked against `events`
	return ctx.reply("thanks!");
});
```

`.install(analytics(...))` adds `ctx.track(name, properties?)` and `ctx.identify(properties)` —
every call resolves `userId`/`chatId` from the current `ctx` before handing the event to your
adapters. skip `events` entirely to keep `ctx.track` fully untyped (any `string` name, any
properties) — the same shape `@yaebal/analytics@0.0.x` shipped.

## the typed catalog

```ts
import { p } from "@yaebal/analytics";

const events = {
	// `true` — declared, but any properties allowed (no schema to enforce)
	onboarding_completed: true,
	// a schema — required/optional fields checked at both compile time and runtime
	purchase: {
		props: p.object({ amount: p.number(), currency: p.optional(p.string()) }),
		sample: 0.5, // only half of these actually reach adapters — see "sampling" below
		redact: ["email"], // stripped from this event's properties specifically
		description: "a completed checkout",
	},
};
```

`p` is a tiny, zero-dependency runtime validator — `p.string()` / `p.number()` / `p.boolean()` /
`p.optional(field)` / `p.object({...})`. it exists to give `ctx.track` both compile-time property
checking and a runtime guard against a malformed call; reach for `zod`/`valibot` and hand-write a
`PropsSchema` (`{ parse(value) }`) if you need more than that.

a malformed `track()` call (wrong property type, missing required property, or — when a catalog
was declared — an event name that isn't in it) is reported to `onError` and dropped, never thrown
into your handler and never silently forwarded to adapters.

## adapters

adapters take an already-constructed client and type it structurally, so this package depends on
nothing and never dictates a driver version.

```ts
import {
	clickhouseAdapter,
	httpAdapter,
	plausibleAdapter,
	postHogAdapter,
	sqliteAdapter,
} from "@yaebal/analytics";
import { PostHog } from "posthog-node";
import { DatabaseSync } from "node:sqlite";

analytics({
	events,
	adapters: [
		postHogAdapter(new PostHog(process.env.POSTHOG_KEY!)),
		plausibleAdapter({ domain: "mybot.example" }),
		sqliteAdapter(new DatabaseSync("analytics.db")),
		clickhouseAdapter(clickhouseClient, { batchSize: 50 }),
		httpAdapter("https://collector.example/events", { headers: { authorization: "Bearer ..." } }),
	],
	onError: (error, event) => console.error("analytics failed", event.name, error),
});
```

- **`postHogAdapter(client, options?)`** — `client` is anything shaped like `posthog-node`'s
  `PostHog` (structural `capture()` + optional `identify()`/`flush()`). a custom `distinctId()`
  keeps `userId` reachable as a property, since it's no longer posthog's own identity.
- **`plausibleAdapter(options)`** — posts straight to plausible's events api, no client library.
  plausible dedupes "unique visitors" by hashing IP + user-agent; without a real per-user IP,
  every event from a bot process would look like the same visitor (the server's IP), so this
  adapter sends a deterministic synthetic `X-Forwarded-For` derived from `userId`/`chatId` instead.
  only scalar (string/number/boolean) properties reach plausible — an object/array value is
  dropped rather than corrupting the breakdown as `"[object Object]"`.
- **`sqliteAdapter(db, options?)`** — `db` is `node:sqlite`'s `DatabaseSync`, `better-sqlite3`, or
  anything with `exec`/`prepare`. creates its table (and a `(name, created_at)` index) on first
  use — see `sqliteSchema()` to run the DDL yourself. `user_id`/`chat_id` are stored as `TEXT` (an
  `anonymize`d id can be a hash string, not just a number). for a write-heavy bot, open `db` with
  `db.exec("PRAGMA journal_mode = WAL")` yourself — the adapter doesn't set pragmas on a
  connection it doesn't own. supports `query()`, so `analyticsAdmin()` works against it directly.
- **`clickhouseAdapter(client, options?)`** — `client` is anything shaped like `@clickhouse/client`
  (structural `insert()`). clickhouse has no `CREATE TABLE IF NOT EXISTS` auto-migration like
  sqlite's `db.exec` — run `clickhouseSchema()`'s DDL yourself once:

  ```ts
  import { clickhouseSchema } from "@yaebal/analytics";
  await clickhouseClient.command({ query: clickhouseSchema() });
  ```

  buffers events and batch-inserts (`batchSize`, `intervalMs`, `maxRetries`, `maxBuffered`,
  `onDrop`) via the same `batched()` helper `httpAdapter` uses — a failed insert **retries with
  backoff instead of losing the batch**, unlike the naive "clear the buffer, then send" approach
  this adapter used before `0.1.0` (a transient outage during that window silently dropped every
  buffered event with no trace). `flush()` — wired to `bot.onStop` automatically, see below —
  drains a partial batch before shutdown.
- **`httpAdapter(url, options?)`** — POST batches of events as JSON to any collector (umami, a
  mixpanel-compatible batch endpoint, your own). same batching/retry/backpressure as
  `clickhouseAdapter`.
- **`memoryAdapter()`** — an in-memory sink: for tests (see "testing" below) and small bots that
  want `/stats` without a database. supports `query()`.
- **`consoleAdapter()`** — zero-config sink for local development.

adapter failures never break tracking: `track()` is fire-and-forget, and a rejected/throwing
adapter is routed to `onError` instead of interrupting the update. `onError` itself is never
allowed to break tracking either — if it throws, the error is swallowed after one `console.warn`
rather than propagating out of `ctx.track()`/`flush()`.

## privacy

`userId`/`chatId` are personal data the moment they leave your process — a cloud posthog/plausible
instance is a third party. `analytics()` has first-class controls instead of leaving this to you:

```ts
analytics({
	events,
	adapters: [postHogAdapter(posthog)],
	// hash userId/chatId before any adapter sees them — stable per id (funnels still group
	// correctly), not reversible by casual inspection, NOT a security control (small id spaces
	// are brute-forceable). pass a function instead (e.g. HMAC with a secret) for anything stronger.
	anonymize: "hash",
	// strip a property from every event, on top of any catalog entry's own `redact`
	redact: ["ip"],
	// consulted with the RAW (pre-anonymize) ids — an opt-out list keyed by real telegram ids
	// still works. a throwing/rejecting predicate fails OPEN, so a buggy check can't blackhole
	// every event.
	shouldTrack: (event) => !optedOut.has(event.userId),
	// load-shedding, not a stable per-user rollout — 10% of calls reach adapters, decided fresh
	// per call. a catalog entry's own `sample` overrides this for that event.
	sample: 0.1,
});
```

## auto-capture

emit events for common update kinds with no manual `ctx.track` call:

```ts
analytics({ adapters: [consoleAdapter()], autoTrack: ["commands", "callback_queries", "messages"] });
```

each kind emits a **fixed** event name with the dynamic bit as a *property*:
`command_used` + `{ command: "start" }`, `callback_query` + `{ data: "..." }`,
`message_received` + `{ contentType: "text" }`. an event name per distinct command/callback
payload would blow up your adapters' event schemas — posthog, plausible, and your own SQL all key
funnels off the event name, not property values. a command message is only counted once even with
both `"commands"` and `"messages"` enabled.

## an in-chat admin surface

```ts
import { analyticsAdmin, memoryAdapter } from "@yaebal/analytics";

const store = memoryAdapter(); // or sqliteAdapter/clickhouseAdapter — anything with query()

bot
	.install(analytics({ adapters: [store] }))
	.install(analyticsAdmin({ isAdmin: (ctx) => ctx.from?.id === OWNER_ID, adapter: store }));
```

- `/analytics` — total events and top event names over the last 24h
- `/analytics 1h` | `7d` | `30d` — same, over a different window

`posthogAdapter`/`plausibleAdapter` don't implement `query()` (neither exposes a read api this
package can call) — pair `analyticsAdmin` with `memoryAdapter`, `sqliteAdapter`, or
`clickhouseAdapter` instead, or read those tools' own dashboards.

## flushing on shutdown

buffered adapters (`clickhouseAdapter`, `httpAdapter`) hold events in memory between batches.
`analytics()` wires `flush()` to `bot.onStop` **automatically** when installed on a `Bot` —
`bot.stop()` won't resolve until the drain completes, so a half-collected batch is never lost on a
normal shutdown. on a bare `Composer` (no `Bot`) or a webhook/serverless deployment where
`bot.onStop` never fires, call `.flush()` yourself:

```ts
const events = analytics({ adapters: [clickhouseAdapter(client)] });
bot.install(events);
// only needed off a Bot — installed on a real Bot, this already happens for you.
someOtherShutdownHook(() => events.flush());
```

## a unified collection point

plugins like `@yaebal/broadcast` already emit their own event stream (`onEvent`). build a
standalone client with `createAnalytics()` and feed both `ctx.track` and other plugins' events
into the same adapters with `fromEvent`:

```ts
import { analytics, createAnalytics, fromEvent } from "@yaebal/analytics";

const events = createAnalytics({ adapters: [postHogAdapter(posthog)] });

bot.install(analytics(events)); // ctx.track(...) now shares `events`'s adapters

const jobs = new Broadcast({
	// ...
	onEvent: (event) => events.track(fromEvent("broadcast", event)),
});
```

`events`/`context`/`autoTrack` only apply when `analytics()` builds its own client from an
`AnalyticsOptions` config — a shared client passed in already has its own (or no) catalog, and has
no `ctx` for `context`/`autoTrack` to hook into.

## testing

```ts
import { createTestEnv } from "@yaebal/test";
import { analytics, memoryAdapter } from "@yaebal/analytics";

const store = memoryAdapter();

const bot = new Composer<Context>()
	.install(analytics({ adapters: [store] }))
	.command("start", (ctx) => {
		ctx.track("start");
		return ctx.reply("hi");
	});

const env = createTestEnv(bot);
await env.createUser().sendCommand("start");
// store.events => [{ name: "start", userId: ..., timestamp: ..., ... }]
```

`memoryAdapter()` replaces hand-rolling a `{ track: (e) => events.push(e) }` fake for every test.

---

part of [**yaebal**](https://github.com/neverlane/yaebal) — a type-safe, runtime-agnostic Telegram Bot API framework. MIT.
