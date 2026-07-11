# @yaebal/mini-app

the Telegram Mini Apps protocol, no UI framework attached: `ctx.miniApp.validate(initData)` (checks
`initData`'s `hash` against the bot token), a typed `initData` parser, `web_app_data` helpers,
and a `WebAppInfo`/direct-link url generator.

## install

```sh
pnpm add @yaebal/mini-app
```

## usage

your mini app's frontend sends `Telegram.WebApp.initData` to your backend (a bot command, or the
mini app's own http endpoint) — validate it before trusting anything in it:

```ts
import { miniApp } from "@yaebal/mini-app";

bot.install(miniApp({ botToken: process.env.BOT_TOKEN! }));

bot.command("check", async (ctx) => {
	const initData = ctx.message?.text?.split(" ").slice(1).join(" ") ?? "";
	const result = await ctx.miniApp.validate(initData);

	await ctx.reply(result.ok ? `hi ${result.data.user?.first_name}!` : `rejected: ${result.reason}`);
});
```

`result.ok` narrows: on `true`, `result.data` is a typed `InitData` (`user`, `chat`, `start_param`,
`auth_date` as a `Date`, …); on `false`, `result.reason` is `"missing_hash"` | `"bad_hash"` |
`"expired"`.

## validating outside a bot handler

most of the time you're validating `initData` in your mini app's own backend (an http endpoint,
not a bot update) — use the standalone `validateInitData`, independent of any bot or `ctx`:

```ts
import { validateInitData } from "@yaebal/mini-app";

const result = await validateInitData(initData, process.env.BOT_TOKEN!, { maxAge: 3600 });
```

`maxAge` (seconds) rejects stale `initData` by comparing `auth_date` against `now` (defaults to
`new Date()`) — recommended, since `initData` has no built-in expiry.

## parsing without validating

`parseInitData(initData)` parses the same fields without checking the hash — only trust the
result once `validate()`/`validateInitData()` has confirmed it (it's what they call internally):

```ts
import { parseInitData } from "@yaebal/mini-app";

const data = parseInitData(initData); // { user?, receiver?, chat?, chat_type?, start_param?, auth_date, hash, ... }
```

## web_app_data

when a mini app calls `Telegram.WebApp.sendData()`, the bot receives it as
`message.web_app_data` (already on `ctx.message` — no plugin needed to read it). `parseWebAppData`
JSON-parses the payload:

```ts
import { parseWebAppData } from "@yaebal/mini-app";

bot.on("message:web_app_data", async (ctx) => {
	const payload = parseWebAppData<{ action: string }>(ctx.message.web_app_data.data);
	await ctx.reply(`got: ${payload.action}`);
});
```

telegram warns this field is client-controlled — validate the shape of `T` as you would any other
untrusted input.

## building web app urls & links

`webAppInfo`/`webAppUrl` build the `{ url }` used by `web_app` keyboard buttons (validates
`https`, merges extra query params for deep-linking a screen inside your mini app):

```ts
import { webAppUrl } from "@yaebal/mini-app";
import { InlineKeyboard } from "@yaebal/keyboard";

await ctx.reply("open the shop", {
	reply_markup: new InlineKeyboard().webApp(
		"open",
		webAppUrl("https://example.com/app", { params: { screen: "shop" } }),
	),
});
```

(`webAppInfo` builds the same thing as a `{ url }` object, for apis that want a `WebAppInfo`
directly — e.g. `bot.api.setChatMenuButton`.)

`miniAppLink` builds a
[direct link](https://core.telegram.org/bots/webapps#direct-link-mini-apps) to share outside the
bot (`t.me/<bot>/<appName>?startapp=...`, or `t.me/<bot>?startapp=...` for the bot's main mini
app when `appName` is omitted). `startParam` is validated against telegram's charset (0-64 chars,
`[A-Za-z0-9_-]`) and comes back as `initData.start_param` when the mini app opens:

```ts
import { miniAppLink } from "@yaebal/mini-app";

miniAppLink({ botUsername: "yaebal_bot", appName: "shop", startParam: "ref_42" });
// "https://t.me/yaebal_bot/shop?startapp=ref_42"
```

## api

- `miniApp(options)` — installs `ctx.miniApp` (`validate`, `parse`) on the bot.
- `validateInitData(initData, botToken, options?)` — standalone hash + freshness check.
- `parseInitData(initData)` — typed parse, no hash check.
- `parseWebAppData<T>(data)` — JSON-parse a `web_app_data.data` payload.
- `webAppUrl(baseUrl, options?)` / `webAppInfo(baseUrl, options?)` — https url / `WebAppInfo`
  builder for `web_app` keyboard buttons.
- `miniAppLink(options)` — `t.me` direct link builder.

## testing

```ts
import { Composer, type Context } from "@yaebal/core";
import { createTestEnv } from "@yaebal/test";
import { miniApp } from "@yaebal/mini-app";

const bot = new Composer<Context>()
	.install(miniApp({ botToken: "test-token" }))
	.command("check", async (ctx) => ctx.reply(String((await ctx.miniApp.validate("hash=bad")).ok)));

const env = createTestEnv(bot);
await env.createUser().sendCommand("check"); // "false" — no valid hash
```

---

part of [**yaebal**](https://github.com/neverlane/yaebal) — a type-safe, runtime-agnostic Telegram Bot API framework. MIT.
