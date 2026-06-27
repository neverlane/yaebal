import { h as head, a as attr, e as ensure_array_like, b as escape_html } from "../../chunks/index.js";
import { C as Code } from "../../chunks/Code.js";
import { T as ThemeToggle, G as GITHUB } from "../../chunks/nav.js";
function _page($$renderer) {
  const sample = `import { Bot } from "@yaebal/core";
import { session } from "@yaebal/session";

const bot = new Bot(process.env.BOT_TOKEN!)
  .install(session())             // ctx.session is now typed
  .derive((ctx) => ({ now: Date.now() }));

bot.on("message:text", (ctx) => {
  //          ^ context is narrowed to text messages
  ctx.reply("hi " + ctx.from.first_name);
  ctx.react("🔥");                // auto-generated shortcut
});

bot.start();`;
  const features = [
    {
      title: "type-safe",
      body: "strict mode, no any in public types. the context type flows through the whole chain."
    },
    {
      title: "chainable",
      body: "Bot extends Composer. derive / decorate / guard each return an augmented context type."
    },
    {
      title: "auto-gen contexts",
      body: "every per-update context and its shortcut methods are generated from the Bot API schema."
    },
    {
      title: "plugin-first",
      body: "a deep set of first-party plugins — filters, conversation, runner, and more. dependencies are explicit and type-checked, never implicit order."
    }
  ];
  head("1uha8ag", $$renderer, ($$renderer2) => {
    $$renderer2.title(($$renderer3) => {
      $$renderer3.push(`<title>yaebal — yet another telegram bot api library</title>`);
    });
  });
  $$renderer.push(`<header class="top svelte-1uha8ag"><a class="brand unbounded svelte-1uha8ag" href="/">yaebal</a> <nav class="top-actions svelte-1uha8ag"><a class="link svelte-1uha8ag" href="/docs/getting-started/">docs</a> <a class="link svelte-1uha8ag"${attr("href", GITHUB)} target="_blank" rel="noreferrer">github</a> `);
  ThemeToggle($$renderer);
  $$renderer.push(`<!----></nav></header> <main class="hero svelte-1uha8ag"><div class="glow svelte-1uha8ag"></div> <span class="eyebrow mono svelte-1uha8ag">type-safe · chainable · plugin-first</span> <h1 class="wordmark unbounded svelte-1uha8ag">yaebal</h1> <p class="tagline svelte-1uha8ag">yet another telegram bot api library.<br/> the context type <em class="svelte-1uha8ag">accumulates</em> through the chain — handlers see what plugins added,
		with zero casting.</p> <div class="cta svelte-1uha8ag"><a class="button accent" href="/docs/getting-started/">get started →</a> <a class="button"${attr("href", GITHUB)} target="_blank" rel="noreferrer">github</a></div> <div class="install mono svelte-1uha8ag"><span class="prompt svelte-1uha8ag">$</span> pnpm add @yaebal/core</div> <div class="sample svelte-1uha8ag">`);
  Code($$renderer, { code: sample, title: "bot.ts" });
  $$renderer.push(`<!----></div> <section class="features svelte-1uha8ag"><!--[-->`);
  const each_array = ensure_array_like(features);
  for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
    let f = each_array[$$index];
    $$renderer.push(`<div class="card svelte-1uha8ag"><h3 class="svelte-1uha8ag">${escape_html(f.title)}</h3> <p class="subtext">${escape_html(f.body)}</p></div>`);
  }
  $$renderer.push(`<!--]--></section> <footer class="foot subtext svelte-1uha8ag"><span>MIT · built on the shoulders of grammY, GramIO &amp; puregram</span></footer></main>`);
}
export {
  _page as default
};
