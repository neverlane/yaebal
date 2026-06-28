<script lang="ts">
	import Code from "$lib/Code.svelte";

	const install = `pnpm add @yaebal/panel`;

	const fullSetup = `import { Bot } from "@yaebal/core";
import { MemoryPanelStore, recorder, panelHandler } from "@yaebal/panel";
import { serve } from "@yaebal/panel/serve";

const bot = new Bot(token);
const store = new MemoryPanelStore();

// 1. attach the recorder plugin — logs incoming private messages to the store
bot.install(recorder(store));

bot.start();

// 2. serve the panel — a fetch handler: (Request) => Promise<Response>
const handler = panelHandler(bot.api, store, { token: process.env.PANEL_TOKEN! });
serve(handler, { port: 8080 });

// open http://localhost:8080 and paste your token on the login screen`;

	const mounting = `// node 20+ — \`serve\` ships in the box (native node:http, no deps)
import { serve } from "@yaebal/panel/serve";
serve(handler, { port: 8080, onListen: ({ port }) => console.log(\`panel on :\${port}\`) });

// bun
Bun.serve({ port: 8080, fetch: handler });

// deno
Deno.serve({ port: 8080 }, handler);

// hono / any fetch framework — pair with basePath: "/panel"
app.all("/panel/*", (c) => handler(c.req.raw));

// cloudflare workers / deno deploy / vercel edge — same handler, no port
export default { fetch: handler };`;

	const options = `panelHandler(bot.api, store, {
  token: process.env.PANEL_TOKEN!,           // required shared secret
  basePath: "/panel",                        // mount under a sub-path (default: root)
  cors: "https://ops.example",               // allow a browser origin (or a list, or "*")
  rateLimit: { max: 10, windowMs: 60_000 },  // throttle failed auth (default); false to disable
});`;

	const sqlite = `import { SqlitePanelStore } from "@yaebal/panel/sqlite";

// persistent store on node's native node:sqlite — zero extra deps
const store = new SqlitePanelStore({ path: "./panel.db" }); // or ":memory:"

bot.install(recorder(store));
const handler = panelHandler(bot.api, store, { token: process.env.PANEL_TOKEN! });`;

	const customStore = `import type { PanelStore, PanelChat, PanelMessage, HistoryOptions, PanelEvent } from "@yaebal/panel";

// implement PanelStore for persistence (redis, postgres, …)
class MyPersistentStore implements PanelStore {
  async record(chat: { id: number; name?: string }, message: PanelMessage) {
    await db.messages.insert({ chatId: chat.id, ...message });
  }
  async chats(): Promise<PanelChat[]> {
    return db.chats.findAll({ orderBy: "lastDate desc" });
  }
  async history(chatId: number, opts?: HistoryOptions): Promise<PanelMessage[]> {
    return db.messages.page({ chatId, before: opts?.before, limit: opts?.limit });
  }
  // optional — enables the realtime SSE stream; omit it and the UI just polls
  subscribe(listener: (e: PanelEvent) => void) {
    return bus.on("record", listener); // returns an unsubscribe fn
  }
}`;

	const outgoing = `import { recordOutgoing } from "@yaebal/panel";

// recorder only sees incoming updates. to also log replies the bot sends elsewhere
// (e.g. ctx.reply(...) in your handlers), hook the api — and stop the panel from
// recording its own sends so they aren't logged twice:
recordOutgoing(bot.api, store);
const handler = panelHandler(bot.api, store, {
  token: process.env.PANEL_TOKEN!,
  recordSends: false,
});`;

	const apiRoutes = `// routes are relative to basePath (default root). all but the page require the token.
GET  /                       → login + chat SPA (public)
GET  /api/chats              → PanelChat[]  (sorted by lastDate desc)
GET  /api/chats/:id          → PanelMessage[]   (?before=&limit= to page)
GET  /api/stream             → text/event-stream of record events
GET  /api/file?id=<file_id>  → proxied file bytes (getFile + stream)
POST /api/chats/:id/send     → json { text, … }        → sendMessage
                               multipart { file, caption? } → sendPhoto / sendDocument / …`;
