import{a as m,f as g}from"../chunks/CBlwNYzs.js";import"../chunks/Dwy-z0HI.js";import{s as e,f as h,e as u,$ as f,n as b}from"../chunks/CILFtpHi.js";import{h as y}from"../chunks/BElR-AbQ.js";import{C as t}from"../chunks/1IpLXSSe.js";var v=g(`<h1>create a bot</h1> <p class="lead">scaffold a working YAEBAL bot in one command — pick a runtime and a few plugins, get a wired
	project.</p> <h2>scaffold</h2> <!> <p>On a terminal it asks for the project name, runtime (<code>node</code> / <code>bun</code> / <code>deno</code>), and plugins. In automation, pass flags instead — no prompts, no hangs:</p> <!> <h2>what you get</h2> <!> <p>The generated <code>src/index.ts</code> already wires the plugins you chose — e.g. picking <code>session</code> adds <code>.install(session(...))</code>, picking <code>again</code> adds <code>autoRetry(bot.api)</code> — plus a <code>/start</code> command and a text echo.</p> <h2>then</h2> <!> <table><thead><tr><th>flag</th><th>values</th></tr></thead><tbody><tr><td><code>--runtime</code> / <code>-r</code></td><td><code>node</code> (default), <code>bun</code>, <code>deno</code></td></tr><tr><td><code>--plugins</code> / <code>-p</code></td><td>comma list of <code>session</code>, <code>ratelimiter</code>, <code>again</code></td></tr></tbody></table>`,1);function O(c){const s=`pnpm create yaebal my-bot
# or: npm create yaebal@latest my-bot  ·  bun create yaebal my-bot`,r=`# non-interactive (CI-friendly) — pass everything as flags:
pnpm create yaebal my-bot --runtime bun --plugins session,again`,i=`my-bot/
  package.json        # scripts for your runtime, @yaebal deps
  tsconfig.json       # strict, ESM, NodeNext
  src/index.ts        # a working bot, wired with the plugins you picked
  .env.example        # BOT_TOKEN=
  .gitignore
  README.md`,l=`cd my-bot
pnpm install
# add your BOT_TOKEN to .env
pnpm dev`;var o=v();y("1vkcyvj",k=>{u(()=>{f.title="create a bot — yaebal"})});var a=e(h(o),6);t(a,{code:s,title:"terminal",lang:"sh"});var d=e(a,4);t(d,{code:r,title:"terminal",lang:"sh"});var n=e(d,4);t(n,{code:i,title:"structure",lang:"text"});var p=e(n,6);t(p,{code:l,title:"terminal",lang:"sh"}),b(2),m(c,o)}export{O as component};
