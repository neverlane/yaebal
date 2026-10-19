# @yaebal/sentry

sentry error tracking for yaebal bots. every update runs in its own isolation scope tagged with
the update type, chat and (opt-in) user; a failing handler is captured with that scope before
`bot.onError` sees it; and updates plus bot api calls leave breadcrumbs, so a report shows what
the bot was doing right before it broke.

you pass the sentry sdk you already use (`@sentry/node`, `@sentry/bun`, `@sentry/deno`,
`@sentry/cloudflare`, …) — the plugin reads it structurally, carries no sentry dependency of its
own and never fights your sdk version.

## install

```sh
pnpm add @yaebal/sentry @sentry/node
```

## usage

install it first, so its scope wraps every other plugin:

```ts
import * as Sentry from "@sentry/node";
import { Bot } from "@yaebal/core";
import { sentry } from "@yaebal/sentry";

Sentry.init({ dsn: process.env.SENTRY_DSN });

const bot = new Bot(process.env.BOT_TOKEN!).install(sentry({ sentry: Sentry, setUser: true }));

bot.command("pay", async (ctx) => {
	ctx.sentry.setTag("feature", "payments");
	try {
		await charge(ctx.from!.id);
	} catch (error) {
		ctx.sentry.captureException(error); // handled, but still worth a report
		await ctx.reply("payment failed, try again later");
	}
});
```

## what lands on ctx

| field | does |
| --- | --- |
| `ctx.sentry.scope` | this update's isolation scope |
| `ctx.sentry.captureException(error)` / `captureMessage(text)` | report with this update's scope |
| `ctx.sentry.setTag(key, value)` / `setExtra(key, value)` | annotate this update's scope |

## options

| option | default | does |
| --- | --- | --- |
| `sentry` | — | the initialized sentry sdk |
| `setUser` | `false` | attach the sender (`id`, `username`) as the sentry user — personal data, so opt-in |
| `breadcrumbs` | `true` | a breadcrumb per update and per bot api call (error-level for failures) |

## behavior

- a thrown error is captured, then rethrown — `bot.onError` still runs. `isReported(error)` tells
  a custom `onError` the error already reached sentry.
- tags: `telegram.update_type`, `telegram.chat_type`; context `telegram`: `update_id`, `chat_id`.
- the bot token never reaches sentry — breadcrumbs carry method names only.
- `instrumentApi(api, Sentry)` adds the api breadcrumbs to a bare `createApi` client.

---

part of [**yaebal**](https://github.com/neverlane/yaebal) — a type-safe, runtime-agnostic Telegram Bot API framework. MIT.
