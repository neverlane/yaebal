<script lang="ts">
	import Code from "$lib/Code.svelte";

	const install = `pnpm add @yaebal/mini-app`;

	const usage = `import { miniApp } from "@yaebal/mini-app";

bot.install(miniApp({ botToken: process.env.BOT_TOKEN! }));

bot.command("check", async (ctx) => {
  const initData = ctx.message?.text?.split(" ").slice(1).join(" ") ?? "";
  const result = await ctx.miniApp.validate(initData);

  await ctx.reply(result.ok ? \`hi \${result.data.user?.first_name}!\` : \`rejected: \${result.reason}\`);
});`;

	const maxAge = `await ctx.miniApp.validate(initData, { maxAge: 3600 }); // 1h
await ctx.miniApp.validate(initData, { maxAge: false }); // disable entirely — not recommended`;

	const standalone = `import { validateInitData } from "@yaebal/mini-app";

const result = await validateInitData(initData, process.env.BOT_TOKEN!, { maxAge: 3600 });`;

	const thirdParty = `import { validateInitDataThirdParty } from "@yaebal/mini-app";

// botId is the numeric part of a bot token (before the ":") — telegram signs \`\${botId}:WebAppData\\n…\`
const result = await validateInitDataThirdParty(initData, botId);

// bound to the plugin's botToken — derives botId for you
const boundResult = await ctx.miniApp.validateThirdParty(initData);`;

	const authHeader = `import { validateAuthHeader } from "@yaebal/mini-app";

// any fetch-based server (hono, elysia, next.js, sveltekit, a bare Request handler, …)
export default {
  async fetch(req: Request) {
    const result = await validateAuthHeader(req.headers.get("authorization"), process.env.BOT_TOKEN!);
    if (!result.ok) return new Response("unauthorized", { status: 401 });

    return new Response(\`hi \${result.data.user?.first_name}\`);
  },
};`;

	const parse = `import { parseInitData } from "@yaebal/mini-app";

const data = parseInitData(initData); // { user?, receiver?, chat?, chat_type?, start_param?, auth_date, hash?, signature?, ... }`;

	const sign = `import { signInitData, validateInitData } from "@yaebal/mini-app";

const initData = await signInitData({ user: { id: 1, first_name: "Linia" } }, BOT_TOKEN);
await validateInitData(initData, BOT_TOKEN); // { ok: true, data: { user: { id: 1, ... }, ... } }`;

	const answerQuery = `bot.command("share", async (ctx) => {
  await ctx.miniApp.answerQuery(queryId, {
    type: "article",
    id: "1",
    title: "shared from the mini app",
    input_message_content: { message_text: "check this out!" },
  });
});`;

	const webAppData = `import { parseWebAppData } from "@yaebal/mini-app";

bot.on("message:web_app_data", async (ctx) => {
  const payload = parseWebAppData<{ action: string }>(ctx.message.web_app_data.data);
  await ctx.reply(\`got: \${payload.action}\`);
});`;

	const urls = `import { webAppUrl, miniAppLink, attachMenuLink } from "@yaebal/mini-app";
import { InlineKeyboard } from "@yaebal/keyboard";

// { url } for a web_app keyboard button, with an extra query param for deep-linking inside the app
await ctx.reply("open the shop", {
  reply_markup: new InlineKeyboard().webApp(
    "open",
    webAppUrl("https://example.com/app", { params: { screen: "shop" } }),
  ),
});

// a shareable t.me direct link — round-trips as initData.start_param
miniAppLink({ botUsername: "yaebal_bot", appName: "shop", startParam: "ref_42" });
// "https://t.me/yaebal_bot/shop?startapp=ref_42"

// opens from the attachment menu instead — launchable from any chat, not just with the bot
attachMenuLink({ botUsername: "yaebal_bot", startParam: "ref_42" });
// "https://t.me/yaebal_bot?startattach=ref_42"`;

	const testing = `import { Composer, type Context } from "@yaebal/core";
import { createTestEnv } from "@yaebal/test";
import { miniApp } from "@yaebal/mini-app";

const bot = new Composer<Context>()
  .install(miniApp({ botToken: "test-token" }))
  .command("check", async (ctx) => ctx.reply(String((await ctx.miniApp.validate("hash=bad")).ok)));

const env = createTestEnv(bot);
await env.createUser().sendCommand("check"); // "false" — no valid hash`;
</script>

<svelte:head>
	<title>@yaebal/mini-app — yaebal</title>
</svelte:head>

