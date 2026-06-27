import{a as u,f as p}from"../chunks/CBlwNYzs.js";import"../chunks/Dwy-z0HI.js";import{s as e,f as b,e as y,$ as m,n as f}from"../chunks/CILFtpHi.js";import{h as g}from"../chunks/BElR-AbQ.js";import{C as t}from"../chunks/1IpLXSSe.js";var v=p(`<h1>@yaebal/runner</h1> <p class="lead">process updates <strong>concurrently</strong> instead of the built-in sequential long-poll —
	while keeping each chat's updates in order, so sessions stay safe.</p> <h2>install</h2> <!> <h2>usage</h2> <p><code>run(bot)</code> replaces <code>bot.start()</code>. It polls in batches and dispatches to a
	bounded pool, so a slow handler no longer blocks the whole queue.</p> <!> <h2>per-chat ordering</h2> <p>Updates that share a key — the chat id by default — run strictly in submit order and never overlap,
	so per-chat state (sessions) is race-free. Unrelated chats run in parallel up to <code>concurrency</code>.</p> <!> <h2>options</h2> <table><thead><tr><th>option</th><th>default</th><th>meaning</th></tr></thead><tbody><tr><td><code>concurrency</code></td><td><code>50</code></td><td>max updates processed at once</td></tr><tr><td><code>sequentializeBy</code></td><td>chat id</td><td>key whose updates stay ordered; <code>undefined</code> = no ordering</td></tr><tr><td><code>limit</code></td><td><code>100</code></td><td>getUpdates batch size</td></tr><tr><td><code>timeout</code></td><td><code>30</code></td><td>long-poll seconds</td></tr><tr><td><code>allowedUpdates</code></td><td>—</td><td>restrict update types</td></tr><tr><td><code>onError</code></td><td>—</td><td>handler / polling error callback</td></tr></tbody></table> <h2>the scheduler</h2> <p>The core is a reusable bounded-concurrency scheduler with per-key sequentialization — exported in
	case you want it directly.</p> <!> <div class="note">Workers help only when handlers are CPU-bound. Most bots are I/O-bound, and this runner already
	saturates the event loop. For genuinely heavy CPU work, offload it with <a href="/docs/workers/">@yaebal/workers</a>.</div>`,1);function z(n){const s="pnpm add @yaebal/runner",c=`import { run } from "@yaebal/runner";

// instead of bot.start(): drive the bot concurrently
const handle = run(bot, { concurrency: 50 });

// later, drain in-flight work and stop:
await handle.stop();`,l=`run(bot, {
  concurrency: 100,
  sequentializeBy: (u) => u.message?.chat.id,  // default: chat id
  limit: 100,         // getUpdates batch size
  timeout: 30,        // long-poll seconds
  onError: (err, update) => log.error(err),
});`,i=`import { createScheduler } from "@yaebal/runner";

const s = createScheduler(8);
s.submit("chat-42", () => doWork());  // same key → strict order; different keys → parallel
await s.idle();                        // resolves when everything drains`;var o=v();g("xjvlu5",w=>{y(()=>{m.title="@yaebal/runner — yaebal"})});var r=e(b(o),6);t(r,{code:s,title:"terminal",lang:"sh"});var d=e(r,6);t(d,{code:c,title:"bot.ts"});var a=e(d,6);t(a,{code:l,title:"options.ts"});var h=e(a,10);t(h,{code:i,title:"scheduler.ts"}),f(2),u(n,o)}export{z as component};
