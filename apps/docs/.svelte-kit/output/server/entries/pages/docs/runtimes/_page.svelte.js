import { h as head } from "../../../../chunks/index.js";
import { C as Code } from "../../../../chunks/Code.js";
function _page($$renderer) {
  const cfWorkers = `// Cloudflare Workers — fetch-first, runs at the edge
import { Bot } from "@yaebal/core";
import { webhook } from "@yaebal/web";

const bot = new Bot(env.BOT_TOKEN);
bot.command("start", (ctx) => ctx.reply("hi from the edge"));

export default { fetch: webhook(bot) };`;
  const bunServe = `// Bun — built-in HTTP server
import { Bot } from "@yaebal/core";
import { webhook } from "@yaebal/web";

const bot = new Bot(process.env.BOT_TOKEN!);
bot.on("message:text", (ctx) => ctx.reply(ctx.text));

Bun.serve({ port: 8080, fetch: webhook(bot) });`;
  const denoServe = `// Deno — built-in HTTP server
import { Bot } from "@yaebal/core";
import { webhook } from "@yaebal/web";

const bot = new Bot(Deno.env.get("BOT_TOKEN")!);
bot.on("message:text", (ctx) => ctx.reply(ctx.text));

Deno.serve({ port: 8080 }, webhook(bot));`;
  head("jpkuyi", $$renderer, ($$renderer2) => {
    $$renderer2.title(($$renderer3) => {
      $$renderer3.push(`<title>runtime support — yaebal</title>`);
    });
  });
  $$renderer.push(`<h1>runtime support</h1> <p class="lead">yaebal is fetch-first and has zero native-module dependencies in the core, so Bun, Deno, and
	edge runtimes like Cloudflare Workers work out of the box. This page lists what runs where.</p> <h2>support matrix</h2> <table><thead><tr><th>feature</th><th>Node</th><th>Bun</th><th>Deno</th><th>CF Workers / edge</th></tr></thead><tbody><tr><td><code>@yaebal/core</code> + most plugins</td><td>✅</td><td>✅</td><td>✅</td><td>✅</td></tr><tr><td><code>@yaebal/web</code> — <code>webhook()</code></td><td>✅</td><td>✅</td><td>✅</td><td>✅</td></tr><tr><td><code>nodeWebhookCallback</code> (node http)</td><td>✅</td><td>✅ (compat)</td><td>✅ (compat)</td><td>❌ no node:http</td></tr><tr><td><code>@yaebal/panel</code></td><td>✅</td><td>✅</td><td>✅</td><td>❌ needs fs</td></tr><tr><td><code>@yaebal/router</code> (file-based)</td><td>✅</td><td>✅</td><td>✅</td><td>❌ needs fs</td></tr><tr><td><code>@yaebal/workers</code> (thread pool)</td><td>✅</td><td>✅</td><td>⚠️ limited</td><td>❌ no worker_threads</td></tr><tr><td><code>create-yaebal</code> (CLI)</td><td>✅</td><td>✅</td><td>✅</td><td>N/A</td></tr></tbody></table> <div class="note"><strong>why fetch-first?</strong> The Fetch API is the one HTTP primitive shared by Node 18+,
	Bun, Deno, and all edge runtimes. By building on <code>(Request) => Promise&lt;Response></code> instead of <code>(req, res)</code>, yaebal adapters work everywhere without shims.</div> <h2>Cloudflare Workers</h2> <p><code>webhook()</code> from <code>@yaebal/web</code> returns a standard fetch handler, so you
	can drop it directly into a Workers export. No adapter needed, no Node compatibility flag
	required.</p> `);
  Code($$renderer, { code: cfWorkers, title: "worker.ts" });
  $$renderer.push(`<!----> <h2>Bun</h2> <p>Pass the same fetch handler to <code>Bun.serve</code>. Bun's Node compatibility layer means
	you can also use <code>nodeWebhookCallback</code> with <code>Bun.serve</code>'s <code>node:http</code>-style API if you prefer, but the fetch path is simpler.</p> `);
  Code($$renderer, { code: bunServe, title: "server.ts" });
  $$renderer.push(`<!----> <h2>Deno</h2> <p><code>Deno.serve</code> accepts a fetch handler directly. Import from npm via Deno's npm
	specifier support (<code>npm:@yaebal/core</code>) or use a local build.</p> `);
  Code($$renderer, { code: denoServe, title: "server.ts" });
  $$renderer.push(`<!----> <h2>edge limitations</h2> <p>Edge runtimes (Cloudflare Workers, Deno Deploy, Vercel Edge) don't expose the filesystem or <code>worker_threads</code>, so anything that relies on those won't run there:</p> <ul><li><code>@yaebal/panel</code> — serves a static admin UI from disk; needs <code>fs</code></li> <li><code>@yaebal/router</code> — discovers handler files at startup; needs <code>fs</code></li> <li><code>@yaebal/workers</code> — spawns a <code>worker_threads</code> pool; not available at
		the edge</li> <li><code>nodeWebhookCallback</code> — uses <code>node:http</code> types; polyfills vary</li></ul> <p>Everything else — core, all filter/keyboard/session/i18n plugins, <code>webhook()</code> — runs fine at the edge.</p>`);
}
export {
  _page as default
};