<h1>@yaebal/mini-app</h1>
<p class="lead">
	the Telegram Mini Apps <strong>server</strong> protocol, no UI framework attached: HMAC
	(<code>ctx.miniApp.validate</code>) and Ed25519 third-party
	(<code>ctx.miniApp.validateThirdParty</code>) <code>initData</code> validation, a typed
	<code>initData</code> parser and test signer, an <code>Authorization: tma</code> header helper for
	your mini app's own backend, <code>answerWebAppQuery</code>, <code>web_app_data</code> helpers, and
	a <code>WebAppInfo</code>/direct-link url generator.
</p>

<h2>install</h2>
<Code code={install} title="terminal" lang="sh" />

<h2>validating initData (HMAC)</h2>
<p>
	your mini app's frontend sends <code>Telegram.WebApp.initData</code> to your backend (a bot
	command, or the mini app's own http endpoint) — validate it before trusting anything in it.
	<code>result.ok</code> narrows: on <code>true</code>, <code>result.data</code> is a typed
	<code>InitData</code> (<code>user</code>, <code>chat</code>, <code>start_param</code>,
	<code>auth_date</code> as a <code>Date</code>, …); on <code>false</code>,
	<code>result.reason</code> is one of <code>"missing_hash"</code> | <code>"bad_hash"</code> |
	<code>"missing_signature"</code> | <code>"bad_signature"</code> | <code>"expired"</code> |
	<code>"malformed"</code> — a hash that matched, but the data underneath wasn't structurally
	valid, is a rejection, never a thrown exception.
</p>
<Code code={usage} title="bot.ts" />

<p>
	<code>initData</code> has no built-in expiry, so <code>validate</code>/<code>validateInitData</code>
	default to rejecting anything older than <strong>24h</strong> (<code>maxAge: 86400</code>) —
	otherwise a leaked-but-genuinely-signed <code>initData</code> would stay valid forever (replay).
	Override per call, or set a plugin-wide default. <code>maxAge: 0</code> is a real (zero-tolerance)
	threshold, not a way to disable the check — pass <code>false</code> for that.
</p>
<Code code={maxAge} title="bot.ts" />

<p>
	outside a bot handler — most of the time, since <code>initData</code> arrives at your mini app's
	own backend, not a bot update — use the standalone <code>validateInitData</code>, independent of
	any bot or <code>ctx</code>.
</p>
<Code code={standalone} title="server.ts" />

<h2>validating without a bot token (Ed25519, third-party)</h2>
<p>
	since Bot API 7.2, <code>initData</code> also carries a <code>signature</code> — an Ed25519
	signature over the same fields, checkable against telegram's <em>public</em> key. no bot token
	needed, so any third party (an analytics service, a partner backend) can confirm a payload is
	genuine, not just the bot owner. <code>ctx.miniApp.validateThirdParty</code> derives
	<code>botId</code> from the plugin's <code>botToken</code> for you; pass <code>{"{ test: true }"}</code>
	(or set it as a plugin default) to validate against telegram's test-environment key instead of
	production. Both take the same <code>maxAge</code>/<code>now</code> options as
	<code>validate</code>, and return the same result shape. <code>isValid</code>/<code>isValidThirdParty</code>
	(and their standalone <code>isValidInitData</code>/<code>isValidInitDataThirdParty</code>
	counterparts) are boolean convenience wrappers for call sites that don't need the reason or the
	parsed data.
</p>
<Code code={thirdParty} title="server.ts" />

