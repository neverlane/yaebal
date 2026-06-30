<script lang="ts">
	import Code from "$lib/Code.svelte";

	const install = `pnpm add @yaebal/panel`;

	const yaebalSetup = `import { Bot } from "@yaebal/core";
import { MemoryPanelStore, panelHandler, recordOutgoing, recorder } from "@yaebal/panel";
import { serve } from "@yaebal/panel/serve";

const bot = new Bot(process.env.BOT_TOKEN!);
const store = new MemoryPanelStore();

bot.install(recorder(store));
recordOutgoing(bot.api, store);

const handler = panelHandler(bot.api, store, {
  token: process.env.PANEL_TOKEN!,
  recordSends: false,
});

serve(handler, { port: 8080 });
bot.start();`;

	const frameworkSetup = `import {
  MemoryPanelStore,
  createPanelApi,
  panelHandler,
  recordTelegramUpdate,
} from "@yaebal/panel";
import { serve } from "@yaebal/panel/serve";

const store = new MemoryPanelStore();
const panelApi = createPanelApi(process.env.BOT_TOKEN!);

// call this from your framework middleware for every raw Telegram update
await recordTelegramUpdate(store, rawTelegramUpdate);

const handler = panelHandler(panelApi, store, { token: process.env.PANEL_TOKEN! });
serve(handler, { port: 8080 });`;

	const grammy = `import { Bot } from "grammy";
import { MemoryPanelStore, createPanelApi, panelHandler, recordTelegramUpdate } from "@yaebal/panel";

const bot = new Bot(process.env.BOT_TOKEN!);
const store = new MemoryPanelStore();

bot.use(async (ctx, next) => {
  await recordTelegramUpdate(store, ctx.update);
  await next();
});

const handler = panelHandler(createPanelApi(process.env.BOT_TOKEN!), store, {
  token: process.env.PANEL_TOKEN!,
});`;

	const gramio = `import { Bot } from "gramio";
import { MemoryPanelStore, createPanelApi, panelHandler, recordTelegramUpdate } from "@yaebal/panel";

const bot = new Bot(process.env.BOT_TOKEN!);
const store = new MemoryPanelStore();

bot.use(async (ctx, next) => {
  await recordTelegramUpdate(store, ctx.update);
  return next();
});

const handler = panelHandler(createPanelApi(process.env.BOT_TOKEN!), store, {
  token: process.env.PANEL_TOKEN!,
});`;

	const puregram = `import { Telegram } from "puregram";
import { MemoryPanelStore, createPanelApi, panelHandler, recordTelegramUpdate } from "@yaebal/panel";

const telegram = new Telegram({ token: process.env.BOT_TOKEN! });
const store = new MemoryPanelStore();

telegram.updates.use(async (ctx, next) => {
  await recordTelegramUpdate(store, ctx.update);
  return next();
});

const handler = panelHandler(createPanelApi(process.env.BOT_TOKEN!), store, {
  token: process.env.PANEL_TOKEN!,
});`;

	const mounting = `// node 20+, native node:http helper
import { serve } from "@yaebal/panel/serve";
serve(handler, { port: 8080 });

// bun
Bun.serve({ port: 8080, fetch: handler });

// deno
Deno.serve({ port: 8080 }, handler);

// hono / any fetch framework, pair with basePath: "/panel"
app.all("/panel/*", (c) => handler(c.req.raw));

// cloudflare workers / deno deploy / vercel edge
export default { fetch: handler };`;

	const options = `panelHandler(api, store, {
  token: process.env.PANEL_TOKEN!,
  basePath: "/panel",
  cors: "https://ops.example",
  rateLimit: { max: 10, windowMs: 60_000 },
  clientKey: (req) => req.headers.get("x-real-ip") ?? "shared",
  recordSends: true,
});`;

	const sqlite = `import { SqlitePanelStore } from "@yaebal/panel/sqlite";

const store = new SqlitePanelStore({ path: "./panel.db" });`;

	const customStore = `import type { PanelStore, PanelChat, PanelChatRecord, PanelMessage, HistoryOptions, PanelEvent } from "@yaebal/panel";

class MyPersistentStore implements PanelStore {
  async record(chat: PanelChatRecord, message: PanelMessage) {
    await db.messages.insert({ chatId: chat.id, ...chat, ...message });
  }

  async chats(): Promise<PanelChat[]> {
    return db.chats.findAll({ orderBy: "lastDate desc" });
  }

  async history(chatId: number, opts?: HistoryOptions): Promise<PanelMessage[]> {
    return db.messages.page({ chatId, before: opts?.before, limit: opts?.limit });
  }

  subscribe(listener: (e: PanelEvent) => void) {
    return bus.on("record", listener);
  }
}`;

	const outgoing = `import { recordOutgoing } from "@yaebal/panel";

recordOutgoing(bot.api, store);

const handler = panelHandler(bot.api, store, {
  token: process.env.PANEL_TOKEN!,
  recordSends: false,
});`;

	const apiRoutes = `GET  /                       -> login + chat SPA (public)
GET  /api/chats              -> PanelChat[]
GET  /api/chats/:id          -> PanelMessage[] (?before=&limit=)
GET  /api/stream             -> text/event-stream of record events
GET  /api/file?id=<file_id>  -> proxied file bytes
POST /api/chats/:id/send     -> json { text, reply_markup?, ... } or multipart { file, caption?, type? }`;
</script>

