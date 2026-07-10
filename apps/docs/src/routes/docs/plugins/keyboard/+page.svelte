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
  .webApp("open app", "https://yaebal.mom")
  .row()
  .switchInline("share", "my query")
  .row()
  .login("log in", "https://example.com/auth")
  .copyText("copy code", "ABC-123")
  .build();`;

	const styleIcon = `// style()/icon() modify the button that was just added — call them right after it
const kb = new InlineKeyboard()
  .text("delete", "action:delete")
  .style("danger")
  .text("confirm", "action:confirm")
  .style("success")
  .build();

// or pass a third \`deco\` argument to decorate the button inline — an object,
// or a "<customEmojiId>:<style>" string shorthand:
const inline = new InlineKeyboard()
  .text("delete", "action:delete", { style: "danger", icon: "5368324170671202286" })
  .text("confirm", "action:confirm", "success")           // bare style
  .text("star", "action:star", "5368324170671202286")     // bare custom-emoji id
  .text("pin", "action:pin", "5368324170671202286:primary") // both
  .build();`;

	const requestButtons = `import { Keyboard } from "@yaebal/keyboard";

// requestId is echoed back on the *Shared update so you can tell buttons apart —
// it only needs to be unique within this keyboard.
const kb = new Keyboard()
  .requestUsers("pick a user", 1, { max_quantity: 1, user_is_bot: false })
  .row()
  .requestChat("pick a channel", 2, /* isChannel */ true, { request_title: true })
  .row()
  .requestManagedBot("create a bot for me", 3, { suggested_name: "My Shop Bot" })
  .resized()
  .build();

bot.on("message", (ctx) => {
  if (ctx.message.users_shared?.request_id === 1) {
    // ctx.message.users_shared.users
  }
});

// managed bots: created bot info arrives both ways
bot.on("managed_bot", (ctx) => {
  // ctx.bot — the newly created/updated bot's User
});`;

	const removeAndForceReply = `import { Keyboard } from "@yaebal/keyboard";

// hide whatever reply keyboard is currently shown
await ctx.reply("ok", { reply_markup: Keyboard.remove() });

// open a reply input, as if the user tapped "reply" on this message
await ctx.reply("what's your name?", {
  reply_markup: Keyboard.forceReply({ input_field_placeholder: "your name" }),
});`;

	const dynamicButtons = `const products = await getProducts();

