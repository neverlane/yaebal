<script lang="ts">
	import Code from "$lib/Code.svelte";

	const cfWorkers = `// Cloudflare Workers — fetch-first, runs at the edge
import { Bot } from "@yaebal/core";
import { webhook } from "@yaebal/web";

interface Env {
  BOT_TOKEN: string;
}

export default {
  fetch(request: Request, env: Env) {
    // create the bot per-request: Workers give you "env" only inside fetch(),
    // never at module scope.
    const bot = new Bot(env.BOT_TOKEN);
    bot.command("start", (ctx) => ctx.reply("hi from the edge"));

    return webhook(bot)(request);
  },
};`;

	const bunServe = `// Bun — built-in HTTP server
import { Bot } from "@yaebal/core";
import { webhook } from "@yaebal/web";

const bot = new Bot(process.env.BOT_TOKEN!);
bot.on("message:text", (ctx) => ctx.reply(ctx.text));

Bun.serve({ port: 8080, fetch: webhook(bot) });`;

	const denoServe = `// Deno — built-in HTTP server
import { Bot } from "@yaebal/core";
import { webhook } from "@yaebal/web";

declare const Deno: {
  env: { get(key: string): string | undefined };
  serve(options: { port: number }, handler: (request: Request) => Response | Promise<Response>): unknown;
};

const bot = new Bot(Deno.env.get("BOT_TOKEN")!);
bot.on("message:text", (ctx) => ctx.reply(ctx.text));

Deno.serve({ port: 8080 }, webhook(bot));`;
</script>

<svelte:head>
	<title>runtime support — yaebal</title>
</svelte:head>

<h1>runtime support</h1>
<p class="lead">
	yaebal is fetch-first and has zero native-module dependencies in the core, so Bun, Deno, and
	edge runtimes like Cloudflare Workers work out of the box. This page lists what runs where.
</p>

<h2>support matrix</h2>
<table>
	<thead>
		<tr>
			<th>feature</th>
			<th>Node</th>
			<th>Bun</th>
			<th>Deno</th>
			<th>CF Workers / edge</th>
		</tr>
	</thead>
	<tbody>
		<tr>
			<td>minimum version</td>
			<td>≥20 (18+ for fetch, but the repo targets 20)</td>
			<td>latest</td>
			<td>latest</td>
			<td>n/a — managed by the platform</td>
		</tr>
		<tr>
			<td><code>@yaebal/core</code> + most plugins</td>
			<td>✅</td>
			<td>✅</td>
			<td>✅</td>
			<td>✅</td>
		</tr>
		<tr>
			<td><code>media.path()</code> (local files)</td>
			<td>✅</td>
			<td>✅</td>
			<td>✅ (needs <code>--allow-read</code>)</td>
			<td>❌ no filesystem — use <code>media.url()</code> / <code>media.buffer()</code></td>
		</tr>
		<tr>
			<td><code>@yaebal/web</code> — <code>webhook()</code></td>
			<td>✅</td>
			<td>✅</td>
			<td>✅</td>
			<td>✅</td>
		</tr>
		<tr>
			<td><code>@yaebal/core/node</code> — <code>nodeWebhookCallback</code></td>
			<td>✅</td>
			<td>✅ (compat)</td>
			<td>✅ (compat)</td>
			<td>❌ no node:http</td>
		</tr>
		<tr>
			<td><code>@yaebal/sklad</code> storage adapters</td>
			<td>✅ all</td>
			<td>✅ all</td>
			<td>✅ all</td>
			<td>✅ memory/KV-backed only — anything wrapping <code>node:fs</code> needs a custom adapter</td>
		</tr>
		<tr>
			<td><code>@yaebal/panel</code> main handler</td>
			<td>✅</td>
			<td>✅</td>
			<td>✅</td>
			<td>✅ fetch handler</td>
		</tr>
		<tr>
			<td><code>@yaebal/panel/sqlite</code></td>
			<td>✅ Node ≥22.5</td>
			<td>❌</td>
			<td>❌</td>
			<td>❌</td>
		</tr>
		<tr>
			<td><code>@yaebal/panel/sklad</code> (<code>skladPanelStore</code>)</td>
			<td>✅ any adapter</td>
			<td>✅ any adapter</td>
			<td>✅ any adapter</td>
			<td>✅ with an edge-safe adapter (<code>kvStorage</code>, <code>redisStorage</code>, <code>MemoryStorage</code>) — <code>sqliteStorage</code> still needs <code>node:sqlite</code></td>
		</tr>
		<tr>
			<td><code>@yaebal/router</code> (file-based)</td>
			<td>✅</td>
			<td>✅</td>
			<td>✅</td>
			<td>❌ needs fs</td>
		</tr>
		<tr>
			<td><code>@yaebal/workers</code> (thread pool)</td>
			<td>✅</td>
			<td>✅</td>
			<td>⚠️ limited</td>
			<td>❌ no worker_threads</td>
		</tr>
		<tr>
			<td><code>@yaebal/cron</code> persisted store</td>
			<td>✅ any <code>@yaebal/sklad</code> adapter</td>
			<td>✅</td>
			<td>✅</td>
			<td>✅ with a KV-backed store; timers still run only while the isolate is alive</td>
		</tr>
		<tr>
			<td><code>create-yaebal</code> (CLI)</td>
			<td>✅</td>
			<td>✅</td>
			<td>✅</td>
			<td>N/A</td>
		</tr>
	</tbody>