<svelte:head>
	<title>@yaebal/panel — yaebal</title>
</svelte:head>

<h1>@yaebal/panel</h1>
<p class="lead">
	framework-agnostic operator panel for Telegram bots. it records private-chat updates, shows a
	polished browser inbox, and lets operators reply with text or media. the panel is just a
	<code>fetch</code> handler, so it mounts on any HTTP runtime or framework.
</p>

<ul>
	<li><strong>framework-neutral</strong> recording with <code>recordTelegramUpdate(store, update)</code></li>
	<li><strong>SVG-only UI</strong> with avatars, identity sidebar, media captions and text previews</li>
	<li><strong>Bot API coverage</strong> for media, albums, keyboards, callbacks, reactions, polls and member events</li>
	<li><strong>media viewer</strong>, styled voice cards, styled video cards and document cards</li>
	<li><strong>runtime-neutral</strong> <code>panelHandler</code> plus Node <code>serve</code> and sqlite side entries</li>
</ul>

<h2>installation</h2>
<Code code={install} lang="sh" title="terminal" />

<h2>yaebal setup</h2>
<p>
	use the yaebal plugin recorder when the bot itself is yaebal. add <code>recordOutgoing</code> if
	you want replies sent by normal handlers to appear in the panel too.
</p>
<Code code={yaebalSetup} title="yaebal-panel.ts" />

<h2>framework-agnostic setup</h2>
<p>
	for grammY, GramIO, puregram or anything else, keep your existing bot. pass raw Telegram
	updates to <code>recordTelegramUpdate</code>, and use <code>createPanelApi(token)</code> for panel
	sends, media proxying and operator uploads.
</p>
<Code code={frameworkSetup} title="panel.ts" />

<h3>grammY</h3>
<Code code={grammy} title="grammy.ts" />

<h3>GramIO</h3>
<Code code={gramio} title="gramio.ts" />

<h3>puregram</h3>
<Code code={puregram} title="puregram.ts" />

<p>
	Other frameworks follow the same rule: if you can access the raw Telegram update, call
	<code>recordTelegramUpdate(store, update)</code>. if you cannot, write directly to
	<code>store.record()</code> with <code>PanelChatRecord</code> and <code>PanelMessage</code>.
</p>

<h2>mounting</h2>
<p>
	<code>panelHandler</code> returns <code>(Request) =&gt; Promise&lt;Response&gt;</code>. it binds no port,
	so the same handler works on Node, Bun, Deno, edge runtimes and fetch-compatible frameworks.
</p>
<Code code={mounting} title="mounting.ts" />

<h2>options</h2>
<Code code={options} title="options.ts" />
<p>
	<code>basePath</code> makes the SPA build API URLs under a prefix. <code>rateLimit</code> throttles
	failed auth attempts and sends <code>429</code> with <code>Retry-After</code>. <code>recordSends</code>
	controls whether panel-originated sends are written to the store by the handler itself.
</p>

<h2>persistence</h2>
<p>
	<code>MemoryPanelStore</code> keeps up to 1000 messages per chat and is lost on restart.
	<code>SqlitePanelStore</code> uses Node's built-in <code>node:sqlite</code> and persists identity,
	preview metadata, keyboards, attachments and events.
