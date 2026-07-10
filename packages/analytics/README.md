# @yaebal/analytics

event tracking and funnels, straight from middleware: `ctx.track("event", { key: value })` fans
out to whatever sinks you configure — posthog, plausible, your own sqlite/clickhouse table, or a
console log for local dev. downstream tools (posthog funnels, plausible funnels, your own sql)
turn the event stream into funnels; this package's job is just consistent, typed emission.

## install

```sh
pnpm add @yaebal/analytics
```

## usage

```ts
import { Bot } from "@yaebal/core";
import { analytics, consoleAdapter } from "@yaebal/analytics";

const bot = new Bot(process.env.BOT_TOKEN!).install(
	analytics({ adapters: [consoleAdapter()] }),
);

bot.on("message:text", (ctx) => {
	ctx.track("message_received", { length: ctx.message.text.length });
	return ctx.reply("thanks!");
});
```

`.install(analytics(...))` adds `ctx.track(name, properties?)` — every call resolves `userId`
and `chatId` from the current `ctx` before handing the event to your adapters.

## adapters

adapters take an already-constructed client and type it structurally, so this package depends on
nothing and never dictates a driver version.

```ts
import { clickhouseAdapter, plausibleAdapter, postHogAdapter, sqliteAdapter } from "@yaebal/analytics";
import { PostHog } from "posthog-node";
import { DatabaseSync } from "node:sqlite";

analytics({
	adapters: [
		postHogAdapter(new PostHog(process.env.POSTHOG_KEY!)),
		plausibleAdapter({ domain: "mybot.example" }),
		sqliteAdapter(new DatabaseSync("analytics.db")),
		clickhouseAdapter(clickhouseClient, { batchSize: 50 }),
	],
	onError: (error, event) => console.error("analytics failed", event.name, error),
});
```

- `postHogAdapter(client, options?)` — `client` is anything shaped like `posthog-node`'s `PostHog`
  (structural `capture()` + optional `flush()`).
- `plausibleAdapter(options)` — posts straight to plausible's events api, no client library.
- `sqliteAdapter(db, options?)` — `db` is `node:sqlite`'s `DatabaseSync`, `better-sqlite3`, or
  anything with `exec`/`prepare`. creates its table on first use.
- `clickhouseAdapter(client, options?)` — `client` is anything shaped like `@clickhouse/client`
  (structural `insert()`). buffers events and batch-inserts; `flush()` drains a partial batch.
- `consoleAdapter()` — zero-config sink for local development.

adapter failures never break tracking: `track()` is fire-and-forget, and a rejected/throwing
adapter is routed to `onError` instead of interrupting the update.

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

## options

```ts
analytics({
	adapters: [...],
	onError: (error, event) => metrics.count("analytics_error", event.name),
	now: () => Date.now(), // clock override, mainly for tests
});
```

buffered adapters (like `clickhouseAdapter`) need a flush before shutdown so the last partial
batch isn't lost. `analytics()` returns the plugin function with a `.flush()` attached — wire it
to `bot.onStop`, same as `@yaebal/media-group`'s album flush:

```ts
const events = analytics({ adapters: [clickhouseAdapter(client)] });
bot.install(events);
bot.onStop(() => events.flush());
```

## testing

```ts
import { createTestEnv } from "@yaebal/test";
import { analytics, type AnalyticsAdapter } from "@yaebal/analytics";

const tracked: string[] = [];
const fake: AnalyticsAdapter = { track: (event) => void tracked.push(event.name) };

const bot = new Composer<Context>()
	.install(analytics({ adapters: [fake] }))
	.command("start", (ctx) => {
		ctx.track("start");
		return ctx.reply("hi");
	});

const env = createTestEnv(bot);
await env.createUser().sendCommand("start");
// tracked => ["start"]
```

---

part of [**yaebal**](https://github.com/neverlane/yaebal) — a type-safe, runtime-agnostic Telegram Bot API framework. MIT.
