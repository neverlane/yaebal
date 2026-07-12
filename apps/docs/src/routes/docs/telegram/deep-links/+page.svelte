<script lang="ts">
	import Code from "$lib/Code.svelte";
	import Try from "$lib/Try.svelte";

	const link = `const payload = "ref_67";
const url = "https://t.me/my_bot?start=" + encodeURIComponent(payload);`;

	const parse = `import { createBot } from "yaebal";

const saveReferral = async (userId: number, code: string) => {};
const bot = createBot(process.env.BOT_TOKEN!);

bot.command("start", async (ctx) => {
  // ctx.payload is the raw trimmed remainder after "/start " — exactly what
  // telegram passed as the start parameter. ctx.args is the same thing split
  // on whitespace, for commands that take multiple tokens.
  const payload = ctx.payload;

  if (payload.startsWith("ref_")) {
    await saveReferral(ctx.from!.id, payload.slice(4));
  }

  await ctx.reply("welcome");
});`;

	const group = `const url = "https://t.me/my_bot?startgroup=" + encodeURIComponent("team_67");
const channelUrl = "https://t.me/my_bot?startchannel=" + encodeURIComponent("team_67");`;

	const filterCombo = `import { createBot } from "yaebal";
import { and, command, isChannel } from "@yaebal/filters";

const bot = createBot(process.env.BOT_TOKEN!);

// there's no ready-made "startchannel" export — compose one from the filters
// that already exist. a channel deep link arrives as a channel_post, not a
// private message, so command("start") still matches it.
bot.filter(and(isChannel, command("start")), (ctx) => {
  // ctx.chat.type is narrowed to "channel" here
  return ctx.reply("channel setup: " + ctx.payload);
});`;
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
	telegram delivers the payload as arguments to <code>/start</code>. yaebal's command matching
	(in <code>Composer.command()</code>, <code>@yaebal/commands</code>, and the
	<code>@yaebal/filters</code> command filter) stages three fields on <code>ctx</code>:
</p>
<ul>
	<li><code>ctx.command</code> — the matched name, as typed.</li>
	<li>
		<code>ctx.payload</code> — the raw, trimmed remainder after the command. this is the field
		that maps 1:1 to a deep-link start parameter.
	</li>
	<li>
		<code>ctx.args</code> — the same remainder split on whitespace, as a <code>string[]</code>
		 (empty if there's nothing after the command). a deep-link payload never contains whitespace,
		so <code>ctx.payload</code> and <code>ctx.args[0]</code> agree for deep links — reach for
		<code>ctx.args</code> when a command takes several space-separated tokens instead.
	</li>
</ul>
<Code code={parse} title="start.ts" />

<h2>filter deep links</h2>
<p>
	<a href="/docs/plugins/filters/">@yaebal/filters</a> ships dedicated filters for the deep-link
	shapes telegram supports, so you don't have to parse <code>ctx.payload</code> by hand in every
	handler:
</p>
<ul>
	<li><code>start</code> — <code>/start</code> restricted to private chats.</li>
	<li>
		<code>startGroup</code> — <code>/start</code> fired in a group or supergroup, i.e. a
		<code>?startgroup=</code> link landed.
	</li>
	<li>
		<code>deeplink(param)</code> — <code>/start</code> whose payload equals <code>param</code>
		 (string) or matches <code>param</code> (regexp, staging <code>ctx.match</code>).
	</li>
</ul>
<p>
	register the specific filter <em>before</em> a catch-all <code>.command("start")</code> —
	filters run in registration order, and a broad handler earlier in the chain would otherwise
	swallow every referral before the narrower filter gets a chance:
</p>
<Try id="deeplink-referral" title="referral.ts" />

<h2>group and channel links</h2>
<p>
	use <code>startgroup</code> when the link should add the bot to a group and carry setup
	context, or <code>startchannel</code> for channels. both still arrive as a plain
	<code>/start &lt;payload&gt;</code> on the wire — telegram only differentiates them at the
	link-building stage.
</p>
<Code code={group} title="group-link.ts" />
<p>
	distinguish where a <code>/start</code> landed with the chat-type filters from
	<a href="/docs/plugins/filters/">@yaebal/filters</a>: <code>isPrivate</code>,
	<code>isGroup</code>, and <code>isChannel</code> narrow <code>ctx.chat.type</code>.
	<code>startGroup</code> is just <code>and(isGroup, command("start"))</code> — there's no
	equivalent <code>startChannel</code> export yet, so compose it the same way:
</p>
<Code code={filterCombo} title="channel-start.ts" />

<h2>safety rules</h2>
<ul>
	<li>treat payloads as untrusted user input.</li>
	<li>keep payloads short and url-safe.</li>
	<li>store attribution server-side if the payload would expose sensitive data.</li>
	<li>make referral writes idempotent; users can click the same link multiple times.</li>
	<li>
		order matters: register <code>deeplink()</code> filters and other specific matchers before
		generic <code>.command("start")</code> handlers.
	</li>
	<li>test the first-message path with <a href="/docs/plugins/test/">@yaebal/test</a>.</li>
</ul>