<h2>validating in your mini app's own http backend</h2>
<p>
	mini apps almost always send <code>initData</code> to their own server, not a bot update — the
	convention (matching telegram's docs and every major TMA library) is an
	<code>Authorization: tma &lt;initData&gt;</code> header. <code>validateAuthHeader</code> is
	framework-agnostic: pass whatever string your server gave you for the header.
	<code>initDataFromAuthHeader(header)</code> is the lower-level piece if you just want the raw
	<code>initData</code> string out.
</p>
<Code code={authHeader} title="server.ts" />

<h2>parsing without validating</h2>
<p>
	<code>parseInitData(initData)</code> parses the same fields without checking anything — only
	trust the result once <code>validate()</code>/<code>validateThirdParty()</code> has confirmed it
	(it's what they call internally). <code>hash</code> is typed optional: it's present on every
	<code>initData</code> telegram actually sends, but <code>validateInitDataThirdParty</code> never
	needs it, so parsing must not fail on a payload trimmed to just the third-party-relevant fields.
</p>
<Code code={parse} title="parse.ts" />

<h2>signing initData for tests</h2>
<p>
	<code>signInitData(fields, botToken)</code> builds a valid <code>initData</code> string the way
	telegram does — for tests and local development, so you're not hand-rolling telegram's HMAC
	signing scheme in every consumer's test suite. <code>auth_date</code> defaults to now;
	<code>ctx.miniApp.sign(fields)</code> is the bound form using the plugin's <code>botToken</code>.
</p>
<Code code={sign} title="mini-app.test.ts" />

<h2>answering a mini app query</h2>
<p>
	once the mini app calls <code>Telegram.WebApp.switchInlineQuery()</code>, telegram hands it a
	<code>query_id</code> (present in <code>initData.query_id</code>) — answer it with
	<a href="https://core.telegram.org/bots/api/#answerwebappquery"><code>answerWebAppQuery</code></a>
	to send a message on the user's behalf to the chat the query came from.
</p>
<Code code={answerQuery} title="bot.ts" />

<h2>web_app_data</h2>
<p>
	when a mini app calls <code>Telegram.WebApp.sendData()</code>, the bot receives it as
	<code>message.web_app_data</code> — already on <code>ctx.message</code>, no plugin needed to read
	it. <code>parseWebAppData</code> JSON-parses the payload. telegram warns this field is
	client-controlled — validate the shape of <code>T</code> as you would any other untrusted input.
</p>
<Code code={webAppData} title="bot.ts" />

<h2>building web app urls &amp; links</h2>
<p>
	<code>webAppUrl</code>/<code>webAppInfo</code> build the https url for a <code>web_app</code>
	keyboard button (validates <code>https</code>, merges extra query params for deep-linking a
	screen inside your mini app). <code>miniAppLink</code> builds a
	<a href="https://core.telegram.org/bots/webapps#direct-link-mini-apps">direct link</a> to share
	outside the bot — <code>botUsername</code>/<code>appName</code>/<code>startParam</code> are all
	validated against telegram's charsets, so a typo'd username fails at link-build time, not when a
	user taps a broken link. <code>attachMenuLink</code> builds a link that opens the mini app from the
	<a href="https://core.telegram.org/bots/webapps#adding-bots-to-the-attachment-menu">attachment
	menu</a> instead — launchable from any chat, not just a conversation with the bot. both round-trip
	<code>startParam</code> back as <code>initData.start_param</code> when the mini app opens.
</p>
<Code code={urls} title="links.ts" />

<h2>api</h2>
<table>
	<thead>
		<tr><th>export</th><th>signature</th><th>description</th></tr>
	</thead>
	<tbody>
		<tr>
			<td><code>miniApp</code></td>
			<td><code>(options: MiniAppOptions) =&gt; Plugin&lt;Context, {"{ miniApp: MiniAppControl }"}&gt;</code></td>
			<td>installs <code>ctx.miniApp</code></td>
		</tr>
		<tr>
			<td><code>validateInitData</code></td>
			<td><code>(initData, botToken, options?: ValidateInitDataOptions) =&gt; Promise&lt;InitDataValidationResult&gt;</code></td>
			<td>standalone HMAC hash + freshness check</td>
		</tr>
		<tr>
			<td><code>isValidInitData</code></td>
			<td><code>(initData, botToken, options?) =&gt; Promise&lt;boolean&gt;</code></td>
			<td>boolean convenience over <code>validateInitData</code></td>
		</tr>
		<tr>
			<td><code>validateInitDataThirdParty</code></td>
			<td><code>(initData, botId, options?: ValidateInitDataThirdPartyOptions) =&gt; Promise&lt;InitDataValidationResult&gt;</code></td>
			<td>standalone Ed25519 signature + freshness check, no bot token</td>
		</tr>
		<tr>
			<td><code>isValidInitDataThirdParty</code></td>
			<td><code>(initData, botId, options?) =&gt; Promise&lt;boolean&gt;</code></td>
			<td>boolean convenience</td>
		</tr>
		<tr>
			<td><code>parseInitData</code></td>
			<td><code>(initData: string) =&gt; InitData</code></td>
			<td>typed parse, no checks</td>
		</tr>
		<tr>
			<td><code>signInitData</code></td>
			<td><code>(fields: SignableInitDataFields, botToken: string) =&gt; Promise&lt;string&gt;</code></td>
			<td>sign fields into a valid <code>initData</code> string (tests/dev)</td>
		</tr>
		<tr>
			<td><code>getBotTokenSecretKey</code></td>
			<td><code>(botToken: string) =&gt; Promise&lt;Uint8Array&gt;</code></td>
			<td>the cached HMAC secret key <code>validateInitData</code> derives from a token</td>
		</tr>
		<tr>
			<td><code>initDataFromAuthHeader</code></td>
			<td><code>(header: string | null | undefined) =&gt; string | undefined</code></td>
			<td>extract <code>initData</code> from an <code>Authorization: tma …</code> header</td>
		</tr>
		<tr>
			<td><code>validateAuthHeader</code></td>
			<td><code>(header, botToken, options?: ValidateInitDataOptions) =&gt; Promise&lt;InitDataValidationResult&gt;</code></td>
			<td><code>validateInitData</code>, reading <code>initData</code> from the header</td>
		</tr>
		<tr>
			<td><code>parseWebAppData</code></td>
			<td><code>&lt;T = unknown&gt;(data: string) =&gt; T</code></td>
			<td>JSON-parse a <code>web_app_data.data</code> payload</td>
		</tr>
		<tr>
			<td><code>webAppUrl</code></td>
			<td><code>(baseUrl: string, options?: WebAppUrlOptions) =&gt; string</code></td>
			<td>validated (<code>https</code>-only) url, with merged query params</td>
		</tr>
		<tr>
			<td><code>webAppInfo</code></td>
			<td><code>(baseUrl: string, options?: WebAppUrlOptions) =&gt; WebAppInfo</code></td>
			<td><code>{"{ url: webAppUrl(baseUrl, options) }"}</code> for a <code>web_app</code> keyboard button</td>
		</tr>
		<tr>
			<td><code>miniAppLink</code></td>
			<td><code>(options: MiniAppLinkOptions) =&gt; string</code></td>
			<td><code>t.me</code> direct-link builder</td>
		</tr>
		<tr>
			<td><code>attachMenuLink</code></td>
			<td><code>(options: AttachMenuLinkOptions) =&gt; string</code></td>
			<td><code>t.me</code> attachment-menu link builder</td>
		</tr>
		<tr>
			<td><code>TELEGRAM_ED25519_PUBLIC_KEYS</code></td>
			<td><code>{"{ production: string; test: string }"}</code></td>
			<td>telegram's Ed25519 public keys (hex), for callers verifying signatures themselves</td>
		</tr>
	</tbody>
</table>

<h3>MiniAppControl interface (ctx.miniApp)</h3>
<table>
	<thead>
		<tr><th>method</th><th>returns</th><th>description</th></tr>
	</thead>
	<tbody>
		<tr><td><code>validate(initData, options?)</code></td><td><code>Promise&lt;InitDataValidationResult&gt;</code></td><td>HMAC hash + freshness check against the installed bot token</td></tr>
		<tr><td><code>isValid(initData, options?)</code></td><td><code>Promise&lt;boolean&gt;</code></td><td>boolean convenience over <code>validate</code></td></tr>
		<tr><td><code>validateThirdParty(initData, options?)</code></td><td><code>Promise&lt;InitDataValidationResult&gt;</code></td><td>Ed25519 signature check, <code>botId</code> derived from the bot token</td></tr>
		<tr><td><code>isValidThirdParty(initData, options?)</code></td><td><code>Promise&lt;boolean&gt;</code></td><td>boolean convenience over <code>validateThirdParty</code></td></tr>
		<tr><td><code>parse(initData)</code></td><td><code>InitData</code></td><td>parse without checking anything</td></tr>
		<tr><td><code>sign(fields)</code></td><td><code>Promise&lt;string&gt;</code></td><td>sign fields into a valid <code>initData</code> string (tests/dev)</td></tr>
		<tr><td><code>answerQuery(webAppQueryId, result)</code></td><td><code>Promise&lt;SentWebAppMessage&gt;</code></td><td>wraps <code>answerWebAppQuery</code></td></tr>
	</tbody>
</table>

<h2>testing</h2>
<p>
	drive <code>ctx.miniApp</code> with <a href="/docs/plugins/test/"><code>@yaebal/test</code></a> as
	usual — use <code>ctx.miniApp.sign(fields)</code> (or the standalone <code>signInitData</code>) to
	build valid <code>initData</code> for your own fixtures instead of hand-rolling telegram's HMAC
	scheme.
</p>
<Code code={testing} title="mini-app.test.ts" />

<div class="note">
	<strong>runs everywhere.</strong> hashing and signature verification go through
	<code>crypto.subtle</code> (HMAC-SHA256 and Ed25519), not <code>node:crypto</code>, so every
	<code>validate*</code>/<code>ctx.miniApp.*</code> call works the same on node, bun, deno, and edge
	runtimes.
</div>

<div class="note">
	<strong>upgrading from 0.0.x?</strong> 0.0.x computed the HMAC hash over every field except
	<code>hash</code> — but telegram's spec excludes <code>hash</code> <em>and</em>
	<code>signature</code>. Since Bot API 7.2, real <code>initData</code> always carries a
	<code>signature</code>, so 0.0.x rejected every genuine payload from a current telegram client as
	<code>bad_hash</code>. <code>validate</code>/<code>validateInitData</code> also now default to a
	24h <code>maxAge</code> instead of never expiring. See the
	<a href="https://github.com/neverlane/yaebal/tree/master/packages/mini-app">package README</a>
	for the full list.
</div>
