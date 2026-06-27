import{a as i,f as m}from"../chunks/CBlwNYzs.js";import"../chunks/Dwy-z0HI.js";import{s as t,f as g,e as u,$ as y,n as f}from"../chunks/CILFtpHi.js";import{h as x}from"../chunks/BElR-AbQ.js";import{C as e}from"../chunks/1IpLXSSe.js";var b=m(`<h1>@yaebal/prompt</h1> <p class="lead">send a question and run a handler on the next message — no suspended promise, safe under the
	sequential update loop. pending handlers are in-memory.</p> <h2>install</h2> <!> <h2>usage</h2> <p>install the plugin with <code>.install(prompt())</code>. it adds <code>ctx.prompt</code> on
	every update. call it with a question string and a handler; the handler receives the full context
	of the reply message.</p> <!> <h2>api</h2> <table><thead><tr><th>export</th><th>signature</th><th>description</th></tr></thead><tbody><tr><td><code>prompt</code></td><td><code>(options?: PromptOptions) =&gt; Plugin&lt;Context, PromptControl&gt;</code></td><td>creates the prompt plugin</td></tr><tr><td><code>PromptControl</code></td><td>interface</td><td>what the plugin adds to the context — the <code>prompt</code> method</td></tr><tr><td><code>PromptOptions</code></td><td>interface</td><td>options passed to <code>prompt()</code></td></tr><tr><td><code>PromptHandler</code></td><td><code>(ctx: Context) =&gt; unknown | Promise&lt;unknown&gt;</code></td><td>the callback that handles the answer message</td></tr></tbody></table> <h3>PromptControl (ctx.prompt)</h3> <table><thead><tr><th>parameter</th><th>type</th><th>required</th><th>description</th></tr></thead><tbody><tr><td><code>question</code></td><td><code>string | FormatResult</code></td><td>yes</td><td>text sent to the user; accepts a plain string or a <code>@yaebal/core</code> format result</td></tr><tr><td><code>handler</code></td><td><code>PromptHandler</code></td><td>yes</td><td>runs when the next message arrives from the same chat</td></tr><tr><td><code>extra</code></td><td><code>Record&lt;string, unknown&gt;</code></td><td>no</td><td>extra parameters forwarded to <code>sendMessage</code> (e.g. <code>reply_markup</code>)</td></tr></tbody></table> <p><code>ctx.prompt</code> returns <code>Promise&lt;Message&gt;</code> — the sent question message.</p> <h3>PromptOptions</h3> <table><thead><tr><th>field</th><th>type</th><th>required</th><th>description</th></tr></thead><tbody><tr><td><code>getKey</code></td><td><code>(ctx: Context) =&gt; string | undefined</code></td><td>no</td><td>identifies which chat a pending handler belongs to. defaults to <code>ctx.chat?.id?.toString()</code></td></tr></tbody></table> <h2>chaining prompts</h2> <p>a handler can call <code>ctx.prompt</code> again to collect a second answer, and so on. each
	call registers a new one-shot handler for the next message.</p> <!> <h2>extra send parameters</h2> <!> <div class="note"><strong>the answer message is consumed.</strong> the reply is handled by the pending handler and
	never reaches other handlers (e.g. <code>bot.on("message:text", ...)</code>). if the user types
	a command like <code>/cancel</code> instead of an answer, the pending handler receives it — check
	for that in the handler if you want an escape hatch. <br/><br/> <strong>pending handlers are in-memory.</strong> they are stored in a plain <code>Map</code> and
	are lost on process restart. there is no built-in persistent storage option for prompt — use <code>@yaebal/scenes</code> if you need persistence. <br/><br/> <strong>one pending handler per key.</strong> calling <code>ctx.prompt</code> twice before the
	user answers replaces the first handler with the second.</div>`,1);function q(n){const s="pnpm add @yaebal/prompt",c=`import { Bot } from "@yaebal/core";
import { prompt } from "@yaebal/prompt";
import type { PromptControl } from "@yaebal/prompt";

const bot = new Bot(process.env.BOT_TOKEN!).install(prompt());

// cast once at the handler boundary — ctx.prompt is fully typed
bot.command("ask", (ctx) =>
  (ctx as typeof ctx & PromptControl).prompt("name?", (c) =>
    c.reply(\`Hello, \${c.text}!\`),
  ),
);

bot.start();`,p=`// handlers can call ctx.prompt again to collect multiple values in sequence
bot.command("survey", (ctx) =>
  (ctx as typeof ctx & PromptControl).prompt("first name?", (c1) => {
    const first = c1.text ?? "";
    return (c1 as typeof c1 & PromptControl).prompt("last name?", (c2) => {
      const last = c2.text ?? "";
      return c2.reply(\`Full name: \${first} \${last}\`);
    });
  }),
);`,l=`// pass extra sendMessage parameters as the third argument
await (ctx as typeof ctx & PromptControl).prompt(
  "Choose an option:",
  async (c) => { /* handle reply */ },
  {
    reply_markup: {
      force_reply: true,
      input_field_placeholder: "type here",
    },
  },
);`;var o=b();x("25257w",w=>{u(()=>{y.title="@yaebal/prompt — yaebal"})});var r=t(g(o),6);e(r,{code:s,title:"terminal",lang:"sh"});var a=t(r,6);e(a,{code:c,title:"bot.ts"});var d=t(a,20);e(d,{code:p,title:"chaining.ts"});var h=t(d,4);e(h,{code:l,title:"extra.ts"}),f(2),i(n,o)}export{q as component};
