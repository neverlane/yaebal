import { h as head } from "../../../../../chunks/index.js";
import { C as Code } from "../../../../../chunks/Code.js";
function _page($$renderer) {
  const install = `pnpm add @yaebal/prompt`;
  const simple = `import { Bot } from "@yaebal/core";
import { prompt } from "@yaebal/prompt";
import type { PromptControl } from "@yaebal/prompt";

const bot = new Bot(process.env.BOT_TOKEN!).install(prompt());

// cast once at the handler boundary — ctx.prompt is fully typed
bot.command("ask", (ctx) =>
  (ctx as typeof ctx & PromptControl).prompt("name?", (c) =>
    c.reply(\`Hello, \${c.text}!\`),
  ),
);

bot.start();`;
  const chaining = `// handlers can call ctx.prompt again to collect multiple values in sequence
bot.command("survey", (ctx) =>
  (ctx as typeof ctx & PromptControl).prompt("first name?", (c1) => {
    const first = c1.text ?? "";
    return (c1 as typeof c1 & PromptControl).prompt("last name?", (c2) => {
      const last = c2.text ?? "";
      return c2.reply(\`Full name: \${first} \${last}\`);
    });
  }),
);`;
  const extra = `// pass extra sendMessage parameters as the third argument
await (ctx as typeof ctx & PromptControl).prompt(
  "Choose an option:",
  async (c) => { /* handle reply */ },
  {
    reply_markup: {
      force_reply: true,
      input_field_placeholder: "type here",
    },
  },
);`;
  head("25257w", $$renderer, ($$renderer2) => {
    $$renderer2.title(($$renderer3) => {
      $$renderer3.push(`<title>@yaebal/prompt — yaebal</title>`);
    });
  });
  $$renderer.push(`<h1>@yaebal/prompt</h1> <p class="lead">send a question and run a handler on the next message — no suspended promise, safe under the
	sequential update loop. pending handlers are in-memory.</p> <h2>install</h2> `);
  Code($$renderer, { code: install, title: "terminal", lang: "sh" });
  $$renderer.push(`<!----> <h2>usage</h2> <p>install the plugin with <code>.install(prompt())</code>. it adds <code>ctx.prompt</code> on
	every update. call it with a question string and a handler; the handler receives the full context
	of the reply message.</p> `);
  Code($$renderer, { code: simple, title: "bot.ts" });
  $$renderer.push(`<!----> <h2>api</h2> <table><thead><tr><th>export</th><th>signature</th><th>description</th></tr></thead><tbody><tr><td><code>prompt</code></td><td><code>(options?: PromptOptions) => Plugin&lt;Context, PromptControl></code></td><td>creates the prompt plugin</td></tr><tr><td><code>PromptControl</code></td><td>interface</td><td>what the plugin adds to the context — the <code>prompt</code> method</td></tr><tr><td><code>PromptOptions</code></td><td>interface</td><td>options passed to <code>prompt()</code></td></tr><tr><td><code>PromptHandler</code></td><td><code>(ctx: Context) => unknown | Promise&lt;unknown></code></td><td>the callback that handles the answer message</td></tr></tbody></table> <h3>PromptControl (ctx.prompt)</h3> <table><thead><tr><th>parameter</th><th>type</th><th>required</th><th>description</th></tr></thead><tbody><tr><td><code>question</code></td><td><code>string | FormatResult</code></td><td>yes</td><td>text sent to the user; accepts a plain string or a <code>@yaebal/core</code> format result</td></tr><tr><td><code>handler</code></td><td><code>PromptHandler</code></td><td>yes</td><td>runs when the next message arrives from the same chat</td></tr><tr><td><code>extra</code></td><td><code>Record&lt;string, unknown></code></td><td>no</td><td>extra parameters forwarded to <code>sendMessage</code> (e.g. <code>reply_markup</code>)</td></tr></tbody></table> <p><code>ctx.prompt</code> returns <code>Promise&lt;Message></code> — the sent question message.</p> <h3>PromptOptions</h3> <table><thead><tr><th>field</th><th>type</th><th>required</th><th>description</th></tr></thead><tbody><tr><td><code>getKey</code></td><td><code>(ctx: Context) => string | undefined</code></td><td>no</td><td>identifies which chat a pending handler belongs to. defaults to <code>ctx.chat?.id?.toString()</code></td></tr></tbody></table> <h2>chaining prompts</h2> <p>a handler can call <code>ctx.prompt</code> again to collect a second answer, and so on. each
	call registers a new one-shot handler for the next message.</p> `);
  Code($$renderer, { code: chaining, title: "chaining.ts" });
  $$renderer.push(`<!----> <h2>extra send parameters</h2> `);
  Code($$renderer, { code: extra, title: "extra.ts" });
  $$renderer.push(`<!----> <div class="note"><strong>the answer message is consumed.</strong> the reply is handled by the pending handler and
	never reaches other handlers (e.g. <code>bot.on("message:text", ...)</code>). if the user types
	a command like <code>/cancel</code> instead of an answer, the pending handler receives it — check
	for that in the handler if you want an escape hatch. <br/><br/> <strong>pending handlers are in-memory.</strong> they are stored in a plain <code>Map</code> and
	are lost on process restart. there is no built-in persistent storage option for prompt — use <code>@yaebal/scenes</code> if you need persistence. <br/><br/> <strong>one pending handler per key.</strong> calling <code>ctx.prompt</code> twice before the
	user answers replaces the first handler with the second.</div>`);
}
export {
  _page as default
};
