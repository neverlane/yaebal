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

	const standalone = `import { validateInitData } from "@yaebal/mini-app";

const result = await validateInitData(initData, process.env.BOT_TOKEN!, { maxAge: 3600 });`;

	const parse = `import { parseInitData } from "@yaebal/mini-app";

const data = parseInitData(initData); // { user?, receiver?, chat?, chat_type?, start_param?, auth_date, hash, ... }`;

	const webAppData = `import { parseWebAppData } from "@yaebal/mini-app";

bot.on("message:web_app_data", async (ctx) => {
  const payload = parseWebAppData<{ action: string }>(ctx.message.web_app_data.data);
  await ctx.reply(\`got: \${payload.action}\`);
});`;

	const urls = `import { webAppUrl, miniAppLink } from "@yaebal/mini-app";
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
// "https://t.me/yaebal_bot/shop?startapp=ref_42"`;

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
	the Telegram Mini Apps protocol, no UI framework attached: <code>ctx.miniApp.validate(initData)</code>
	checks <code>initData</code>'s <code>hash</code> against your bot token, plus a typed
	<code>initData</code> parser, <code>web_app_data</code> helpers, and a
	<code>WebAppInfo</code>/direct-link url generator. reach for it whenever a mini app's frontend
	hands data back to your bot — validating <code>initData</code>, or reading a
	<code>Telegram.WebApp.sendData()</code> payload.
</p>

<h2>install</h2>
<Code code={install} title="terminal" lang="sh" />

<h2>usage</h2>
<p>
	your mini app's frontend sends <code>Telegram.WebApp.initData</code> to your backend — validate
	it before trusting anything in it. <code>result.ok</code> narrows: on <code>true</code>,
	<code>result.data</code> is a typed <code>InitData</code> (<code>user</code>, <code>chat</code>,
	<code>start_param</code>, <code>auth_date</code> as a <code>Date</code>, …); on <code>false</code>,
	<code>result.reason</code> is <code>"missing_hash"</code> | <code>"bad_hash"</code> |
	<code>"expired"</code>.
</p>
<Code code={usage} title="bot.ts" />

<h2>validating outside a bot handler</h2>
<p>
	most of the time <code>initData</code> arrives at your mini app's own backend (an http endpoint,
	not a bot update) — <code>validateInitData</code> is standalone, independent of any bot or
	<code>ctx</code>. <code>maxAge</code> (seconds) rejects stale <code>initData</code> by comparing
	<code>auth_date</code> against <code>now</code> (defaults to <code>new Date()</code>) — recommended,
	since <code>initData</code> has no built-in expiry.
</p>
<Code code={standalone} title="server.ts" />

<h2>parsing without validating</h2>
<p>
	<code>parseInitData(initData)</code> parses the same fields without checking the hash — it's what
	<code>validate()</code>/<code>validateInitData()</code> call internally, so only trust the result
	once one of those has confirmed it.
</p>
<Code code={parse} title="parse.ts" />

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
	outside the bot — <code>startParam</code> is validated against telegram's charset (0-64 chars,
	<code>[A-Za-z0-9_-]</code>) and comes back as <code>initData.start_param</code> when the mini app
	opens.
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
			<td>installs <code>ctx.miniApp</code> (<code>validate</code>, <code>parse</code>)</td>
		</tr>
		<tr>
			<td><code>validateInitData</code></td>
			<td><code>(initData, botToken, options?: ValidateInitDataOptions) =&gt; Promise&lt;InitDataValidationResult&gt;</code></td>
			<td>standalone hash + freshness check</td>
		</tr>
		<tr>
			<td><code>parseInitData</code></td>
			<td><code>(initData: string) =&gt; InitData</code></td>
			<td>typed parse, no hash check</td>
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
	</tbody>
</table>

<h3>MiniAppControl interface (ctx.miniApp)</h3>
<table>
	<thead>
		<tr><th>method</th><th>returns</th><th>description</th></tr>
	</thead>
	<tbody>
		<tr><td><code>validate(initData, options?)</code></td><td><code>Promise&lt;InitDataValidationResult&gt;</code></td><td>hash + optional freshness check against the installed bot token</td></tr>
		<tr><td><code>parse(initData)</code></td><td><code>InitData</code></td><td>parse without checking the hash</td></tr>
	</tbody>
</table>

<h2>testing</h2>
<p>
	drive <code>ctx.miniApp</code> with <a href="/docs/plugins/test/"><code>@yaebal/test</code></a>
	as usual — for a real hash to test against, sign a payload the same way telegram does
	(<code>HMAC_SHA256(HMAC_SHA256("WebAppData", bot_token), data_check_string)</code>) with
	<code>node:crypto</code> in the test file itself.
</p>
<Code code={testing} title="mini-app.test.ts" />

<div class="note">
	<strong>runs everywhere.</strong> hashing goes through <code>crypto.subtle</code>, not
	<code>node:crypto</code>, so <code>validateInitData</code>/<code>ctx.miniApp.validate</code> work
	the same on node, bun, deno, and edge runtimes.
</div>
