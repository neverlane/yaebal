<script lang="ts">
	import Code from "$lib/Code.svelte";

	const button = `await ctx.reply("open the app", {
  reply_markup: new InlineKeyboard().webApp("open", "https://app.example.com"),
});`;

	const callback = `// backend endpoint called by your mini app
export async function handleMiniAppAction(userId: number, action: string) {
  await bot.api.call("sendMessage", {
    chat_id: userId,
    text: "action received: " + action,
  });
}`;

	const data = `bot.on("message", async (ctx) => {
  const data = ctx.message?.web_app_data;
  if (!data) return;

  await ctx.reply("mini app sent: " + data.data);
});`;
</script>

<svelte:head>
	<title>mini apps — yaebal</title>
</svelte:head>

<h1>mini apps</h1>
<p class="lead">
	connect telegram mini apps to a yaebal bot through web app buttons, backend validation, and bot
	api callbacks.
</p>

<h2>open a mini app</h2>
<p>
	inline keyboards can open a web app url inside telegram. use https in production.
</p>
<Code code={button} title="button.ts" />

<h2>send from your backend</h2>
<p>
	a mini app usually talks to your web backend. after validating the request, that backend can use
	the bot api to message the user or update bot-side state.
</p>
<Code code={callback} title="backend.ts" />

<h2>web app data messages</h2>
<p>
	if the mini app sends data back through telegram, it arrives as a message service field.
</p>
<Code code={data} title="web-app-data.ts" />

<h2>security checklist</h2>
<ul>
	<li>validate telegram init data on your backend before trusting user identity.</li>
	<li>do not put bot tokens in the mini app frontend.</li>
	<li>treat <code>web_app_data.data</code> as untrusted input.</li>
	<li>use short-lived server-side state for checkout or privileged actions.</li>
	<li>log only safe user ids and action names, not full init data strings.</li>
</ul>
