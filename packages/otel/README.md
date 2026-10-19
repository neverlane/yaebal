# @yaebal/otel

opentelemetry tracing for yaebal bots. every update becomes a `CONSUMER` span and every bot api
call made while handling it a `CLIENT` child span — retries show up as one span per attempt — so a
slow handler, a flood wait or a failing method is one trace away in jaeger, grafana tempo,
honeycomb, axiom or any other otel backend. depends on `@opentelemetry/api` only: bring your own
sdk and exporter.

## install

```sh
pnpm add @yaebal/otel @opentelemetry/api
```

## usage

register an sdk (it installs the async context manager that links child spans to their update),
then install `otel()` first, so the update span wraps every other plugin:

```ts
import { NodeSDK } from "@opentelemetry/sdk-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { Bot } from "@yaebal/core";
import { otel } from "@yaebal/otel";

new NodeSDK({ serviceName: "my-bot", traceExporter: new OTLPTraceExporter() }).start();

const bot = new Bot(process.env.BOT_TOKEN!).install(otel());

bot.command("report", async (ctx) => {
	const rows = await ctx.otel.record("db.query", () => db.report()); // a child span
	ctx.otel.setAttributes({ "report.rows": rows.length });
	await ctx.send(render(rows));
});
```

a trace for one update looks like this:

```
telegram.update/message          CONSUMER  update_id, update_type, chat.id, chat.type, user.id
├── db.query                     INTERNAL  (ctx.otel.record)
└── telegram.api/sendMessage     CLIENT    method, chat.id, error_code on failure
```

## what lands on ctx

| field | does |
| --- | --- |
| `ctx.otel.span` | the update's span |
| `ctx.otel.record(name, fn)` | runs `fn` in a child span — ended for you, marked failed if it throws |
| `ctx.otel.setAttributes(attrs)` | adds attributes to the update span |

## options

| option | default | does |
| --- | --- | --- |
| `tracer` | `trace.getTracer("@yaebal/otel")` | the tracer to record with |
| `recordApiParams` | `false` | attach each call's params as `telegram.params` (json, uploads named, cut at 4096 chars) — off by default because params carry user text |
| `attributes` | — | `(ctx) => Attributes` added to every update span |

## behavior

- a handler that throws marks the update span `ERROR` with the exception recorded, then rethrows
  to `bot.onError` as usual. a failed api call does the same on its own span, plus
  `telegram.error_code`.
- the bot token never reaches a span — only method names and (opt-in) params.
- `instrumentApi(api, options)` traces a bare `createApi` client without a bot.
- without an async context manager (no sdk registered) api spans still record, as roots.

---

part of [**yaebal**](https://github.com/neverlane/yaebal) — a type-safe, runtime-agnostic Telegram Bot API framework. MIT.
