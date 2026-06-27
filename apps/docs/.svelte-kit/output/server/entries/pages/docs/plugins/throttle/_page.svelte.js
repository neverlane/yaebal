import { h as head } from "../../../../../chunks/index.js";
import { C as Code } from "../../../../../chunks/Code.js";
function _page($$renderer) {
  const install = `pnpm add @yaebal/throttle`;
  const usage = `import { Bot } from "@yaebal/core";
import { throttle } from "@yaebal/throttle";

const bot = new Bot(process.env.BOT_TOKEN!);

// space outgoing API calls to ≤ 30/sec (Telegram's global cap)
throttle(bot.api);

bot.on("message:text", (ctx) => ctx.reply("hello!"));
bot.start();`;
  const customInterval = `// tighter limit — one call per 100 ms
throttle(bot.api, { minIntervalMs: 100 });`;
  const reserveUsage = `import { reserve } from "@yaebal/throttle";

// first call at t=1000 — fires immediately, next slot at 1034
reserve(1000, 0, 34);
// => { at: 1000, next: 1034 }

// second call arrives at t=1000 — queued to slot 1034
reserve(1000, 1034, 34);
// => { at: 1034, next: 1068 }

// call arrives after a long gap — fires immediately at t=2000
reserve(2000, 1068, 34);
// => { at: 2000, next: 2034 }`;
  head("8o6y86", $$renderer, ($$renderer2) => {
    $$renderer2.title(($$renderer3) => {
      $$renderer3.push(`<title>@yaebal/throttle — yaebal</title>`);
    });
  });
  $$renderer.push(`<h1>@yaebal/throttle</h1> <p class="lead">space out outgoing API calls to stay within Telegram's rate limits — calls are delayed, never
	dropped.</p> <h2>install</h2> `);
  Code($$renderer, { code: install, title: "terminal", lang: "sh" });
  $$renderer.push(`<!----> <h2>usage</h2> <p>call <code>throttle(bot.api)</code> once after constructing the bot. it installs a <code>before</code> hook on the API layer that enforces a minimum gap between consecutive
	outgoing calls. no middleware registration needed.</p> `);
  Code($$renderer, { code: usage, title: "bot.ts" });
  $$renderer.push(`<!----> <h2>custom interval</h2> `);
  Code($$renderer, { code: customInterval, title: "bot.ts" });
  $$renderer.push(`<!----> <h2>api</h2> <table><thead><tr><th>export</th><th>signature</th><th>description</th></tr></thead><tbody><tr><td><code>throttle</code></td><td><code>(api: Api, options?: ThrottleOptions) => void</code></td><td>installs the throttle hook on <code>bot.api</code></td></tr><tr><td><code>reserve</code></td><td><code>(now: number, next: number, interval: number) => \\{ at: number; next: number \\}</code></td><td>pure slot-reservation function — exported for testing</td></tr><tr><td><code>ThrottleOptions</code></td><td>interface</td><td>options bag passed to <code>throttle()</code></td></tr></tbody></table> <h3>ThrottleOptions</h3> <table><thead><tr><th>field</th><th>type</th><th>default</th><th>description</th></tr></thead><tbody><tr><td><code>minIntervalMs</code></td><td><code>number</code></td><td><code>34</code></td><td>minimum milliseconds between outgoing API calls (~30 calls/sec, Telegram's global cap)</td></tr></tbody></table> <h2>how slot reservation works</h2> <p><code>reserve(now, next, interval)</code> returns the earliest slot at or after <code>now</code> that is at least <code>interval</code> ms after the previous slot. if the bot is idle, the
	next call fires at <code>now</code> with no artificial delay. if calls arrive faster than the
	interval, they queue up by advancing the next-slot pointer.</p> `);
  Code($$renderer, { code: reserveUsage, title: "reserve.ts" });
  $$renderer.push(`<!----> <div class="note"><strong>calls are delayed, not dropped.</strong> every API call will eventually go through —
	throttle only adds a wait, it never discards a request. if your bot sends a large burst it
	will drain the queue over time rather than losing messages. <br/><br/> <strong>this is a global outgoing rate limit.</strong> throttle operates on <code>bot.api</code> and applies to every method call regardless of which user triggered it. for per-user
	incoming-update limiting, use <code>@yaebal/ratelimiter</code> instead. <br/><br/> <strong>the default 34 ms</strong> corresponds to Telegram's documented global cap of
	~30 messages/second. lower values risk 429 errors; the <code>@yaebal/again</code> plugin
	can handle those automatically if they occur.</div>`);
}
export {
  _page as default
};