</table>

<div class="note">
	<strong>why fetch-first?</strong> The Fetch API is the one HTTP primitive shared by Node 18+,
	Bun, Deno, and all edge runtimes. By building on
	<code>(Request) =&gt; Promise&lt;Response&gt;</code> instead of
	<code>(req, res)</code>, yaebal adapters work everywhere without shims.
</div>

<h2 id="cloudflare-workers">Cloudflare Workers</h2>
<p>
	<code>webhook()</code> from <code>@yaebal/web</code> returns a standard fetch handler. Workers
	only give you <code>env</code> inside the <code>fetch()</code> export, so construct the bot
	there rather than at module scope — a top-level <code>new Bot(env.BOT_TOKEN)</code> throws
	because <code>env</code> doesn't exist yet when the module loads.
</p>
<Code code={cfWorkers} title="worker.ts" />
<p>Deno Deploy and Vercel Edge follow the same shape: a fetch handler, no Node globals.</p>

<h2>Bun</h2>
<p>
	Pass the same fetch handler to <code>Bun.serve</code>. Bun's Node compatibility layer means
	you can also use <code>nodeWebhookCallback</code> with <code>Bun.serve</code>'s
	<code>node:http</code>-style API if you prefer, but the fetch path is simpler.
</p>
<Code code={bunServe} title="server.ts" />

<h2>Deno</h2>
<p>
	<code>Deno.serve</code> accepts a fetch handler directly. Import from npm via Deno's npm
	specifier support (<code>npm:@yaebal/core</code>) or use a local build.
</p>
<Code code={denoServe} title="server.ts" />

<h2>edge limitations</h2>
<p>
	Edge runtimes (Cloudflare Workers, Deno Deploy, Vercel Edge) don't expose the filesystem or
	<code>worker_threads</code>, so anything that relies on those won't run there:
</p>
<ul>
	<li>
		<code>media.path()</code> — reads local files off disk; use <code>media.url()</code> for a
		public URL or <code>media.buffer()</code> for in-memory bytes instead. See
		<a href="/docs/media/">media &amp; files</a>.
	</li>
	<li>
		<code>@yaebal/panel/sqlite</code> — optional SQLite store; uses <code>node:sqlite</code> and
		requires Node ≥22.5. the main <code>@yaebal/panel</code> fetch handler runs fine on edge —
		pair it with <code>skladPanelStore</code> from <code>@yaebal/panel/sklad</code> and a
		KV/Redis/memory <a href="/docs/plugins/sklad/">sklad</a> adapter instead of sqlite.
	</li>
	<li>
		<code>@yaebal/router</code> — discovers handler files at startup; needs
		<code>fs</code>
	</li>
	<li>
		<code>@yaebal/workers</code> — spawns a <code>worker_threads</code> pool; not available at
		the edge
	</li>
	<li>
		<code>@yaebal/core/node</code> — uses <code>node:http</code>; keep it out of edge bundles.
	</li>
</ul>
<p>Everything else — core, all filter/keyboard/session/i18n plugins, <code>webhook()</code> — runs fine at the edge.</p>
