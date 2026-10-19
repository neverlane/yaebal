<script lang="ts">
	import Code from "$lib/Code.svelte";
	import Try from "$lib/Try.svelte";

	const hero = `import { InlineKeyboard, blockquote, bold, format, italic } from "yaebal";

const hero = format\`\${bold("🤖 orders bot")}

\${blockquote("track an order, reorder in two taps, get notified when it ships.")}

\${italic("v2.1 · beta")}\`;

bot.command("start", (ctx) =>
  ctx.reply(hero, {
    reply_markup: new InlineKeyboard()
      .text("📦 my orders", nav.pack({ to: "orders" }))
      .text("🔁 reorder", nav.pack({ to: "reorder" }))
      .row()
      .text("❓ help", nav.pack({ to: "help" })),
  }),
);`;

	const confirm = `const account = callbackData("account", { step: field.enum(["ask", "delete"]) });

// settings screen: the destructive tile is red and only *asks*
new InlineKeyboard().text("🗑 delete account", account.pack({ step: "ask" }), "danger");

bot.callbackQuery(account, async (ctx) => {
  await ctx.answer();
  if (ctx.queryData.step === "ask") {
    return ctx.editText("delete your account? all data is erased — this can't be undone.", {
      reply_markup: new InlineKeyboard()
        .text("❌ cancel", nav.pack({ to: "settings" })) // safe default first
        .text("💥 yes, delete", account.pack({ step: "delete" }), "danger"),
    });
  }
  await deleteAccount(ctx.from.id);
  await ctx.editText("account deleted.");
});`;

	const progress = `bot.callbackQuery(search, async (ctx) => {
  await ctx.answer();
  await ctx.editText("⏳ searching…"); // instant feedback
  const results = await runSearch(ctx.queryData.q); // may take seconds
  await ctx.editText(renderResults(results), { reply_markup: resultsKeyboard(results) });
});`;

	const empty = `const text = orders.length === 0
  ? format\`\${bold("📦 my orders")}

\${blockquote("no orders yet — the first one shows up here the moment you place it.")}\`
  : renderOrders(orders);

const markup = orders.length === 0
  ? new InlineKeyboard().text("🛒 browse the shop", nav.pack({ to: "shop" })).row().text("◀ back", nav.pack({ to: "home" }))
  : ordersKeyboard(orders);`;

	const commands = `import { Commands } from "@yaebal/commands";

const commands = new Commands()
  .add("start", "open the main menu", start)
  .add("settings", "open settings", settings)
  .add("help", "how this bot works", help);

bot.install(commands.plugin());
bot.onStart(() => commands.sync(bot.api)); // pushes the menu only when it changed`;
</script>

<svelte:head>
	<title>ux patterns — yaebal</title>
</svelte:head>

<h1>ux patterns</h1>
<p class="lead">
	product decisions, not api surface: what makes a telegram bot feel like an app instead of a
	chatbot, and the yaebal pieces that make each pattern a few lines.
</p>

<h2>the one rule</h2>
<p>
	people tap buttons; they don't type commands. commands are for discovery — the <code>/</code>
	menu, deep links. navigation belongs to inline buttons, and a screen change edits the current
	message instead of sending a new one. every pattern below follows from that.
</p>
<Try id="ux-settings-menu" title="menu.ts" />

<h2>a <code>/start</code> that works</h2>
<p>
	a bold one-line title, a two-or-three line pitch in a blockquote, an optional italic meta line,
	then the primary actions as tiles — at most four rows before a phone scrolls. no wall of text, no
	"welcome!" line, no list of every feature: <code>/start</code> is a homepage, not a sitemap.
</p>
<Code code={hero} title="start.ts" />

<h2>edit in place</h2>
<p>
	navigation edits; events send. moving between screens is <code>ctx.editText</code> on the
	message the button belongs to, so the chat stays clean and "where am i" is always the bottom
	of the chat. send a new message for things worth keeping in history — a receipt, a shipped
	order, an error the user must see later. <a href="/docs/plugins/morda/">@yaebal/morda</a> turns
	this into declared windows with a back stack, if your menus outgrow a few handlers.
</p>

<h2>back and home</h2>
<ul>
	<li>a breadcrumb in the text — <code>⚙️ settings · home › settings</code>.</li>
	<li>a <code>◀ back</code> button in the last row of every non-home screen — never a dead end.</li>
	<li>a <code>🏠 home</code> button deeper than two levels, so nobody taps back three times.</li>
	<li>one typed payload for navigation — <code>callbackData("nav", {"{"} to: String {"}"})</code> — and one handler for it.</li>
</ul>

<h2>toggles: the label is the state</h2>
<p>
	<code>✅ alerts</code> / <code>⬜ alerts</code>: one tap flips the value and re-renders the same
	screen, and the changed label is the feedback. one handler per payload schema
	(<code>toggle</code>), not per field. keep toggles and destination tiles on separate rows — a
	user can't tell "flips" from "navigates" when they share one.
