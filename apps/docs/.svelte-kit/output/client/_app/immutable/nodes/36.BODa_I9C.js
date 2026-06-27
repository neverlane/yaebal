import{a as p,f as b}from"../chunks/CBlwNYzs.js";import"../chunks/Dwy-z0HI.js";import{s as e,f as m,e as u,$ as g,n as k}from"../chunks/CILFtpHi.js";import{h as w}from"../chunks/BElR-AbQ.js";import{C as o}from"../chunks/1IpLXSSe.js";var f=b(`<h1>@yaebal/web</h1> <p class="lead">run your bot on edge/web runtimes — Cloudflare Workers, Deno Deploy, Bun, Vercel Edge — via
	webhooks. no long-polling: each incoming <code>Request</code> becomes one update.</p> <h2>install</h2> <!> <h2>edge: a fetch handler</h2> <p><code>webhook(bot)</code> returns a standard <code>(Request) =&gt; Promise&lt;Response&gt;</code>.
	Drop it into any runtime that speaks fetch — that's all an edge bot needs.</p> <!> <h2>standalone: serve on Bun / Deno</h2> <p>For a long-running web server (not edge), <code>serve()</code> uses the runtime's native fetch
	server. On Node, use <code>nodeWebhookCallback</code> from <code>@yaebal/core</code> instead.</p> <!> <h2>register the webhook</h2> <p>Tell Telegram where to send updates. The <code>secretToken</code> you set here must match the one
	you pass to <code>webhook()</code> — it's checked in constant time on every request.</p> <!> <h2>api</h2> <table><thead><tr><th>export</th><th>what</th></tr></thead><tbody><tr><td><code>webhook(bot, options?)</code></td><td>fetch handler for edge/web runtimes</td></tr><tr><td><code>serve(bot, options?)</code></td><td>standalone server on Bun or Deno</td></tr><tr><td><code>setWebhook(bot, url, options?)</code></td><td>register the webhook with Telegram</td></tr><tr><td><code>deleteWebhook(bot, dropPending?)</code></td><td>remove the webhook</td></tr></tbody></table> <div class="note">The whole package is <code>fetch</code>-first with zero <code>node:</code> imports, so it (and the
	core it wraps) runs on Node, Bun, Deno and edge. Looking for the operator dashboard? That moved to <a href="/docs/plugins/panel/">@yaebal/panel</a>.</div>`,1);function C(s){const d="pnpm add @yaebal/web",c=`import { Bot } from "@yaebal/core";
import { webhook, setWebhook } from "@yaebal/web";

// Cloudflare Workers / Deno Deploy / Vercel Edge — no long-polling, just fetch
export default {
  fetch(request: Request, env: { BOT_TOKEN: string; SECRET: string }) {
    const bot = new Bot(env.BOT_TOKEN);
    bot.command("start", (ctx) => ctx.reply("running on the edge ⚡"));
    return webhook(bot, { secretToken: env.SECRET })(request);
  },
};`,l=`import { Bot } from "@yaebal/core";
import { serve } from "@yaebal/web";

const bot = new Bot(process.env.BOT_TOKEN!);
bot.on("message:text", (ctx) => ctx.reply(ctx.text));

// Bun or Deno — starts a native fetch server
serve(bot, { port: 8080, secretToken: process.env.SECRET });`,h=`import { setWebhook, deleteWebhook } from "@yaebal/web";

// run once on deploy to point Telegram at your URL
await setWebhook(bot, "https://my-worker.workers.dev/", {
  secretToken: process.env.SECRET,
  allowedUpdates: ["message", "callback_query"],
  dropPendingUpdates: true,
});

// switch back to long-polling later
await deleteWebhook(bot);`;var t=f();w("1eho4ua",v=>{u(()=>{g.title="@yaebal/web — yaebal"})});var r=e(m(t),6);o(r,{code:d,title:"terminal",lang:"sh"});var n=e(r,6);o(n,{code:c,title:"worker.ts"});var a=e(n,6);o(a,{code:l,title:"server.ts"});var i=e(a,6);o(i,{code:h,title:"deploy.ts"}),k(6),p(s,t)}export{C as component};