</script>

<svelte:head>
	<title>@yaebal/panel — yaebal</title>
</svelte:head>

<h1>@yaebal/panel</h1>
<p class="lead">
	an operator panel: view incoming private-chat messages and reply from the browser, live. ships as
	a self-contained fetch handler — mount it on any http framework. the <code>recorder()</code>
	plugin feeds a store; <code>panelHandler()</code> serves the login + chat UI and a small REST API.
</p>

<ul>
	<li><strong>login page</strong> on the panel root — paste your token, no secrets in the url</li>
	<li><strong>realtime</strong> updates over server-sent events, with a polling safety net</li>
	<li><strong>media</strong>: photos, docs, voice, video and albums — both directions, in the browser</li>
	<li><strong>persistence</strong> via a pluggable <code>PanelStore</code> (in-memory + sqlite included)</li>
	<li>CORS, basePath mounting and failed-auth rate limiting</li>
</ul>

<h2>installation</h2>
<Code code={install} lang="sh" title="terminal" />

<h2>quick start</h2>
<p>three moving parts: a <strong>store</strong>, the <strong>recorder plugin</strong>, and the <strong>panel handler</strong>.</p>
<Code code={fullSetup} title="server.ts" />
<p>
	the panel root serves a small SPA: a centered login (token input + <strong>authorize</strong>
	button), then the live chat view. the token is kept in <code>sessionStorage</code> and sent as an
	<code>Authorization: Bearer</code> header — it never rides in the page url.
</p>

<h2>mounting</h2>
<p>
	<code>panelHandler</code> returns a plain <code>(Request) =&gt; Promise&lt;Response&gt;</code> — it
	binds no port of its own. <code>serve</code> is a separate entry (<code>@yaebal/panel/serve</code>)
	so the main module stays free of <code>node:</code> imports for edge bundles.
</p>
<Code code={mounting} title="mounting.ts" />

<h2>options</h2>
<Code code={options} title="options.ts" />
<p>
	<code>basePath</code> — the UI builds its api urls from this, so no extra rewriting is needed under
	a prefix. <code>rateLimit</code> — after <code>max</code> bad tokens within <code>windowMs</code> a
	client gets <code>429</code> with <code>Retry-After</code>; keyed by <code>x-forwarded-for</code> /
	<code>x-real-ip</code> by default, override with <code>clientKey</code>.
</p>

<h2>persistence</h2>
<p>
	<code>MemoryPanelStore</code> is the default — up to 1000 messages per chat, lost on restart. a
	sqlite-backed store built on node's native <code>node:sqlite</code> ships in the box:
</p>
<Code code={sqlite} title="sqlite.ts" />
<p>or implement <code>PanelStore</code> against your own database:</p>
<Code code={customStore} title="store.ts" />
<p>
	<code>subscribe</code> is what powers the SSE stream — a store without it still works, the UI just
	falls back to polling every few seconds.
</p>

<h2>what the recorder captures</h2>
<p>
	incoming <em>private-chat</em> messages only. text and captions are stored verbatim; a message
	with no text is logged as a <code>[photo]</code> / <code>[document]</code> / <code>[voice]</code> /
	… placeholder so the conversation stays readable. group messages are passed through unchanged.
	replies sent from the panel are recorded with <code>direction: "out"</code> and accept
	<code>text</code> plus optional <code>parse_mode</code>, <code>reply_to_message_id</code> and
	<code>reply_parameters</code>, forwarded to <code>sendMessage</code>.
</p>
<p>
	to also capture replies the bot sends <em>outside</em> the panel, hook the api with
	<code>recordOutgoing</code> and disable the panel's own send-recording to avoid duplicates:
</p>
<Code code={outgoing} title="outgoing.ts" />

