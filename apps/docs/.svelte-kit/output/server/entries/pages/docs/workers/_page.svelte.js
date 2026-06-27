import { h as head } from "../../../../chunks/index.js";
import { C as Code } from "../../../../chunks/Code.js";
function _page($$renderer) {
  const install = `pnpm add @yaebal/workers`;
  const tasks = `// tasks.ts — runs in a worker thread
import { register } from "@yaebal/workers";

register({
  resize: (buf) => sharp(buf).resize(100).toBuffer(),
  hash:   (s)   => crypto.createHash("sha256").update(s).digest("hex"),
});`;
  const bot = `// bot — stays on the main event loop
import { createPool } from "@yaebal/workers";

const pool = createPool(new URL("./tasks.js", import.meta.url), { size: 4 });

bot.on("message:photo", async (ctx) => {
  const thumb = await pool.run("resize", await ctx.download()); // → thread → back
  await ctx.sendPhoto(media.buffer(thumb));
});`;
  head("10yavgk", $$renderer, ($$renderer2) => {
    $$renderer2.title(($$renderer3) => {
      $$renderer3.push(`<title>@yaebal/workers — yaebal</title>`);
    });
  });
  $$renderer.push(`<h1>@yaebal/workers</h1> <p class="lead">a tiny <code>worker_threads</code> pool — keep the bot on the main loop and offload only the
	CPU-heavy bits to threads.</p> <h2>install</h2> `);
  Code($$renderer, { code: install, title: "terminal", lang: "sh" });
  $$renderer.push(`<!----> <h2>when to reach for it</h2> <p>Most handlers are I/O-bound and are already served by <a href="/docs/runner/">@yaebal/runner</a>'s
	concurrency. Threads help only for genuinely CPU-heavy work: image processing, crypto, heavy
	parsing. Offload <em>that</em> — not the whole bot.</p> <h2>usage</h2> <p>Register tasks in a worker file, then call them from a handler:</p> `);
  Code($$renderer, { code: tasks, title: "tasks.ts" });
  $$renderer.push(`<!----> `);
  Code($$renderer, { code: bot, title: "bot.ts" });
  $$renderer.push(`<!----> <h2>how it works</h2> <p>The main thread posts <code>name</code> + <code>arg</code> to the next worker (round-robin); the
	worker runs the registered function and posts the result back, resolving the <code>pool.run</code> promise by id. Buffers can be passed as transferables (no copy) via the third
	argument. If a worker crashes, in-flight calls reject and the thread is respawned.</p> <h2>api</h2> <table><thead><tr><th>export</th><th>signature</th><th>what</th></tr></thead><tbody><tr><td><code>createPool</code></td><td><code>(file, { size })</code></td><td>spawn a pool of workers</td></tr><tr><td><code>pool.run</code></td><td><code>(name, arg?, transfer?)</code></td><td>run a task; returns a promise</td></tr><tr><td><code>pool.destroy</code></td><td><code>()</code></td><td>terminate all workers</td></tr><tr><td><code>register</code></td><td><code>(handlers)</code></td><td>called inside the worker file</td></tr></tbody></table> <div class="note">The worker file must be a built <code>.js</code> (or run under a TS loader). Workers don't share
	closures with the main thread — they only receive the data you pass to <code>run</code>.</div>`);
}
export {
  _page as default
};
