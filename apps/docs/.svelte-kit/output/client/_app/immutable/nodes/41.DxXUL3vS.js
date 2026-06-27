import{a as u,f as y}from"../chunks/CBlwNYzs.js";import"../chunks/Dwy-z0HI.js";import{s as e,f as k,e as g,$ as v}from"../chunks/CILFtpHi.js";import{h as w}from"../chunks/BElR-AbQ.js";import{C as t}from"../chunks/1IpLXSSe.js";var T=y(`<h1>webhooks</h1> <p class="lead">two webhook handlers — a fetch-style one and a node http one — both feeding the same
	handleUpdate entry point, with a constant-time secret check and a body-size cap.</p> <h2>polling vs webhooks</h2> <p>for development, long polling is simplest: <code>bot.start()</code> loops <code>getUpdates</code> and dispatches each update through <code>handleUpdate</code>, retrying
	after a short delay if a poll fails. it resolves only when <code>bot.stop()</code> is called.</p> <!> <p>for production you usually want webhooks: Telegram POSTs each update to your URL, and you hand the
	request straight to a yaebal handler. no polling loop, and it scales to serverless runtimes.</p> <h2>webhookCallback (fetch)</h2> <p><code>webhookCallback</code> returns a <code>(Request) =&gt; Promise&lt;Response&gt;</code> function — the shape every fetch-based runtime expects. it only accepts <code>POST</code>,
	parses the JSON update, and dispatches it.</p> <!> <h2>the secret check</h2> <p>when you set <code>secretToken</code>, the handler requires Telegram's <code>X-Telegram-Bot-Api-Secret-Token</code> header to match. the comparison is constant-time
	(<code>node:crypto</code> <code>timingSafeEqual</code> on equal-length buffers), so the check can't
	be timed.</p> <table><thead><tr><th>condition</th><th>response</th></tr></thead><tbody><tr><td>method is not <code>POST</code></td><td><code>405</code></td></tr><tr><td><code>secretToken</code> set and header mismatched</td><td><code>401</code></td></tr><tr><td>body larger than 1 MiB</td><td><code>413</code></td></tr><tr><td>body is not valid JSON</td><td><code>400</code></td></tr><tr><td>update dispatched</td><td><code>200 ok</code></td></tr></tbody></table> <div class="note"><strong>body size cap.</strong> Telegram updates are tiny, so the handler rejects anything over
	1 MiB (<code>MAX_BODY</code>) to avoid memory abuse — the fetch handler checks <code>content-length</code>; the node handler counts bytes as they stream and destroys the request
	if it overflows.</div> <h2>nodeWebhookCallback (node http)</h2> <p>for a plain Node server, <code>nodeWebhookCallback</code> returns an <code>(req, res)</code> handler you can drop into <code>http.createServer</code>. same secret
	check and same body cap, streamed off the incoming request.</p> <!> <h2>handleUpdate</h2> <p>both handlers ultimately call <code>bot.handleUpdate(update)</code>, which builds a <code>Context</code> and runs the middleware chain, sending any thrown error to your <code>onError</code> handler. you can also call it directly from a custom HTTP layer.</p> <!> <div class="note"><strong>register before the first update.</strong> the chain is realized and frozen on the first <code>handleUpdate</code> (or <code>start</code>), so attach all middleware and plugins before
	then.</div> <h2>deploy: Cloudflare Workers</h2> <!> <h2>deploy: Bun</h2> <!>`,1);function S(c){const l=`// long polling — start() loops getUpdates and calls handleUpdate for each
const bot = new Bot(process.env.BOT_TOKEN!);
bot.on("message:text", (ctx) => ctx.reply(ctx.text));
await bot.start();   // resolves only when stop() is called`,h=`import { webhookCallback } from "@yaebal/core";

// (Request) => Promise<Response>
const handler = webhookCallback(bot, { secretToken: process.env.WEBHOOK_SECRET });`,i=`// Cloudflare Workers
import { Bot, webhookCallback } from "@yaebal/core";

const bot = new Bot(env.BOT_TOKEN);
bot.command("start", (ctx) => ctx.reply("hi from the edge"));

export default {
  fetch: webhookCallback(bot, { secretToken: env.WEBHOOK_SECRET }),
};`,p=`// Bun
import { Bot, webhookCallback } from "@yaebal/core";

const bot = new Bot(process.env.BOT_TOKEN!);
bot.on("message:text", (ctx) => ctx.reply(ctx.text));

Bun.serve({
  port: 8080,
  fetch: webhookCallback(bot, { secretToken: process.env.WEBHOOK_SECRET }),
});`,b=`// Node http
import { createServer } from "node:http";
import { Bot, nodeWebhookCallback } from "@yaebal/core";

const bot = new Bot(process.env.BOT_TOKEN!);
bot.on("message:text", (ctx) => ctx.reply(ctx.text));

createServer(
  nodeWebhookCallback(bot, { secretToken: process.env.WEBHOOK_SECRET }),
).listen(8080);`,m=`// both handlers ultimately call bot.handleUpdate — the single-update entry point.
// the chain is realized (and frozen) on the first call, so register every
// middleware / plugin before the first handleUpdate or start.
await bot.handleUpdate(update);`;var o=T();w("31ylnl",B=>{g(()=>{v.title="webhooks — yaebal"})});var a=e(k(o),8);t(a,{code:l,title:"polling.ts"});var d=e(a,8);t(d,{code:h,title:"webhook.ts"});var r=e(d,14);t(r,{code:b,title:"server.ts"});var s=e(r,6);t(s,{code:m,title:"handle.ts"});var n=e(s,6);t(n,{code:i,title:"worker.ts"});var f=e(n,4);t(f,{code:p,title:"server.ts"}),u(c,o)}export{S as component};