<h2>media</h2>
<p>
	photos, documents, voice notes, video and <strong>albums</strong> flow both ways. the recorder
	stores each attachment's <code>file_id</code> (and album id); the browser renders them inline —
	images, <code>&lt;video&gt;</code>, <code>&lt;audio&gt;</code>, or a download link for documents —
	and consecutive messages sharing a <code>media_group_id</code> show as one album. the
	<strong>📎</strong> button in the composer uploads a file, and the panel picks
	<code>sendPhoto</code> / <code>sendVideo</code> / <code>sendVoice</code> / <code>sendDocument</code>
	from its mime type.
</p>
<p>
	media bytes are <strong>proxied</strong> through <code>GET /api/file?id=…</code> (the panel calls
	<code>getFile</code> and streams the result) so the bot token never reaches the browser. this needs
	an api with <code>call()</code> / <code>fileUrl()</code> — the real <code>@yaebal/core</code> Api
	has both; without them, media routes answer <code>501</code> and text still works.
</p>

<h2>api routes</h2>
<Code code={apiRoutes} lang="text" title="routes" />

<h2>api</h2>
<table>
	<thead>
		<tr><th>export</th><th>from</th><th>kind</th><th>description</th></tr>
	</thead>
	<tbody>
		<tr><td><code>panelHandler(api, store, options)</code></td><td><code>@yaebal/panel</code></td><td>function</td><td>returns a <code>(Request) =&gt; Promise&lt;Response&gt;</code> handler</td></tr>
		<tr><td><code>recorder(store)</code></td><td><code>@yaebal/panel</code></td><td>Plugin</td><td>logs incoming private text/media into the store</td></tr>
		<tr><td><code>recordOutgoing(api, store)</code></td><td><code>@yaebal/panel</code></td><td>function</td><td>logs outgoing replies sent outside the panel (api <code>after</code> hook)</td></tr>
		<tr><td><code>MemoryPanelStore</code></td><td><code>@yaebal/panel</code></td><td>class</td><td>in-memory <code>PanelStore</code> with <code>subscribe</code></td></tr>
		<tr><td><code>SqlitePanelStore</code></td><td><code>@yaebal/panel/sqlite</code></td><td>class</td><td>persistent store on <code>node:sqlite</code></td></tr>
		<tr><td><code>serve(handler, options)</code></td><td><code>@yaebal/panel/serve</code></td><td>function</td><td>native <code>node:http</code> server, zero deps</td></tr>
		<tr><td><code>PanelStore</code></td><td><code>@yaebal/panel</code></td><td>interface</td><td><code>record</code> / <code>chats</code> / <code>history</code> (+ optional <code>subscribe</code>)</td></tr>
		<tr><td><code>PanelOptions</code></td><td><code>@yaebal/panel</code></td><td>interface</td><td><code>token</code>, <code>basePath</code>, <code>cors</code>, <code>rateLimit</code>, <code>clientKey</code></td></tr>
		<tr><td><code>HistoryOptions</code></td><td><code>@yaebal/panel</code></td><td>interface</td><td><code>{"{ before?: number; limit?: number }"}</code></td></tr>
		<tr><td><code>PanelAttachment</code></td><td><code>@yaebal/panel</code></td><td>interface</td><td><code>{"{ type, fileId, fileName?, mimeType? }"}</code></td></tr>
		<tr><td><code>PanelEvent</code></td><td><code>@yaebal/panel</code></td><td>interface</td><td><code>{"{ type: 'record'; chatId: number; direction }"}</code></td></tr>
		<tr><td><code>PANEL_HTML</code></td><td><code>@yaebal/panel</code></td><td>string</td><td>the raw HTML of the panel UI (exported for custom serving)</td></tr>
	</tbody>
</table>

<div class="note">
	the panel HTML is a single self-contained page — no external assets, no CDN. it updates in
	realtime over SSE and falls back to polling. for a production deployment, put the panel behind a
	reverse proxy with TLS and restrict the <code>token</code> to a long random value.
</div>