// static, instance-free builders (InlineKeyboard.text/url/webApp,
// Keyboard.text/requestUsers/requestChat/requestManagedBot) return a raw button —
// add() appends any number of them at once.
const kb = new InlineKeyboard()
  .columns(2) // auto-wraps into rows of 2 — no manual .row() bookkeeping
  .add(...products.map((p) => InlineKeyboard.text(p.name, \`buy:\${p.id}\`)))
  .build();`;

	const toJsonUsage = `// InlineKeyboard/Keyboard implement toJSON(), so Api's JSON.stringify(reply_markup)
// picks it up automatically — .build() is optional here
await ctx.reply("pick one", {
  reply_markup: new InlineKeyboard().text("ok", "ok"),
});`;
</script>

<svelte:head>
	<title>@yaebal/keyboard — yaebal</title>
</svelte:head>

<h1>@yaebal/keyboard</h1>
<p class="lead">fluent inline and reply keyboard builders — full button coverage.</p>

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
	<code>InlineKeyboard</code>. boolean flags like <code>resized()</code> and
	<code>oneTime()</code> are only included in the output when set to <code>true</code>.
</p>
<Code code={replyUsage} title="start.ts" />

<h2>web app, switch inline, login, copy text</h2>
<Code code={webAppSwitchInline} title="inline.ts" />

<h2>styling a button</h2>
<p>
	<code>.style()</code> and <code>.icon()</code> apply to the button most recently added — on
	either builder. call them right after the button they should affect. on inline buttons you can
	also skip the chaining and pass a third <code>deco</code> argument — either
	<code>{'{ style, icon }'}</code> or a <code>"&lt;customEmojiId&gt;:&lt;style&gt;"</code> string
	shorthand (a bare style or a bare custom-emoji id works too).
</p>
<Code code={styleIcon} title="style.ts" />

<h2>request user / chat / managed bot</h2>
<p>
	These reply-keyboard buttons ask the user to pick something and send it back as a service
	message (<code>users_shared</code>, <code>chat_shared</code>) or, for managed bots, as the
	<code>managed_bot</code> update and a message with <code>managed_bot_created</code>. every
	variant takes a <code>requestId</code> you choose — it comes back unchanged so you can match
	the response to the button that triggered it.
</p>
<Code code={requestButtons} title="request.ts" />

<h2>removing a keyboard / forcing a reply</h2>
<p>
	<code>Keyboard.remove()</code> and <code>Keyboard.forceReply()</code> are static helpers that
	build the other two <code>reply_markup</code> shapes Telegram supports — they don't need a
	builder instance.
</p>
<Code code={removeAndForceReply} title="remove.ts" />

<h2>buttons from dynamic data</h2>
<p>
	<code>add(...buttons)</code> appends raw button objects — pair it with the static,
	instance-free builders (<code>InlineKeyboard.text/url/webApp</code>,
	<code>Keyboard.text/requestUsers/requestChat/requestManagedBot</code>) to turn an array into
	buttons without a hand-rolled loop. <code>columns(n)</code> auto-wraps every <code>n</code>
	buttons into a new row; call it with no argument to go back to manual <code>.row()</code>.
</p>
<Code code={dynamicButtons} title="dynamic.ts" />

<h2>passing the builder directly</h2>
<p>
	<code>InlineKeyboard</code> and <code>Keyboard</code> both implement <code>toJSON()</code>
	(an alias for <code>build()</code>). <code>Api</code> serializes <code>reply_markup</code>
	with <code>JSON.stringify</code>, which calls <code>toJSON()</code> automatically — so passing
	the builder itself works, and <code>.build()</code> is only needed when you want the plain
	object (e.g. to inspect or store it).
</p>
<Code code={toJsonUsage} title="tojson.ts" />

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
			<td><code>login</code></td>
			<td><code>(label: string, url: string, options?: Omit&lt;LoginUrl, "url"&gt;) =&gt; this</code></td>
			<td>seamless login button (<code>login_url</code>)</td>
		</tr>
		<tr>
			<td><code>switchInline</code></td>
			<td><code>(label: string, query?: string) =&gt; this</code></td>
			<td>prompts the user to pick a chat and inserts the query there; <code>query</code> defaults to <code>""</code></td>
		</tr>
		<tr>
			<td><code>switchInlineCurrentChat</code></td>
			<td><code>(label: string, query?: string) =&gt; this</code></td>
			<td>inserts the query in the <em>current</em> chat instead of prompting</td>
		</tr>
		<tr>
			<td><code>switchInlineChosenChat</code></td>
			<td><code>(label: string, options?: SwitchInlineQueryChosenChat) =&gt; this</code></td>
			<td>like <code>switchInline</code>, restricted to chosen chat types</td>
		</tr>
		<tr>
			<td><code>copyText</code></td>
			<td><code>(label: string, text: string) =&gt; this</code></td>
			<td>copies <code>text</code> to the clipboard when pressed</td>
		</tr>
		<tr>
			<td><code>pay</code></td>
			<td><code>(label: string) =&gt; this</code></td>
			<td>Stars/invoice pay button — must be first button of the first row</td>
		</tr>
		<tr>
			<td><code>game</code></td>
			<td><code>(label: string) =&gt; this</code></td>
			<td>launches the bot's @BotFather game — must be first button of the first row</td>
		</tr>
		<tr>
			<td><code>style</code></td>
			<td><code>(style: "danger" | "success" | "primary") =&gt; this</code></td>
			<td>styles the most recently added button</td>
		</tr>
		<tr>
			<td><code>icon</code></td>
			<td><code>(customEmojiId: string) =&gt; this</code></td>
			<td>shows a custom emoji before the label of the most recently added button</td>
		</tr>
		<tr>
			<td><code>row</code></td>
			<td><code>() =&gt; this</code></td>
			<td>end the current row; no-op if the row is empty</td>
		</tr>
		<tr>
			<td><code>add</code></td>
			<td><code>(...buttons: InlineKeyboardButton[]) =&gt; this</code></td>
			<td>appends raw button objects — combine with the static builders below for dynamic data</td>
		</tr>
		<tr>
			<td><code>columns</code></td>
			<td><code>(columns?: number) =&gt; this</code></td>
			<td>auto-wraps into rows of <code>columns</code>; no argument disables it</td>
		</tr>
		<tr>
			<td><code>build</code></td>
			<td><code>() =&gt; InlineKeyboardMarkup</code></td>
			<td>returns the finished markup; does not mutate the builder</td>
		</tr>
		<tr>
			<td><code>toJSON</code></td>
			<td><code>() =&gt; InlineKeyboardMarkup</code></td>
			<td>alias for <code>build()</code>, picked up by <code>JSON.stringify</code></td>
		</tr>
		<tr>
			<td><code>InlineKeyboard.text</code></td>
			<td><code>(label: string, data: string) =&gt; InlineKeyboardButton</code></td>
			<td>static — builds a raw button, no instance needed</td>
		</tr>
		<tr>
			<td><code>InlineKeyboard.url</code></td>
			<td><code>(label: string, url: string) =&gt; InlineKeyboardButton</code></td>
			<td>static — builds a raw button, no instance needed</td>
		</tr>
		<tr>
			<td><code>InlineKeyboard.webApp</code></td>
			<td><code>(label: string, url: string) =&gt; InlineKeyboardButton</code></td>
			<td>static — builds a raw button, no instance needed</td>
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
			<td><code>requestPoll</code></td>
			<td><code>(label: string, type?: "quiz" | "regular") =&gt; this</code></td>
			<td>asks the user to compose and send a poll</td>
		</tr>
		<tr>
			<td><code>webApp</code></td>
			<td><code>(label: string, url: string) =&gt; this</code></td>
			<td>button that opens a Telegram Web App</td>
		</tr>
		<tr>
			<td><code>requestUsers</code></td>
			<td><code>(label: string, requestId: number, options?: Omit&lt;KeyboardButtonRequestUsers, "request_id"&gt;) =&gt; this</code></td>
			<td>opens a user picker; result comes back as <code>users_shared</code></td>
		</tr>
		<tr>
			<td><code>requestChat</code></td>
			<td><code>(label: string, requestId: number, isChannel: boolean, options?: Omit&lt;KeyboardButtonRequestChat, "request_id" | "chat_is_channel"&gt;) =&gt; this</code></td>
			<td>opens a chat picker; result comes back as <code>chat_shared</code></td>
		</tr>
		<tr>
			<td><code>requestManagedBot</code></td>
			<td><code>(label: string, requestId: number, options?: Omit&lt;KeyboardButtonRequestManagedBot, "request_id"&gt;) =&gt; this</code></td>
			<td>asks the user to create a bot managed by yours</td>
		</tr>
		<tr>
			<td><code>style</code></td>
			<td><code>(style: "danger" | "success" | "primary") =&gt; this</code></td>
			<td>styles the most recently added button</td>
		</tr>
		<tr>
			<td><code>icon</code></td>
			<td><code>(customEmojiId: string) =&gt; this</code></td>
			<td>shows a custom emoji before the label of the most recently added button</td>
		</tr>
		<tr>
			<td><code>row</code></td>
			<td><code>() =&gt; this</code></td>
			<td>end the current row; no-op if the row is empty</td>
		</tr>
		<tr>
			<td><code>add</code></td>
			<td><code>(...buttons: KeyboardButton[]) =&gt; this</code></td>
			<td>appends raw button objects — combine with the static builders below for dynamic data</td>
		</tr>
		<tr>
			<td><code>columns</code></td>
			<td><code>(columns?: number) =&gt; this</code></td>
			<td>auto-wraps into rows of <code>columns</code>; no argument disables it</td>
		</tr>
		<tr>
			<td><code>persistent</code></td>
			<td><code>(value?: boolean) =&gt; this</code></td>
			<td>set <code>is_persistent</code>; defaults to <code>true</code></td>
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
			<td><code>placeholder</code></td>
			<td><code>(text: string) =&gt; this</code></td>
			<td>set <code>input_field_placeholder</code></td>
		</tr>
		<tr>
			<td><code>selective</code></td>
			<td><code>(value?: boolean) =&gt; this</code></td>
			<td>set <code>selective</code>; defaults to <code>true</code></td>
		</tr>
		<tr>
			<td><code>build</code></td>
			<td><code>() =&gt; ReplyKeyboardMarkup</code></td>
			<td>returns the finished markup; does not mutate the builder</td>
		</tr>
		<tr>
			<td><code>toJSON</code></td>
			<td><code>() =&gt; ReplyKeyboardMarkup</code></td>
			<td>alias for <code>build()</code>, picked up by <code>JSON.stringify</code></td>
		</tr>
		<tr>
			<td><code>Keyboard.text</code></td>
			<td><code>(label: string) =&gt; KeyboardButton</code></td>
			<td>static — builds a raw button, no instance needed</td>
		</tr>
		<tr>
			<td><code>Keyboard.requestUsers</code></td>
			<td><code>(label: string, requestId: number, options?: Omit&lt;KeyboardButtonRequestUsers, "request_id"&gt;) =&gt; KeyboardButton</code></td>
			<td>static — builds a raw button, no instance needed</td>
		</tr>
		<tr>
			<td><code>Keyboard.requestChat</code></td>
			<td><code>(label: string, requestId: number, isChannel: boolean, options?: Omit&lt;KeyboardButtonRequestChat, "request_id" | "chat_is_channel"&gt;) =&gt; KeyboardButton</code></td>
			<td>static — builds a raw button, no instance needed</td>
		</tr>
		<tr>
			<td><code>Keyboard.requestManagedBot</code></td>
			<td><code>(label: string, requestId: number, options?: Omit&lt;KeyboardButtonRequestManagedBot, "request_id"&gt;) =&gt; KeyboardButton</code></td>
			<td>static — builds a raw button, no instance needed</td>
		</tr>
		<tr>
			<td><code>Keyboard.remove</code></td>
			<td><code>(selective?: boolean) =&gt; ReplyKeyboardRemove</code></td>
			<td>static — hides the current reply keyboard</td>
		</tr>
		<tr>
			<td><code>Keyboard.forceReply</code></td>
			<td><code>(options?: Omit&lt;ForceReply, "force_reply"&gt;) =&gt; ForceReply</code></td>
			<td>static — opens a reply input for the message</td>
		</tr>
	</tbody>
</table>

<h3>types</h3>
<p>re-exported from <code>@yaebal/types</code> for convenience — no need to depend on it directly just to type a keyboard.</p>
<table>
	<thead>
		<tr><th>export</th><th>description</th></tr>
	</thead>
	<tbody>
		<tr><td><code>InlineKeyboardMarkup</code></td><td>shape returned by <code>InlineKeyboard.build()</code></td></tr>
		<tr><td><code>InlineKeyboardButton</code></td><td>single button in an inline keyboard</td></tr>
		<tr><td><code>ReplyKeyboardMarkup</code></td><td>shape returned by <code>Keyboard.build()</code></td></tr>
		<tr><td><code>KeyboardButton</code></td><td>single button in a reply keyboard</td></tr>
		<tr><td><code>ReplyKeyboardRemove</code></td><td>shape returned by <code>Keyboard.remove()</code></td></tr>
		<tr><td><code>ForceReply</code></td><td>shape returned by <code>Keyboard.forceReply()</code></td></tr>
		<tr><td><code>KeyboardButtonRequestUsers</code></td><td>options for <code>requestUsers()</code></td></tr>
		<tr><td><code>KeyboardButtonRequestChat</code></td><td>options for <code>requestChat()</code></td></tr>
		<tr><td><code>KeyboardButtonRequestManagedBot</code></td><td>options for <code>requestManagedBot()</code></td></tr>
		<tr><td><code>LoginUrl</code></td><td>options for <code>login()</code></td></tr>
		<tr><td><code>SwitchInlineQueryChosenChat</code></td><td>options for <code>switchInlineChosenChat()</code></td></tr>
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
	<br /><br />
	<strong><code>.style()</code> / <code>.icon()</code> throw if called before any button was
	added</strong> — there's nothing yet to style. they still find the last button after a
	<code>.row()</code> flush (manual or <code>columns()</code>-triggered), so
	<code>.text(...).row().style(...)</code> works as expected.
</div>
