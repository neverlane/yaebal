<script lang="ts">
	import Code from "$lib/Code.svelte";

	const button = `import { createBot, InlineKeyboard } from "yaebal";
import { webAppUrl } from "@yaebal/mini-app";

const bot = createBot(process.env.BOT_TOKEN!);

bot.command("app", (ctx) =>
  ctx.reply("open the app", {
    reply_markup: new InlineKeyboard().webApp("open", webAppUrl("https://app.example.com")),
  }),
);`;

	const validateInHandler = `import { createBot } from "yaebal";
import { miniApp } from "@yaebal/mini-app";

const bot = createBot(process.env.BOT_TOKEN!).install(miniApp({ botToken: process.env.BOT_TOKEN! }));

bot.command("check", async (ctx) => {
  const initData = ctx.message?.text?.split(" ").slice(1).join(" ") ?? "";
  const result = await ctx.miniApp.validate(initData);
  if (!result.ok) return ctx.reply("rejected: " + result.reason);

  await ctx.reply("hi " + result.data.user?.first_name + "!");
});`;

	const validateInBackend = `// your mini app's own http backend — not a bot update
import { validateAuthHeader } from "@yaebal/mini-app";

export default {
  async fetch(req: Request) {
    const result = await validateAuthHeader(req.headers.get("authorization"), process.env.BOT_TOKEN!);
    if (!result.ok) return new Response("unauthorized", { status: 401 });

    return new Response("hi " + result.data.user?.first_name);
  },
};`;

	const data = `import { createBot } from "yaebal";

const bot = createBot(process.env.BOT_TOKEN!);

bot.on("message:web_app_data", async (ctx) => {
  await ctx.reply("mini app sent: " + ctx.message.web_app_data.data);
});`;
</script>

<svelte:head>
	<title>mini apps — yaebal</title>
</svelte:head>

<h1>mini apps</h1>
<p class="lead">
	connect telegram mini apps to a yaebal bot through web app buttons,
	<a href="/docs/plugins/mini-app/"><code>@yaebal/mini-app</code></a>'s <code>initData</code>
	validation, and bot api callbacks.
</p>

<h2>open a mini app</h2>
<p>
	inline keyboards can open a web app url inside telegram. <code>webAppUrl</code> validates
	<code>https</code> (required in production) and merges deep-linking query params.
</p>
<Code code={button} title="button.ts" />

<h2>validate initData before trusting it</h2>
<p>
	whether the mini app hands data back through a bot command or its own http backend, validate
	<code>initData</code> first — never trust <code>user</code>/<code>chat</code>/<code>start_param</code>
	before a <code>validate*</code> call has confirmed the signature. see
	<a href="/docs/plugins/mini-app/"><code>@yaebal/mini-app</code></a> for the full HMAC/Ed25519/
	<code>Authorization</code>-header surface.
</p>
<Code code={validateInHandler} title="bot.ts" />
<p>most mini apps talk to their own web backend instead, via the <code>Authorization: tma</code> header convention:</p>
<Code code={validateInBackend} title="server.ts" />

<h2>web app data messages</h2>
<p>
	if the mini app calls <code>Telegram.WebApp.sendData()</code>, it arrives as
	<code>message.web_app_data</code> — client-controlled, so validate its shape like any other
	untrusted input (<code>parseWebAppData</code> in <code>@yaebal/mini-app</code> JSON-parses it for you).
</p>
<Code code={data} title="web-app-data.ts" />

<h2>security checklist</h2>
<ul>
	<li>validate <code>initData</code> on your backend before trusting user identity — <code>ctx.miniApp.validate</code> (HMAC) or <code>ctx.miniApp.validateThirdParty</code> (Ed25519, no bot token) from <code>@yaebal/mini-app</code>.</li>
	<li><code>initData</code> has no built-in expiry — <code>@yaebal/mini-app</code> defaults to rejecting anything older than 24h (<code>maxAge</code>), guarding against replaying a leaked-but-genuine payload.</li>
	<li>do not put bot tokens in the mini app frontend.</li>
	<li>treat <code>web_app_data.data</code> as untrusted input.</li>
	<li>use short-lived server-side state for checkout or privileged actions.</li>
	<li>log only safe user ids and action names, not full <code>initData</code> strings.</li>
</ul>
