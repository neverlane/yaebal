# @yaebal/audit-log

structured logging for production monitoring: every incoming update and every outgoing api call is turned into an `AuditEvent` — correlated back to the update that triggered it, masked of known secrets by default — and handed to configurable sinks, with filters and sampling to keep volume under control.

## install

```sh
pnpm add @yaebal/audit-log
```

## usage

```ts
import { auditLog } from "@yaebal/audit-log";

bot.install(auditLog());
```

by default this logs every incoming update (via middleware) and every outgoing api call — its params, its result, and any error — as structured, redacted JSON printed to `console.log`. nothing on `ctx` changes; `auditLog()` is observation-only. with a real `Bot`, buffered sinks are flushed automatically on `bot.onStop()` — no extra wiring needed.

## behavior

six kinds of `AuditEvent`:

- `update` — an incoming update finished middleware processing: `updateId`, `correlationId`, `updateType`, `chatId`, `userId`, `durationMs`, and `error` if a handler threw (the error still propagates after logging).
- `api.call` — an outgoing call is about to be sent (`api.before`): `callId`, `method`, `params`, `attempt`.
- `api.result` — an outgoing call succeeded (`api.after`): `callId`, `method`, `params`, `result`, `durationMs`.
- `api.error` — an outgoing call threw (`api.onError`): `callId`, `method`, `params`, `error`, `attempt`, `durationMs`.
- `bot.start` / `bot.stop` — long-poll lifecycle, when the install target exposes `onStart`/`onStop` (a real `Bot`).

every event carries a `level` (`"info" | "warn" | "error"`), used by `chatSink` to decide what's worth paging on. `getUpdates` is excluded by default — it fires every poll tick and would otherwise dwarf every other event in the log.

a handler that throws still gets its `update` event logged — with `error` set to a plain, json-safe `SerializedError` (a bare `Error` stringifies to `"{}"`; this never does) — and the error still propagates. every pipeline stage (`filter`, `sample`, redaction, `formatter`, each sink's `write`/`flush`) is isolated: a stage that throws or rejects is reported via `onError` and drops just that one event, never the request it came from.

### correlation

every `api.*` event fired while an update is being handled carries that update's `updateId` and `correlationId` (plus `chatId`/`userId` when known) — filter a log by one `correlationId` to see the update and every api call it made, in order. built on `node:async_hooks`, wired automatically; degrades gracefully (never throws) on a runtime without `AsyncLocalStorage`. set `correlate: false` to turn it off. `api.call` also carries a `callId` stable across retries (e.g. via `@yaebal/again`) and an `attempt` number; `api.result`/`api.error` carry the call's total `durationMs`.

### security & redaction

**redacted by default.** before anything reaches a sink, every event is masked: known secret keys (`secret_token`, `token`, `phone_number`, `password`, …) are replaced wherever they occur, at any depth, in `update`/`params`/`result`; long strings are truncated (`maxStringLength`, default `2000`); media buffers become a `"[binary N bytes]"` placeholder instead of raw bytes in your logs. message text itself is *not* masked by default — audit logging needs it — but hiding it is one `redact.paths` entry away:

```ts
bot.install(
  auditLog({
    redact: {
      paths: ["update.message.text", "params.text"],
      maxStringLength: 500,
    },
  }),
);
```

`redact: false` turns masking off outright. an unknown/non-plain value (a class instance, a function, a stream) never crashes redaction — it degrades to a `"[object X]"` placeholder instead of throwing or attempting to clone something that might not tolerate it.

## options

```ts
auditLog({
  sinks: [consoleSink()], // default: a single consoleSink()
  formatter: jsonFormatter, // default; textFormatter is a human-readable alternative
  filter: (event) => event.kind !== "api.result",
  sample: (event) => (event.kind === "api.error" ? 1 : 0.1), // keep every error, sample the rest
  sampleKey: byChatId, // deterministic sampling — a chat's whole trace kept/dropped together
  redact: { paths: [], maxStringLength: 2000, stripBinary: true }, // secure by default
  onError: (error, event, stage) => console.error(`audit ${stage} failed`, error, event),
  logUpdates: true,
  logApiCalls: true,
  logApiResults: true,
  logApiErrors: true,
  logLifecycle: true,
  excludedMethods: ["getUpdates"], // trailing "*" matches by prefix, e.g. "send*"
  includeMethods: undefined, // if set, only these methods are logged
  correlate: true,
  autoFlush: true,
});
```

`sample` also accepts a flat number (`0`–`1`) applied to every event.

### sinks

a sink is `{ write(entry, event), flush?() }`. `entry` is whatever `formatter` returned; `event` is the *redacted* `AuditEvent`, for sinks that want structured fields directly (a db row, a metrics counter) regardless of formatting:

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

built in, beyond `consoleSink()`: `memorySink({ limit })` (a bounded ring buffer, handy for a `/status` endpoint or tests), `fileSink(path, { maxBytes })` (JSONL, size-based rotation, serialized writes) and `batchSink(inner, { size, intervalMs })` (a buffer-and-flush wrapper around another sink for a backend billed per call, not per row).

### telegram-native: chatSink & auditAdmin

`chatSink` ships events straight into an admin chat via the bot's own `sendMessage` — no separate log aggregator needed just to get paged. gated to `minLevel` (default: errors only), deduped by event signature, and rate-limited, so a failure storm sends one alert, not one per occurrence — and it never loops on its own traffic:

```ts
import { chatSink } from "@yaebal/audit-log";

bot.install(
  auditLog({ sinks: [consoleSink(), chatSink(bot, { chatId: ADMIN_CHAT_ID, minLevel: "error" })] }),
);
```

`auditAdmin` is a telegram-native ops surface for `auditLog()`'s running counters — no dashboard needed to ask "is the audit pipeline healthy" from a chat. isolated via `Composer.filter` (the same pattern `@yaebal/feature-flags`' `flagsAdmin` uses), not `guard`:

```ts
import { auditAdmin, auditLog } from "@yaebal/audit-log";

const audit = auditLog();
bot.install(audit);
bot.install(auditAdmin({ logger: audit, isAdmin: (ctx) => ctx.from?.id === OWNER_ID }));

// /audit        -> received/written/filtered/sampled counts + a per-stage error breakdown
// /audit flush  -> force audit.flush() now, and confirm
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
