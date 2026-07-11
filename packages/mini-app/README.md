# @yaebal/mini-app

the Telegram Mini Apps **server** protocol, no UI framework attached: HMAC (`ctx.miniApp.validate`)
and Ed25519 third-party (`ctx.miniApp.validateThirdParty`) `initData` validation, a typed `initData`
parser and test signer, an `Authorization: tma` header helper for your mini app's own backend,
`answerWebAppQuery`, `web_app_data` helpers, and a `WebAppInfo`/direct-link url generator.

## install

```sh
pnpm add @yaebal/mini-app
```

## validating initData (HMAC)

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
`auth_date` as a `Date`, …); on `false`, `result.reason` is one of `"missing_hash"` | `"bad_hash"` |
`"missing_signature"` | `"bad_signature"` | `"expired"` | `"malformed"` (a hash that matched, but the
data underneath wasn't structurally valid — treated as a rejection, never a thrown exception).

**`initData` has no built-in expiry**, so `validate`/`validateInitData` default to rejecting
anything older than **24h** (`maxAge: 86400`) — otherwise a leaked-but-genuinely-signed `initData`
would stay valid forever (replay). Override per call, or set a default for the whole plugin:

```ts
await ctx.miniApp.validate(initData, { maxAge: 3600 }); // 1h
await ctx.miniApp.validate(initData, { maxAge: false }); // disable entirely — not recommended
```

`maxAge: 0` is a real (zero-tolerance) threshold, not a way to disable the check — pass `false` for that.

outside a bot handler (most of the time — you're validating in your mini app's own backend, not a
bot update), use the standalone `validateInitData`, independent of any bot or `ctx`:

```ts
import { validateInitData } from "@yaebal/mini-app";

const result = await validateInitData(initData, process.env.BOT_TOKEN!, { maxAge: 3600 });
```

## validating initData without a bot token (Ed25519, third-party)

since Bot API 7.2, `initData` also carries a `signature` — an Ed25519 signature over the same
fields, checkable against telegram's *public* key. no bot token needed, so any third party (an
analytics service, a partner backend) can confirm a payload is genuine, not just the bot owner:

```ts
import { validateInitDataThirdParty } from "@yaebal/mini-app";

// botId is the numeric part of a bot token (before the `:`) — telegram signs `${botId}:WebAppData\n…`
const result = await validateInitDataThirdParty(initData, botId);
```

`ctx.miniApp.validateThirdParty(initData)` is the bound form — it derives `botId` from the plugin's
`botToken` for you, so you don't have to split it out yourself. Pass `{ test: true }` (or set it as
a plugin default) to validate against telegram's test-environment key instead of production —
useful when your mini app runs against a test bot. Both take the same `maxAge`/`now` options as
`validate`, and return the same `InitDataValidationResult`.

```ts
bot.install(miniApp({ botToken: process.env.BOT_TOKEN!, test: true }));
await ctx.miniApp.validateThirdParty(initData); // checked against the test key by default now
```

`isValid(initData, options?)` / `isValidThirdParty(initData, options?)` — and their standalone
`isValidInitData` / `isValidInitDataThirdParty` counterparts — are boolean convenience wrappers for
call sites that don't need the reason or the parsed data.

## validating in your mini app's own http backend

