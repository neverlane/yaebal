import{a as f,f as b}from"../chunks/CBlwNYzs.js";import"../chunks/Dwy-z0HI.js";import{s as e,f as y,e as x,$ as v,n as _}from"../chunks/CILFtpHi.js";import{h as F}from"../chunks/BElR-AbQ.js";import{C as t}from"../chunks/1IpLXSSe.js";var w=b(`<h1>@yaebal/router</h1> <p class="lead">file-based routing — load command and event handlers from a <code>routes/</code> directory by convention.</p> <h2>install</h2> <!> <h2>directory convention</h2> <p>place handler files under two sub-directories inside your routes folder. each file must <code>export default</code> a handler function. the filename determines the trigger.</p> <!> <p>files under <code>commands/</code> map to <code>bot.command(name)</code>. files under <code>on/</code> map to <code>bot.on(query)</code>. because <code>:</code> is not a legal
	character in filenames on all operating systems, use <code>.</code> as a separator — dots
	are converted to colons automatically (<code>message.text.ts</code> → <code>"message:text"</code>).</p> <h2>handler files</h2> <!> <!> <h2>usage</h2> <p>call <code>loadRoutes(bot, dir)</code> once after constructing the bot. it scans both
	sub-directories, dynamically imports each file, and registers the default export on the
	bot. it returns the list of registered route strings — useful for a startup log.</p> <!> <h2>api</h2> <table><thead><tr><th>export</th><th>signature</th><th>description</th></tr></thead><tbody><tr><td><code>loadRoutes</code></td><td><code>(bot: RouteTarget, dir: string) =&gt; Promise&lt;string[]&gt;</code></td><td>scans <code>dir/commands/</code> and <code>dir/on/</code>, registers handlers, returns registered route names</td></tr><tr><td><code>routeFromFile</code></td><td><code>(kind: "commands" | "on", file: string) =&gt; \\&#123; method: "command" | "on"; trigger: string \\&#125;</code></td><td>pure mapping from filename to registration params — exported for testing</td></tr><tr><td><code>RouteTarget</code></td><td>interface</td><td>minimal interface satisfied by <code>Bot</code> and <code>Composer</code>: <code>command()</code> + <code>on()</code></td></tr></tbody></table> <h3>RouteTarget</h3> <table><thead><tr><th>method</th><th>description</th></tr></thead><tbody><tr><td><code>command(name, ...handlers)</code></td><td>register a command handler</td></tr><tr><td><code>on(query, ...handlers)</code></td><td>register an event handler</td></tr></tbody></table> <h2>routeFromFile</h2> <p>the mapping function is exported so you can test your own filename conventions or preview
	what trigger a filename will produce without touching the filesystem.</p> <!> <div class="note"><strong>missing directories are silently skipped.</strong> if <code>routes/commands/</code> or <code>routes/on/</code> does not exist, <code>loadRoutes</code> returns an empty list
	rather than throwing — useful during incremental setup. <br/><br/> <strong>files without a default export are also skipped.</strong> only files that export a
	function as their default export are registered. <code>.d.ts</code> declaration files are
	always excluded from scanning. <br/><br/> <strong>supported extensions:</strong> <code>.ts</code>, <code>.js</code>, <code>.mjs</code>.</div>`,1);function $(c){const i="pnpm add @yaebal/router",l=`routes/
  commands/
    start.ts          # → bot.command("start", handler)
    help.ts           # → bot.command("help", handler)
  on/
    message.text.ts   # → bot.on("message:text", handler)
    callback_query.data.ts  # → bot.on("callback_query:data", handler)`,m=`// routes/commands/start.ts
import type { Context } from "@yaebal/core";

export default async (ctx: Context) => {
  await ctx.reply("welcome!");
};`,u=`// routes/on/message.text.ts
import type { Context } from "@yaebal/core";

export default async (ctx: Context) => {
  await ctx.reply(\`you said: \${ctx.text}\`);
};`,h=`import { Bot } from "@yaebal/core";
import { loadRoutes } from "@yaebal/router";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";

const bot = new Bot(process.env.BOT_TOKEN!);

const __dirname = dirname(fileURLToPath(import.meta.url));
const registered = await loadRoutes(bot, join(__dirname, "routes"));

console.log("registered routes:", registered);
// ["command:start", "command:help", "on:message:text"]

bot.start();`,p=`import { routeFromFile } from "@yaebal/router";

routeFromFile("commands", "start.js");
// => { method: "command", trigger: "start" }

routeFromFile("on", "message.text.js");
// => { method: "on", trigger: "message:text" }

routeFromFile("on", "callback_query.data.ts");
// => { method: "on", trigger: "callback_query:data" }`;var o=w();F("1m27nkv",R=>{x(()=>{v.title="@yaebal/router — yaebal"})});var r=e(y(o),6);t(r,{code:i,title:"terminal",lang:"sh"});var a=e(r,6);t(a,{code:l,title:"routes/",lang:"text"});var d=e(a,6);t(d,{code:m,title:"routes/commands/start.ts"});var s=e(d,2);t(s,{code:u,title:"routes/on/message.text.ts"});var n=e(s,6);t(n,{code:h,title:"bot.ts"});var g=e(n,14);t(g,{code:p,title:"mapping.ts"}),_(2),f(c,o)}export{$ as component};
