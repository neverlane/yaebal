import{a as l,f as h}from"../chunks/CBlwNYzs.js";import"../chunks/Dwy-z0HI.js";import{s as e,f as m,e as p,$ as b,n as f}from"../chunks/CILFtpHi.js";import{h as x}from"../chunks/BElR-AbQ.js";import{C as t}from"../chunks/1IpLXSSe.js";var y=h(`<h1>yaebal <span class="killer svelte-wgkx27">meta</span></h1> <p class="lead">the batteries-included entry point (the gramio idea) — core + the auto-generated contexts + the
	common plugins, all from one <code>import</code>. for a minimal build, use <a href="/docs/core/">@yaebal/core</a> directly.</p> <h2>install</h2> <!> <h2>quick start</h2> <p><code>createBot()</code> is a <code>Bot</code> pre-wired with the <strong>rich per-update
	contexts</strong> — every handler's <code>ctx</code> gets the auto-generated shortcut methods
	(<code>react</code>, <code>editText</code>, <code>pin</code>, …) at runtime, on top of the core <code>ctx.send</code>/<code>ctx.reply</code>.</p> <!> <h2>what's bundled</h2> <!> <div class="note"><strong>how the rich context works.</strong> core's <code>Bot</code> exposes a <code>contextFactory</code> hook; <code>yaebal</code> injects one (<code>richContext</code>) that
	builds the base <a href="/docs/context/">Context</a> and grafts the matching generated context's
	shortcut methods + payload fields onto it. core stays decoupled from <a href="/docs/contexts/">@yaebal/contexts</a> — the meta-package does the wiring.</div> <div class="note">for precise per-update <em>types</em> on <code>ctx</code> (not just runtime methods), the typed
	context classes are re-exported — use them via <a href="/docs/plugins/filters/">filters</a> or a
	cast where you need the exact narrowed signature.</div>`,1);function B(c){const s="pnpm add yaebal",d=`import { createBot, InlineKeyboard, html } from "yaebal";

const bot = createBot(process.env.BOT_TOKEN!);

bot.on("message:text", (ctx) => {
  ctx.reply(html\`hi <b>\${ctx.from?.first_name}</b>\`);
  ctx.react("🔥"); // ← auto-generated shortcut, available out of the box
});

bot.start();`,n=`// everything common is re-exported from one package:
import {
  createBot, Bot, Composer, Context,          // @yaebal/core
  InlineKeyboard, Keyboard,                    // @yaebal/keyboard
  filters, and, or, not,                       // @yaebal/filters
  html, md,                                    // @yaebal/fmt
  callbackData,                                // @yaebal/callback-data
  session, i18n,                               // plugins
  webhook, setWebhook, serve,                  // @yaebal/web (edge)
  MessageContext, CallbackQueryContext,        // @yaebal/contexts
} from "yaebal";`;var o=y();x("wgkx27",u=>{p(()=>{b.title="yaebal — batteries included"})});var a=e(m(o),6);t(a,{code:s,title:"terminal",lang:"sh"});var r=e(a,6);t(r,{code:d,title:"bot.ts"});var i=e(r,4);t(i,{code:n,title:"imports.ts"}),f(4),l(c,o)}export{B as component};