mini apps almost always send `initData` to their own server, not a bot update — the convention
(matching telegram's docs and every major TMA library) is an `Authorization: tma <initData>` header:

```ts
import { validateAuthHeader } from "@yaebal/mini-app";

// any fetch-based server (hono, elysia, next.js, sveltekit, a bare Request handler, …)
export default {
	async fetch(req: Request) {
		const result = await validateAuthHeader(req.headers.get("authorization"), process.env.BOT_TOKEN!);
		if (!result.ok) return new Response("unauthorized", { status: 401 });

		return new Response(`hi ${result.data.user?.first_name}`);
	},
};
```

```ts
// express / any (req, res) framework
app.use((req, res, next) => {
	validateAuthHeader(req.headers.authorization, process.env.BOT_TOKEN!).then((result) => {
		if (!result.ok) return res.status(401).end();
		req.miniAppUser = result.data.user;
		next();
	});
});
```

`initDataFromAuthHeader(header)` is the lower-level piece if you just want the raw `initData`
string out of the header (e.g. to pass into `validateInitDataThirdParty` yourself) — both are
framework-agnostic: pass whatever string your server gave you for the header.

## parsing without validating

`parseInitData(initData)` parses the same fields without checking anything — only trust the
result once `validate()`/`validateThirdParty()` has confirmed it (it's what they call internally).
`hash` is typed optional: it's present on every `initData` telegram actually sends, but
`validateInitDataThirdParty` never needs it, so parsing must not fail on a payload trimmed to just
the third-party-relevant fields.

```ts
import { parseInitData } from "@yaebal/mini-app";

const data = parseInitData(initData); // { user?, receiver?, chat?, chat_type?, start_param?, auth_date, hash?, signature?, ... }
```

## signing initData for tests

`signInitData(fields, botToken)` builds a valid `initData` string the way telegram does — for
tests and local development, so you're not hand-rolling telegram's HMAC signing scheme in every
consumer's test suite:

```ts
import { signInitData, validateInitData } from "@yaebal/mini-app";

const initData = await signInitData({ user: { id: 1, first_name: "Linia" } }, BOT_TOKEN);
await validateInitData(initData, BOT_TOKEN); // { ok: true, data: { user: { id: 1, ... }, ... } }
```

`auth_date` defaults to now; `ctx.miniApp.sign(fields)` is the bound form using the plugin's
`botToken`.

## answering a mini app query

once the mini app calls `Telegram.WebApp.switchInlineQuery()`, telegram hands it a `query_id`
(present in `initData.query_id`) — answer it with
[`answerWebAppQuery`](https://core.telegram.org/bots/api/#answerwebappquery) to send a message on
the user's behalf to the chat the query came from:

```ts
bot.command("share", async (ctx) => {
	await ctx.miniApp.answerQuery(queryId, {
		type: "article",
		id: "1",
		title: "shared from the mini app",
		input_message_content: { message_text: "check this out!" },
	});
});
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
bot (`t.me/<bot>/<appName>?startapp=...`, or `t.me/<bot>?startapp=...` for the bot's main mini app
when `appName` is omitted). `botUsername`/`appName`/`startParam` are all validated against
telegram's charsets — a typo'd username fails at link-build time, not when a user taps a broken link:

```ts
import { miniAppLink } from "@yaebal/mini-app";

miniAppLink({ botUsername: "yaebal_bot", appName: "shop", startParam: "ref_42" });
// "https://t.me/yaebal_bot/shop?startapp=ref_42"
```

`attachMenuLink` builds a direct link that opens the mini app from the
[attachment menu](https://core.telegram.org/bots/webapps#adding-bots-to-the-attachment-menu)
instead — launchable from *any* chat, not just a conversation with the bot:

```ts
import { attachMenuLink } from "@yaebal/mini-app";

attachMenuLink({ botUsername: "yaebal_bot", startParam: "ref_42" });
// "https://t.me/yaebal_bot?startattach=ref_42"
```

both round-trip their `startParam` back as `initData.start_param` when the mini app opens.

## api

- `miniApp(options)` — installs `ctx.miniApp` on the bot: `validate`, `isValid`, `validateThirdParty`,
  `isValidThirdParty`, `parse`, `sign`, `answerQuery`.
- `validateInitData(initData, botToken, options?)` — standalone HMAC hash + freshness check.
- `isValidInitData(initData, botToken, options?)` — boolean convenience over `validateInitData`.
- `validateInitDataThirdParty(initData, botId, options?)` — standalone Ed25519 signature +
  freshness check, no bot token.
- `isValidInitDataThirdParty(initData, botId, options?)` — boolean convenience.
- `parseInitData(initData)` — typed parse, no checks.
- `signInitData(fields, botToken)` — sign fields into a valid `initData` string (tests/dev).
- `getBotTokenSecretKey(botToken)` — the cached HMAC secret key `validateInitData` derives from a
  token, exposed for callers building their own signing/validation on top.
- `initDataFromAuthHeader(header)` / `validateAuthHeader(header, botToken, options?)` — read/validate
  `initData` from an `Authorization: tma <initData>` header.
- `parseWebAppData<T>(data)` — JSON-parse a `web_app_data.data` payload.
- `webAppUrl(baseUrl, options?)` / `webAppInfo(baseUrl, options?)` — https url / `WebAppInfo`
  builder for `web_app` keyboard buttons.
- `miniAppLink(options)` — `t.me` direct link builder.
- `attachMenuLink(options)` — `t.me` attachment-menu link builder.
- `TELEGRAM_ED25519_PUBLIC_KEYS` — telegram's `production`/`test` Ed25519 public keys (hex), for
  callers who verify signatures themselves instead of going through `validateInitDataThirdParty`.

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

use `ctx.miniApp.sign(fields)` (or the standalone `signInitData`) to build valid `initData` for
your own fixtures instead of hand-rolling telegram's HMAC scheme — see [signing initData for
tests](#signing-initdata-for-tests) above.

## breaking changes from 0.0.x

- **fixed:** 0.0.x computed the HMAC hash over every field *except* `hash` — but telegram's spec
  excludes `hash` **and** `signature`. Since Bot API 7.2, real `initData` always carries a
  `signature`, so 0.0.x rejected every genuine payload from a current telegram client as
  `bad_hash`. If you're on 0.0.x, this alone is worth upgrading for.
- `validateInitData`'s default behavior changed: it now rejects `initData` older than 24h by
  default (`maxAge: 86400`), where 0.0.x never checked freshness unless you passed `maxAge`
  yourself. Pass `{ maxAge: false }` to keep the old (not recommended) behavior.
- `InitData.hash` is now typed `string | undefined` (see [parsing without
  validating](#parsing-without-validating)).

---

part of [**yaebal**](https://github.com/neverlane/yaebal) — a type-safe, runtime-agnostic Telegram Bot API framework. MIT.