</p>
<Code code={sqlite} title="sqlite.ts" />
<p>or implement <code>PanelStore</code> against your own database:</p>
<Code code={customStore} title="store.ts" />

<h2>what gets recorded</h2>
<ul>
	<li>private message text and captions</li>
	<li>photos, videos, animations, audio, voice, video notes, documents, stickers and albums</li>
	<li>inline and reply keyboards attached to messages</li>
	<li>callback queries as timeline event rows</li>
	<li>message reactions, reaction counts, poll answers and private member-status changes</li>
	<li>outgoing <code>send*</code> results when <code>recordOutgoing</code> is installed</li>
</ul>
<Code code={outgoing} title="outgoing.ts" />

<h2>media and UI</h2>
<p>
	media bytes are proxied through <code>GET /api/file?id=...</code>, so the bot token never reaches
	the browser. operator uploads use <code>sendPhoto</code>, <code>sendVideo</code>, <code>sendVoice</code>,
	<code>sendAudio</code> or <code>sendDocument</code> based on MIME type. the UI renders media previews
	in the sidebar, opens photos/videos in a viewer dialog, groups albums, and uses dedicated voice,
	video and document cards in the message timeline.
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
		<tr><td><code>createPanelApi(token)</code></td><td><code>@yaebal/panel</code></td><td>function</td><td>Bot API client satisfying <code>PanelApi</code>, including uploads and file URLs</td></tr>
		<tr><td><code>recordTelegramUpdate(store, update)</code></td><td><code>@yaebal/panel</code></td><td>function</td><td>framework-neutral raw update recorder</td></tr>
		<tr><td><code>recorder(store)</code></td><td><code>@yaebal/panel</code></td><td>Plugin</td><td>YAEBAL middleware wrapper around <code>recordTelegramUpdate</code></td></tr>
		<tr><td><code>recordOutgoing(api, store)</code></td><td><code>@yaebal/panel</code></td><td>function</td><td>logs successful outgoing <code>send*</code> results</td></tr>
		<tr><td><code>MemoryPanelStore</code></td><td><code>@yaebal/panel</code></td><td>class</td><td>in-memory <code>PanelStore</code> with SSE subscriptions</td></tr>
		<tr><td><code>SqlitePanelStore</code></td><td><code>@yaebal/panel/sqlite</code></td><td>class</td><td>persistent store on <code>node:sqlite</code>; requires Node >= 22.5</td></tr>
		<tr><td><code>serve(handler, options)</code></td><td><code>@yaebal/panel/serve</code></td><td>function</td><td>native <code>node:http</code> server helper</td></tr>
		<tr><td><code>PanelApi</code></td><td><code>@yaebal/panel</code></td><td>interface</td><td><code>sendMessage</code>, optional <code>call</code> and <code>fileUrl</code></td></tr>
		<tr><td><code>PanelStore</code></td><td><code>@yaebal/panel</code></td><td>interface</td><td><code>record</code>, <code>chats</code>, <code>history</code>, optional <code>subscribe</code></td></tr>
		<tr><td><code>PanelChatRecord</code></td><td><code>@yaebal/panel</code></td><td>interface</td><td>chat id plus optional name, first name, last name and username</td></tr>
		<tr><td><code>PanelMessage</code></td><td><code>@yaebal/panel</code></td><td>interface</td><td>text, date, direction, attachments, media group, keyboard and event metadata</td></tr>
		<tr><td><code>PanelKeyboard</code></td><td><code>@yaebal/panel</code></td><td>interface</td><td>inline/reply keyboard preview rows</td></tr>
		<tr><td><code>PanelMessageEvent</code></td><td><code>@yaebal/panel</code></td><td>interface</td><td>callback, reaction, poll and member event metadata</td></tr>
	</tbody>
</table>

<div class="note">
	the panel HTML is a single self-contained page with inline SVG icons and no external assets.
	for production, serve it behind TLS and use a long random <code>PANEL_TOKEN</code>. SQLite uses
	Node's built-in <code>node:sqlite</code>, so <code>@yaebal/panel/sqlite</code> requires Node >= 22.5.
</div>
