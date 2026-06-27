import{a as h,f as u}from"../chunks/CBlwNYzs.js";import"../chunks/Dwy-z0HI.js";import{s as t,f as p,e as y,$ as m,n as g}from"../chunks/CILFtpHi.js";import{h as w}from"../chunks/BElR-AbQ.js";import{C as e}from"../chunks/1IpLXSSe.js";var k=u(`<h1>@yaebal/keyboard</h1> <p class="lead">fluent inline and reply keyboard builders.</p> <h2>install</h2> <!> <h2>inline keyboard</h2> <p><code>InlineKeyboard</code> builds an <code>inline_keyboard</code> markup. buttons accumulate
	into the current row; call <code>.row()</code> to start a new one. call <code>.build()</code> to get the final <code>InlineKeyboardMarkup</code> object to pass as <code>reply_markup</code>.</p> <!> <h2>reply keyboard</h2> <p><code>Keyboard</code> builds a <code>keyboard</code> markup. same row model as <code>InlineKeyboard</code>. flags <code>resized()</code> and <code>oneTime()</code> are
	only included in the output when set to <code>true</code>.</p> <!> <h2>web app and switch inline</h2> <!> <h2>api</h2> <h3>InlineKeyboard</h3> <table><thead><tr><th>method</th><th>signature</th><th>description</th></tr></thead><tbody><tr><td><code>text</code></td><td><code>(label: string, data: string) =&gt; this</code></td><td>button with <code>callback_data</code></td></tr><tr><td><code>url</code></td><td><code>(label: string, url: string) =&gt; this</code></td><td>button that opens a URL</td></tr><tr><td><code>webApp</code></td><td><code>(label: string, url: string) =&gt; this</code></td><td>button that opens a Telegram Web App</td></tr><tr><td><code>switchInline</code></td><td><code>(label: string, query?: string) =&gt; this</code></td><td>switch to inline mode; <code>query</code> defaults to <code>""</code></td></tr><tr><td><code>row</code></td><td><code>() =&gt; this</code></td><td>end the current row; no-op if the row is empty</td></tr><tr><td><code>build</code></td><td><code>() =&gt; InlineKeyboardMarkup</code></td><td>returns the finished markup; does not mutate the builder</td></tr></tbody></table> <h3>Keyboard</h3> <table><thead><tr><th>method</th><th>signature</th><th>description</th></tr></thead><tbody><tr><td><code>text</code></td><td><code>(label: string) =&gt; this</code></td><td>plain text button</td></tr><tr><td><code>requestContact</code></td><td><code>(label: string) =&gt; this</code></td><td>button that requests the user's phone number</td></tr><tr><td><code>requestLocation</code></td><td><code>(label: string) =&gt; this</code></td><td>button that requests the user's location</td></tr><tr><td><code>row</code></td><td><code>() =&gt; this</code></td><td>end the current row; no-op if the row is empty</td></tr><tr><td><code>resized</code></td><td><code>(value?: boolean) =&gt; this</code></td><td>set <code>resize_keyboard</code>; defaults to <code>true</code></td></tr><tr><td><code>oneTime</code></td><td><code>(value?: boolean) =&gt; this</code></td><td>set <code>one_time_keyboard</code>; defaults to <code>true</code></td></tr><tr><td><code>build</code></td><td><code>() =&gt; ReplyKeyboardMarkup</code></td><td>returns the finished markup; does not mutate the builder</td></tr></tbody></table> <h3>types</h3> <table><thead><tr><th>export</th><th>description</th></tr></thead><tbody><tr><td><code>InlineKeyboardMarkup</code></td><td>shape returned by <code>InlineKeyboard.build()</code></td></tr><tr><td><code>InlineKeyboardButton</code></td><td>single button in an inline keyboard</td></tr><tr><td><code>ReplyKeyboardMarkup</code></td><td>shape returned by <code>Keyboard.build()</code></td></tr><tr><td><code>KeyboardButton</code></td><td>single button in a reply keyboard</td></tr></tbody></table> <div class="note"><strong><code>.build()</code> always returns a snapshot.</strong> mutating the builder after
	calling <code>.build()</code> does not affect the already-returned markup — the rows are
	cloned at build time. <br/><br/> <strong>a trailing <code>.row()</code> before <code>.build()</code> is safe</strong> — an
	empty in-progress row is not emitted, so you can end every row with <code>.row()</code> without producing a blank final row.</div>`,1);function q(n){const c="pnpm add @yaebal/keyboard",i=`import { Bot } from "@yaebal/core";
import { InlineKeyboard } from "@yaebal/keyboard";

const bot = new Bot(process.env.BOT_TOKEN!);

bot.command("menu", (ctx) => {
  const kb = new InlineKeyboard()
    .text("Ban", "action:ban")
    .text("Warn", "action:warn")
    .row()
    .url("View profile", "https://t.me/username")
    .build();

  return ctx.reply("choose an action:", { reply_markup: kb });
});`,s=`import { Keyboard } from "@yaebal/keyboard";

bot.command("start", (ctx) => {
  const kb = new Keyboard()
    .text("Yes")
    .text("No")
    .row()
    .requestContact("share phone")
    .resized()
    .oneTime()
    .build();

  return ctx.reply("ready?", { reply_markup: kb });
});`,l=`const kb = new InlineKeyboard()
  .webApp("open app", "https://app.example.com")
  .row()
  .switchInline("share", "my query")
  .build();`;var d=k();w("1duafab",f=>{y(()=>{m.title="@yaebal/keyboard — yaebal"})});var o=t(p(d),6);e(o,{code:c,title:"terminal",lang:"sh"});var r=t(o,6);e(r,{code:i,title:"menu.ts"});var a=t(r,6);e(a,{code:s,title:"start.ts"});var b=t(a,4);e(b,{code:l,title:"inline.ts"}),g(16),h(n,d)}export{q as component};
