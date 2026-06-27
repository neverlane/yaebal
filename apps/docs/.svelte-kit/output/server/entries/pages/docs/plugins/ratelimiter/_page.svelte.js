import { h as head } from "../../../../../chunks/index.js";
import { C as Code } from "../../../../../chunks/Code.js";
function _page($$renderer) {
  const install = `pnpm add @yaebal/ratelimiter`;
  const usage = `import { Bot } from "@yaebal/core";
import { ratelimiter } from "@yaebal/ratelimiter";

const bot = new Bot(process.env.BOT_TOKEN!);

// drop updates from users sending more than 5 per second
bot.install(ratelimiter());

bot.on("message:text", (ctx) => ctx.reply("hello!"));
bot.start();`;
  const withOptions = `bot.install(ratelimiter({
  limit: 2,           // max 2 updates per window
  windowMs: 10_000,   // per 10-second window
  onLimit: async (ctx) => {
    await ctx.reply("slow down!");
  },
}));`;
  const customKey = `// rate-limit per chat instead of per user
bot.install(ratelimiter({
  getKey: (ctx) => ctx.chat?.id?.toString(),
}));`;
  const decideUsage = `import { decide } from "@yaebal/ratelimiter";

// first two calls allowed, third is blocked
const a = decide(undefined, 1000, 2, 1000);
// => { allowed: true,  window: { count: 1, resetAt: 2000 } }

const b = decide(a.window, 1000, 2, 1000);
// => { allowed: true,  window: { count: 2, resetAt: 2000 } }

const c = decide(b.window, 1000, 2, 1000);
// => { allowed: false, window: { count: 3, resetAt: 2000 } }

// after the window elapses the counter resets
const over = { count: 9, resetAt: 1500 };
decide(over, 2000, 2, 1000);
// => { allowed: true, window: { count: 1, resetAt: 3000 } }`;
  head("zk4c7y", $$renderer, ($$renderer2) => {
    $$renderer2.title(($$renderer3) => {
      $$renderer3.push(`<title>@yaebal/ratelimiter — yaebal</title>`);
    });
  });
  $$renderer.push(`<h1>@yaebal/ratelimiter</h1> <p class="lead">drop incoming updates from users who exceed a configurable rate — a sliding fixed-window
	counter, keyed per user by default.</p> <h2>install</h2> `);
  Code($$renderer, { code: install, title: "terminal", lang: "sh" });
  $$renderer.push(`<!----> <h2>usage</h2> <p>call <code>bot.install(ratelimiter())</code> once, before any handlers you want protected.
	updates that exceed the limit are silently dropped (or handled by <code>onLimit</code>);
	updates within the limit pass through to the next middleware.</p> `);
  Code($$renderer, { code: usage, title: "bot.ts" });
  $$renderer.push(`<!----> <h2>options</h2> `);
  Code($$renderer, { code: withOptions, title: "bot.ts" });
  $$renderer.push(`<!----> <h2>custom key</h2> <p>the default key is <code>ctx.from?.id</code> (per-user). supply <code>getKey</code> to
	change the unit of limiting. returning <code>undefined</code> from <code>getKey</code> bypasses the limiter for that update entirely.</p> `);
  Code($$renderer, { code: customKey, title: "bot.ts" });
  $$renderer.push(`<!----> <h2>api</h2> <table><thead><tr><th>export</th><th>signature</th><th>description</th></tr></thead><tbody><tr><td><code>ratelimiter</code></td><td><code>(options?: RateLimiterOptions) => Plugin&lt;Context, Record&lt;never, never>></code></td><td>returns a plugin to pass to <code>bot.install()</code></td></tr><tr><td><code>decide</code></td><td><code>(rec, now, limit, windowMs) => \\{ allowed: boolean; window: Window \\}</code></td><td>pure window-decision function — exported for testing</td></tr><tr><td><code>RateLimiterOptions</code></td><td>interface</td><td>options bag passed to <code>ratelimiter()</code></td></tr></tbody></table> <h3>RateLimiterOptions</h3> <table><thead><tr><th>field</th><th>type</th><th>default</th><th>description</th></tr></thead><tbody><tr><td><code>limit</code></td><td><code>number</code></td><td><code>5</code></td><td>max updates allowed per window</td></tr><tr><td><code>windowMs</code></td><td><code>number</code></td><td><code>1000</code></td><td>window length in milliseconds</td></tr><tr><td><code>onLimit</code></td><td><code>(ctx: Context) => unknown</code></td><td><code>undefined</code></td><td>called when an update is dropped; use to send a warning reply</td></tr><tr><td><code>getKey</code></td><td><code>(ctx: Context) => string | undefined</code></td><td>per-user (<code>ctx.from?.id</code>)</td><td>return <code>undefined</code> to bypass the limiter for that update</td></tr></tbody></table> <h2>decide()</h2> <p>the core logic is a pure function with no I/O — exported so you can unit-test custom
	policies without a live bot. it takes the existing window record (or <code>undefined</code> for the first call), the current timestamp, the limit, and the window length.</p> `);
  Code($$renderer, { code: decideUsage, title: "decide.ts" });
  $$renderer.push(`<!----> <div class="note"><strong><code>bot.install()</code>, not <code>bot.use()</code>.</strong> the ratelimiter
	returns a plugin and must be registered with <code>bot.install(ratelimiter())</code>. <br/><br/> <strong>install before your handlers.</strong> the limiter is middleware — updates are
	dropped before they reach any handlers registered after it. installing it last protects
	nothing. <br/><br/> <strong>the window map is never evicted.</strong> one entry per distinct key is held in
	memory for the lifetime of the process. for bots with a bounded and known user set this is
	fine; for bots with unbounded growth you may want to add a periodic sweep. <br/><br/> <strong>updates without a key are always allowed.</strong> if <code>getKey</code> returns <code>undefined</code> (e.g. updates with no <code>from</code> field, or channel posts
	with a custom key function), the limiter skips them — they are not counted or blocked.</div>`);
}
export {
  _page as default
};
