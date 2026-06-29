<script lang="ts">
	import Code from "$lib/Code.svelte";

	const install = `pnpm add @yaebal/keyboard`;

	const inlineUsage = `import { Bot } from "@yaebal/core";
import { InlineKeyboard } from "@yaebal/keyboard";

const bot = new Bot(process.env.BOT_TOKEN!);

bot.command("menu", (ctx) => {
  const kb = new InlineKeyboard()
    .text("ban", "action:ban")
    .text("warn", "action:warn")
    .row()
    .url("view profile", "https://t.me/username")
    .build();

  return ctx.reply("choose an action:", { reply_markup: kb });
});`;

	const replyUsage = `import { Keyboard } from "@yaebal/keyboard";

bot.command("start", (ctx) => {
  const kb = new Keyboard()
    .text("yes")
    .text("no")
    .row()
    .requestContact("share phone")
    .resized()
    .oneTime()
    .build();

  return ctx.reply("ready?", { reply_markup: kb });
});`;

	const webAppSwitchInline = `const kb = new InlineKeyboard()
  .webApp("open app", "https://yaeb.al")
  .row()
  .switchInline("share", "my query")
  .build();`;
</script>

<svelte:head>
	<title>@yaebal/keyboard — yaebal</title>
</svelte:head>

<h1>@yaebal/keyboard</h1>
<p class="lead">fluent inline and reply keyboard builders.</p>

<h2>install</h2>
<Code code={install} title="terminal" lang="sh" />

<h2>inline keyboard</h2>
<p>
	<code>InlineKeyboard</code> builds an <code>inline_keyboard</code> markup. buttons accumulate
	into the current row; call <code>.row()</code> to start a new one. call <code>.build()</code>
	to get the final <code>InlineKeyboardMarkup</code> object to pass as <code>reply_markup</code>.
</p>
<Code code={inlineUsage} title="menu.ts" />

<h2>reply keyboard</h2>
<p>
	<code>Keyboard</code> builds a <code>keyboard</code> markup. same row model as
	<code>InlineKeyboard</code>. flags <code>resized()</code> and <code>oneTime()</code> are
	only included in the output when set to <code>true</code>.
</p>
<Code code={replyUsage} title="start.ts" />

<h2>web app and switch inline</h2>
<Code code={webAppSwitchInline} title="inline.ts" />

<h2>api</h2>
<h3>InlineKeyboard</h3>
<table>
	<thead>
		<tr><th>method</th><th>signature</th><th>description</th></tr>
	</thead>
	<tbody>
		<tr>
			<td><code>text</code></td>
			<td><code>(label: string, data: string) =&gt; this</code></td>
			<td>button with <code>callback_data</code></td>
		</tr>
		<tr>
			<td><code>url</code></td>
			<td><code>(label: string, url: string) =&gt; this</code></td>
			<td>button that opens a URL</td>
		</tr>
		<tr>
			<td><code>webApp</code></td>
			<td><code>(label: string, url: string) =&gt; this</code></td>
			<td>button that opens a Telegram Web App</td>
		</tr>
		<tr>
			<td><code>switchInline</code></td>
			<td><code>(label: string, query?: string) =&gt; this</code></td>
			<td>switch to inline mode; <code>query</code> defaults to <code>""</code></td>
		</tr>
		<tr>
			<td><code>row</code></td>
			<td><code>() =&gt; this</code></td>
			<td>end the current row; no-op if the row is empty</td>
		</tr>
		<tr>
			<td><code>build</code></td>
			<td><code>() =&gt; InlineKeyboardMarkup</code></td>
			<td>returns the finished markup; does not mutate the builder</td>
		</tr>
	</tbody>
</table>

<h3>Keyboard</h3>
<table>
	<thead>
		<tr><th>method</th><th>signature</th><th>description</th></tr>
	</thead>
	<tbody>
		<tr>
			<td><code>text</code></td>
			<td><code>(label: string) =&gt; this</code></td>
			<td>plain text button</td>
		</tr>
		<tr>
			<td><code>requestContact</code></td>
			<td><code>(label: string) =&gt; this</code></td>
			<td>button that requests the user's phone number</td>
		</tr>
		<tr>
			<td><code>requestLocation</code></td>
			<td><code>(label: string) =&gt; this</code></td>
			<td>button that requests the user's location</td>
		</tr>
		<tr>
			<td><code>row</code></td>
			<td><code>() =&gt; this</code></td>
			<td>end the current row; no-op if the row is empty</td>
		</tr>
		<tr>
			<td><code>resized</code></td>
			<td><code>(value?: boolean) =&gt; this</code></td>
			<td>set <code>resize_keyboard</code>; defaults to <code>true</code></td>
		</tr>
		<tr>
			<td><code>oneTime</code></td>
			<td><code>(value?: boolean) =&gt; this</code></td>
			<td>set <code>one_time_keyboard</code>; defaults to <code>true</code></td>
		</tr>
		<tr>
			<td><code>build</code></td>
			<td><code>() =&gt; ReplyKeyboardMarkup</code></td>
			<td>returns the finished markup; does not mutate the builder</td>
		</tr>
	</tbody>
</table>

<h3>types</h3>
<table>
	<thead>
		<tr><th>export</th><th>description</th></tr>
	</thead>
	<tbody>
		<tr><td><code>InlineKeyboardMarkup</code></td><td>shape returned by <code>InlineKeyboard.build()</code></td></tr>
		<tr><td><code>InlineKeyboardButton</code></td><td>single button in an inline keyboard</td></tr>
		<tr><td><code>ReplyKeyboardMarkup</code></td><td>shape returned by <code>Keyboard.build()</code></td></tr>
		<tr><td><code>KeyboardButton</code></td><td>single button in a reply keyboard</td></tr>
	</tbody>
</table>

<div class="note">
	<strong><code>.build()</code> always returns a snapshot.</strong> mutating the builder after
	calling <code>.build()</code> does not affect the already-returned markup — the rows are
	cloned at build time.
	<br /><br />
	<strong>a trailing <code>.row()</code> before <code>.build()</code> is safe</strong> — an
	empty in-progress row is not emitted, so you can end every row with <code>.row()</code>
	without producing a blank final row.
</div>
