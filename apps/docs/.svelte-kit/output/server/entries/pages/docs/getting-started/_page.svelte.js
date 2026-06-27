import { d as derived, h as head } from "../../../../chunks/index.js";
import { C as Code } from "../../../../chunks/Code.js";
import { g as goto } from "../../../../chunks/client.js";
import "../../../../chunks/exports.js";
import "@sveltejs/kit/internal/server";
import "../../../../chunks/root.js";
import "sucrase";
const EXAMPLES = {
  "getting-started": {
    title: "your first bot",
    code: `import { Bot } from "@yaebal/core";

const bot = new Bot(process.env.BOT_TOKEN!);

bot.command("start", (ctx) => ctx.reply("hello 👋"));

bot.on("message:text", (ctx) => {
  ctx.reply(\`you said: \${ctx.text}\`);
});

bot.start();`,
    steps: [{ user: "/start" }, { user: "hi there" }]
  }
};
function Try($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let { id, title = "bot.ts" } = $$props;
    const ex = derived(() => EXAMPLES[id]);
    function open() {
      goto();
    }
    if (ex()) {
      $$renderer2.push("<!--[0-->");
      $$renderer2.push(`<div class="try svelte-1kp8fg">`);
      Code($$renderer2, { code: ex().code, title, onTry: open });
      $$renderer2.push(`<!----> `);
      {
        $$renderer2.push("<!--[-1-->");
      }
      $$renderer2.push(`<!--]--></div>`);
    } else {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]-->`);
  });
}
function _page($$renderer) {
  const install = "pnpm add @yaebal/core";
  const webhook = `import { webhookCallback } from "@yaebal/core";

// any fetch-style runtime (Bun, Deno, Cloudflare Workers)
export default {
  fetch: webhookCallback(bot, { secretToken: process.env.WEBHOOK_SECRET }),
};`;
  head("di86c5", $$renderer, ($$renderer2) => {
    $$renderer2.title(($$renderer3) => {
      $$renderer3.push(`<title>getting started — yaebal</title>`);
    });
  });
  $$renderer.push(`<h1>getting started</h1> <p class="lead">a bot from zero in about a minute. node 20+, esm only.</p> <h2>install</h2> <p>the core package is all you need to start. plugins are separate and opt-in.</p> `);
  Code($$renderer, { code: install, title: "terminal", lang: "sh" });
  $$renderer.push(`<!----> <h2>your first bot</h2> <p>create a bot with your token from <a href="https://t.me/BotFather" target="_blank" rel="noreferrer">@BotFather</a>,
	register a couple of handlers, and start long-polling.</p> `);
  Try($$renderer, { id: "getting-started", title: "bot.ts" });
  $$renderer.push(`<!----> <div class="note"><strong>esm only.</strong> yaebal is <code>"type": "module"</code> with <code>NodeNext</code> resolution — use explicit <code>.js</code> specifiers in your own source.</div> <h2>run it</h2> <p>point an env var at your token and run with your favourite runtime:</p> `);
  Code($$renderer, {
    code: "BOT_TOKEN=123:abc node bot.js",
    title: "terminal",
    lang: "sh"
  });
  $$renderer.push(`<!----> <h2>webhooks</h2> <p>webhooks live in core. <code>webhookCallback</code> returns a fetch handler with a constant-time
	secret check, so it drops straight into Bun, Deno or Cloudflare Workers.</p> `);
  Code($$renderer, { code: webhook, title: "worker.ts" });
  $$renderer.push(`<!----> <h2>next</h2> <ul><li><a href="/docs/core/">core concepts</a> — the composer, derive/decorate, filter queries</li> <li><a href="/docs/contexts/">contexts</a> — the auto-generated context layer (the killer feature)</li> <li><a href="/docs/plugins/">plugins</a> — sessions, keyboards, scenes, i18n and more</li></ul>`);
}
export {
  _page as default
};
