# @yaebal/audit-log

structured logging for production monitoring: every incoming update and every outgoing api call is turned into an `AuditEvent` and handed to configurable sinks, with filters and sampling to keep volume under control.

## install

```sh
pnpm add @yaebal/audit-log
```

## usage

```ts
import { auditLog } from "@yaebal/audit-log";

const plugin = auditLog();
bot.install(plugin);
bot.onStop(() => plugin.flush());
```

by default this logs every incoming update (via middleware) and every outgoing api call — its params, its result, and any error — as structured JSON printed to `console.log`. nothing on `ctx` changes; `auditLog()` is observation-only.

## behavior

four kinds of `AuditEvent`:

- `update` — an incoming update finished middleware processing: `updateType`, `chatId`, `userId`, `durationMs`, and `error` if a handler threw (the error still propagates after logging).
- `api.call` — an outgoing call is about to be sent (`api.before`): `method`, `params`.
- `api.result` — an outgoing call succeeded (`api.after`): `method`, `params`, `result`.
- `api.error` — an outgoing call threw (`api.onError`): `method`, `params`, `error`, `attempt`.

`getUpdates` is excluded by default — it fires every poll tick and would otherwise dwarf every other event in the log.

a sink throwing or rejecting never breaks request handling; observe failures via `onSinkError`.

## options

```ts
auditLog({
	sinks: [consoleSink()], // default: a single consoleSink()
	formatter: jsonFormatter, // default; textFormatter is a human-readable alternative
	filter: (event) => event.kind !== "api.result",
	sample: (event) => (event.kind === "api.error" ? 1 : 0.1), // keep every error, sample the rest
	logUpdates: true,
	logApiCalls: true,
	logApiResults: true,
	logApiErrors: true,
	excludedMethods: ["getUpdates"],
	onSinkError: (error, event) => console.error("audit sink failed", error, event),
});
```

`sample` also accepts a flat number (`0`–`1`) applied to every event.

### sinks

a sink is `{ write(entry, event), flush?() }`. `entry` is whatever `formatter` returned; `event` is the raw `AuditEvent`, for sinks that want structured fields directly (a db row, a metrics counter) regardless of formatting:

```ts
import type { AuditSink } from "@yaebal/audit-log";

function sqliteSink(db: SqliteLike): AuditSink {
	const insert = db.prepare("INSERT INTO audit_log (kind, method, at) VALUES (?, ?, ?)");
	return {
		write(_entry, event) {
			insert.run(event.kind, "method" in event ? event.method : event.updateType, event.timestamp);
		},
	};
}

bot.install(auditLog({ sinks: [sqliteSink(db), consoleSink()] }));
```

### direct install

skip `.install()` and wire hooks straight onto a `{ use, api }` pair:

```ts
auditLog(bot, { sinks: [consoleSink()] });
```

## testing

```ts
import { createTestEnv } from "@yaebal/test";
import { auditLog } from "@yaebal/audit-log";

const env = createTestEnv(bot);
// createTestEnv routes outgoing calls through env.api, not bot.api — hook onto that:
auditLog({ use: (...mw) => bot.use(...mw), api: env.api }, { sinks: [mySink] });
```

---

part of [**yaebal**](https://github.com/neverlane/yaebal) - a type-safe, runtime-agnostic Telegram Bot API framework. MIT.
