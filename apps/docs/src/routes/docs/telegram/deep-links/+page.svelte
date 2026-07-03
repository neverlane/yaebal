<script lang="ts">
	import Code from "$lib/Code.svelte";

	const link = `const payload = "ref_67";
const url = "https://t.me/my_bot?start=" + encodeURIComponent(payload);`;

	const parse = `bot.command("start", async (ctx) => {
  const payload = ctx.args?.trim();

  if (payload?.startsWith("ref_")) {
    await saveReferral(ctx.from!.id, payload.slice(4));
  }

  await ctx.reply("welcome");
});`;

	const group = `const url = "https://t.me/my_bot?startgroup=" + encodeURIComponent("team_67");`;
</script>

<svelte:head>
	<title>deep links — yaebal</title>
</svelte:head>

<h1>deep links</h1>
<p class="lead">
	use telegram start payloads for referrals, onboarding, invite attribution, and group setup.
</p>

<h2>private chat links</h2>
<Code code={link} title="link.ts" />

<h2>read the payload</h2>
<p>
	telegram delivers the payload as arguments to <code>/start</code>. in yaebal command handlers,
	read <code>ctx.args</code>.
</p>
<Code code={parse} title="start.ts" />

<h2>group links</h2>
<p>
	use <code>startgroup</code> when the link should add the bot to a group and carry setup context.
</p>
<Code code={group} title="group-link.ts" />

<h2>safety rules</h2>
<ul>
	<li>treat payloads as untrusted user input.</li>
	<li>keep payloads short and url-safe.</li>
	<li>store attribution server-side if the payload would expose sensitive data.</li>
	<li>make referral writes idempotent; users can click the same link multiple times.</li>
	<li>test the first-message path with <a href="/docs/plugins/test/">@yaebal/test</a>.</li>
</ul>