</p>

<h2>destructive actions confirm</h2>
<p>
	"delete account" never fires on a single tap. the red tile edits the screen into a
	confirmation that restates the impact, with the safe action first. don't confirm with
	<code>show_alert</code> — alerts block the client, cap at 200 characters and can't hold
	buttons.
</p>
<Code code={confirm} title="delete-account.ts" />

<h2>stop every spinner</h2>
<p>
	telegram shows a spinner on a pressed button until the bot answers the callback query — forget
	it and the button looks broken for ~15 seconds. answer first: empty for navigation (the edit is
	the feedback), a short toast (<code>ctx.answer("saved")</code>) for small confirmations,
	<code>show_alert</code> only for things that must be acknowledged.
	<a href="/docs/plugins/auto-answer/">@yaebal/auto-answer</a> answers for you when a handler
	doesn't, so a forgotten call can't ship.
</p>

<h2>show progress</h2>
<p>
	anything slower than ~300ms gets an instant placeholder. edits are limited to about one per
	second per message, so report progress coarsely (every couple of seconds), not per item. for llm
	answers, <a href="/docs/plugins/ai/"><code>ctx.ai.replyStream</code></a> streams natively.
</p>
<Code code={progress} title="search.ts" />

<h2>empty states</h2>
<p>
	a blank list reads as a bug. say what will appear there and offer the action that creates the
	first item; for a filtered-to-empty list, offer to clear the filter.
	<a href="/docs/plugins/pagination/">@yaebal/pagination</a> handles the long-list case.
</p>
<Code code={empty} title="orders.ts" />

<h2>commands as a shortcut menu</h2>
<p>
	register a short list (≤ 5) so telegram's <code>/</code> menu shows it, localize it if the bot
	is multilingual, and scope admin commands to admins. every command must also be reachable by a
	button. <a href="/docs/plugins/commands/">@yaebal/commands</a> keeps the handlers and the menu
	in one definition and only pushes it when it changed.
</p>
<Code code={commands} title="commands.ts" />

<h2>text hierarchy</h2>
<ul>
	<li><code>bold</code> for the screen title only — bolding everything means nothing is bold.</li>
	<li><code>blockquote</code> for context; <code>expandableBlockquote</code> for long disclosures.</li>
	<li><code>italic</code> for metadata: state, dates, versions.</li>
	<li><code>code</code> / <code>pre</code> for values people copy — pair them with a <code>copyText</code> button.</li>
	<li>links for external urls only; in-bot navigation is buttons.</li>
	<li>build text with <code>format</code> and entities — never mix it with <code>parse_mode</code>.</li>
</ul>

<h2>button labels</h2>
<ul>
	<li>short — about 20 characters; phones cut long labels mid-word.</li>
	<li>one emoji vocabulary: <code>⚙️</code> settings, <code>◀</code> back, <code>🏠</code> home, <code>✅</code>/<code>⬜</code> toggles, <code>🗑</code> destructive, <code>❌</code> cancel.</li>
	<li>verbs for actions ("delete account"), nouns for destinations ("settings").</li>
	<li>2–3 buttons per row for longer labels, up to 4 for short ones; <code>.columns(n)</code> for grids.</li>
	<li>button styles (<code>"danger"</code>, <code>"success"</code>, <code>"primary"</code>) for meaning, not decoration.</li>
</ul>

<h2>groups are different</h2>
<ul>
	<li>reply to the triggering message so people see what the bot answered — <code>ctx.reply</code> does.</li>
	<li>only edit the message tied to the current user's button press; edits are public.</li>
	<li>be quieter: <code>disable_notification</code> for routine posts.</li>
	<li>privacy mode means the bot only sees commands and mentions — turn it off in botfather only if you need every message.</li>
	<li>key per-user state per chat and user (the <code>scenes</code> / <code>conversation</code> default), not per chat.</li>
</ul>

<h2>before you ship</h2>
<ul>
	<li><code>/start</code> is a short hero plus buttons.</li>
	<li>every screen below home has back; anything deeper than two levels has home.</li>
	<li>navigation edits; only events send new messages.</li>
	<li>every callback is answered — or <code>@yaebal/auto-answer</code> is installed.</li>
	<li>destructive actions go through a confirm screen with the safe option first.</li>
	<li>empty lists have a message and a next step.</li>
	<li>slow actions show a placeholder immediately.</li>
	<li>the command menu is short, registered on start, and mirrored by buttons.</li>
</ul>

<h2>related</h2>
<ul>
	<li><a href="/docs/plugins/keyboard/">@yaebal/keyboard</a> — the builders used above</li>
	<li><a href="/docs/plugins/callback-data/">@yaebal/callback-data</a> — typed payloads for every button</li>
	<li><a href="/docs/telegram/deep-links/">deep links</a> — landing users on a specific screen from outside telegram</li>
	<li><a href="/docs/recipes/">recipes</a> — whole bots built this way</li>
</ul>
