import{a as x,f as b}from"../chunks/CBlwNYzs.js";import"../chunks/Dwy-z0HI.js";import{s as t,f as y,e as f,$ as k,n as v}from"../chunks/CILFtpHi.js";import{h as L}from"../chunks/BElR-AbQ.js";import{C as e}from"../chunks/1IpLXSSe.js";var w=b(`<h1>split</h1> <p class="lead">break long messages into telegram-sized chunks. adds <code>ctx.sendLong</code> and <code>ctx.replyLong</code> to the context, and also exports a pure <code>split()</code> function
	for use outside a handler.</p> <h2>installation</h2> <!> <h2>basic usage</h2> <p>install the <code>splitter()</code> plugin with <code>bot.use()</code>. it adds <code>sendLong</code> and <code>replyLong</code> to every handler's context. both accept the same
	options as <code>ctx.send</code> / <code>ctx.reply</code>.</p> <!> <h2>custom chunk size</h2> <p>pass a number to <code>splitter()</code> to override the default 4096-character limit. useful for
	adding padding (captions, parse overhead) or during tests.</p> <!> <h2>ctx.sendLong and ctx.replyLong</h2> <p>both return <code>Promise&lt;Message[]&gt;</code> — one <code>Message</code> per chunk sent.</p> <!> <h2>the pure split() function</h2> <p><code>split(text, max?)</code> is exported separately so you can use the splitting logic without
	a bot context — in tests, pre-processing pipelines, or anywhere you just need the chunks.</p> <!> <h2>splitting rules</h2> <p>the algorithm prefers line breaks over hard cuts:</p> <ul><li>text shorter than or equal to <code>max</code> is returned as a single-element array</li> <li>lines are accumulated until the next line would exceed the limit, then a chunk is flushed</li> <li>a single line that is itself longer than <code>max</code> is hard-split at the byte boundary</li> <li>rejoining all chunks with <code>"\\n"</code> reconstructs the original text exactly</li></ul> <!> <h2>api</h2> <table><thead><tr><th>export</th><th>kind</th><th>description</th></tr></thead><tbody><tr><td><code>splitter(max?)</code></td><td>Plugin</td><td>installs <code>sendLong</code> / <code>replyLong</code> on the context</td></tr><tr><td><code>split(text, max?)</code></td><td>function</td><td>pure splitter — returns <code>string[]</code></td></tr><tr><td><code>MAX_MESSAGE_LENGTH</code></td><td>const</td><td><code>4096</code> — telegram's per-message text limit</td></tr><tr><td><code>SplitControl</code></td><td>interface</td><td>the shape added to the context by <code>splitter()</code></td></tr></tbody></table> <h2>SplitControl interface</h2> <table><thead><tr><th>method</th><th>returns</th><th>description</th></tr></thead><tbody><tr><td><code>sendLong(text, extra?)</code></td><td><code>Promise&lt;Message[]&gt;</code></td><td>send <code>text</code> split into chunks via <code>ctx.send</code></td></tr><tr><td><code>replyLong(text, extra?)</code></td><td><code>Promise&lt;Message[]&gt;</code></td><td>reply with <code>text</code> split into chunks via <code>ctx.reply</code></td></tr></tbody></table> <div class="note">chunks are sent sequentially, not in parallel — telegram preserves message order within a chat
	but parallel sends from one bot can arrive out of order.</div>`,1);function S(r){const l="pnpm add @yaebal/split",c=`import { Bot } from "@yaebal/core";
import { splitter } from "@yaebal/split";

const bot = new Bot(token);
bot.install(splitter()); // adds ctx.sendLong / ctx.replyLong

bot.command("essay", async (ctx) => {
  const text = await fetchLongArticle(); // might be 10 000+ characters
  await ctx.replyLong(text);             // sent as multiple messages automatically
});`,p=`// default max is 4096 (telegram's limit); lower it for testing or padding
const bot = new Bot(token);
bot.install(splitter(2000));`,h=`bot.on("message:text", async (ctx) => {
  const messages = await ctx.sendLong(bigText, { parse_mode: "HTML" });
  // messages: Message[] — one entry per chunk sent
});`,u=`import { split } from "@yaebal/split";

const chunks = split("hello\\nworld\\n" + "x".repeat(5000));
// chunks is string[] — no bot, no context needed`,g=`import { split } from "@yaebal/split";

// prefers breaking on newlines
split("line1\\nline2\\nline3", 10);
// → ["line1\\nline2", "line3"]  (joined until limit, then flushed)

// hard-splits a single line longer than max
split("a".repeat(250), 100);
// → ["a".repeat(100), "a".repeat(100), "a".repeat(50)]`;var o=w();L("wjbu3k",_=>{f(()=>{k.title="split — yaebal"})});var s=t(y(o),6);e(s,{code:l,lang:"sh",title:"terminal"});var n=t(s,6);e(n,{code:c,title:"bot.ts"});var d=t(n,6);e(d,{code:p,title:"bot.ts"});var a=t(d,6);e(a,{code:h,title:"handler.ts"});var i=t(a,6);e(i,{code:u,title:"util.ts"});var m=t(i,8);e(m,{code:g,title:"split-rules.ts"}),v(10),x(r,o)}export{S as component};
