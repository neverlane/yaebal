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

	const multiOperator = `const handler = panelHandler(bot.api, store, {
  operators: [
    { name: "alice", token: process.env.ALICE_TOKEN! },
    { name: "bob", token: process.env.BOB_TOKEN! },
  ],
});`;

	const handoffSetup = `import { handoff, recorder } from "@yaebal/panel";

bot.install(recorder(store));
bot.install(handoff(store)); // must come before your reply handlers
bot.on("message:text", (ctx) => ctx.reply("..."));`;

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

	const scoping = `bot.install(recorder(store, { chats: "all" }));
// or a predicate:
bot.install(recorder(store, { chats: (chat) => chat.type !== "channel" }));`;

	const mounting = `// node 20+, native node:http helper (streams SSE properly)
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
  token: process.env.PANEL_TOKEN!,          // or \`operators: [...]\`
  basePath: "/panel",
  cors: "https://ops.example",              // "*" disables session cookies in browsers
  rateLimit: { max: 10, windowMs: 60_000 },
  clientKey: (req) => req.headers.get("x-real-ip") ?? "shared",
  trustProxy: false,                        // only set true behind a proxy you control
  recordSends: true,
  maxUploadBytes: 50 * 1024 * 1024,
  sessionTtlMs: 12 * 60 * 60 * 1000,
  cannedResponses: [{ label: "Hours", text: "We're open 9-5 UTC." }],
  notifyChatId: process.env.ADMIN_CHAT_ID,  // telegram DM'd when idle
  onError: (error, context) => console.error(\`panel:\${context}\`, error),
});`;

	const sqlite = `import { SqlitePanelStore } from "@yaebal/panel/sqlite";

const store = new SqlitePanelStore({ path: "./panel.db" }); // FTS5 search, Node 22.5+`;

	const sklad = `import { MemoryStorage } from "@yaebal/sklad"; // or redisStorage/kvStorage/sqliteStorage
import { skladPanelStore } from "@yaebal/panel/sklad";

const store = skladPanelStore(new MemoryStorage()); // edge runtimes, no node:sqlite needed`;

	const customStore = `import type { PanelStore, PanelChat, PanelChatRecord, PanelMessage, HistoryOptions, PanelEvent } from "@yaebal/panel";

class MyPersistentStore implements PanelStore {
  async record(chat: PanelChatRecord, message: PanelMessage) {
    await db.messages.insert({ chatId: chat.id, ...chat, ...message });
  }

  async chats(options?: { status?: string; limit?: number; offset?: number }) {
    return db.chats.findAll({ orderBy: "lastDate desc", ...options });
  }

  async history(chatId: number, opts?: HistoryOptions): Promise<PanelMessage[]> {
    return db.messages.page({ chatId, before: opts?.before, beforeSeq: opts?.beforeSeq, limit: opts?.limit });
  }

  async status(chatId: number) { return (await db.chats.find(chatId))?.status; }
  async setStatus(chatId: number, status: PanelChatStatus) { await db.chats.update(chatId, { status }); }
  async assign(chatId: number, operator: string | null) { await db.chats.update(chatId, { assignedTo: operator }); }
  async pin(chatId: number, pinned: boolean) { await db.chats.update(chatId, { pinned }); }
  async markRead(chatId: number) { await db.chats.update(chatId, { unread: 0 }); }
  async updateMessage(chatId: number, messageId: number, patch: MessagePatch) { await db.messages.patch(chatId, messageId, patch); }
  async deleteChat(chatId: number) { await db.chats.delete(chatId); }

  subscribe(listener: (e: PanelEvent) => void) {
    return bus.on("panel-event", listener);
  }
}`;

	const outgoing = `import { recordOutgoing } from "@yaebal/panel";

recordOutgoing(bot.api, store);

const handler = panelHandler(bot.api, store, {
  token: process.env.PANEL_TOKEN!,
  recordSends: false,
});`;

	const apiRoutes = `GET    /                                        -> login + chat SPA (public)
POST   {base}/api/login                         -> { token } -> Set-Cookie session; { operator }
POST   {base}/api/logout                        -> clear the session
GET    {base}/api/session                        -> { operator } or 401
GET    {base}/api/chats                          -> PanelChat[]  (?status=&limit=&offset=)
GET    {base}/api/chats/:id                      -> PanelMessage[] (?before=&beforeSeq=&limit=); marks read
GET    {base}/api/chats/:id/export               -> conversation dump (?format=json|text)
DELETE {base}/api/chats/:id                      -> delete the chat + its history
POST   {base}/api/chats/:id/status               -> { status: "open"|"handled"|"archived" }
POST   {base}/api/chats/:id/assign               -> { operator: string | null }
POST   {base}/api/chats/:id/pin                  -> { pinned: boolean }
POST   {base}/api/chats/:id/typing               -> best-effort sendChatAction("typing")
POST   {base}/api/chats/:id/send                 -> json { text, replyToId?, reply_markup?, ... } or multipart { file, caption?, type? }
POST   {base}/api/chats/:id/messages/:msgId/edit   -> { text } -> editMessageText
POST   {base}/api/chats/:id/messages/:msgId/delete -> deleteMessage (soft-deletes in the store)
GET    {base}/api/search                         -> ?q=&chatId=&limit= -> PanelSearchResult[]
GET    {base}/api/canned                         -> configured canned-response templates
GET    {base}/api/stream                         -> text/event-stream of store events
GET    {base}/api/file?id=<file_id>              -> proxied file bytes`;
</script>

<svelte:head>
	<title>@yaebal/panel — yaebal</title>
</svelte:head>

<h1>@yaebal/panel</h1>
<p class="lead">
	framework-agnostic operator panel for Telegram bots. it records private-chat updates, shows a
	polished browser inbox, and lets operators hand a conversation off from the bot, reply, edit or
	delete a message, search across every chat, and export a conversation. the panel is just a
	<code>fetch</code> handler, so it mounts on any HTTP runtime or framework.
</p>

<ul>
	<li><strong>cookie-session auth</strong>, multi-operator, with an audit trail on every panel-sent message</li>
	<li><strong>handoff</strong>: <code>handoff(store)</code> mutes the bot's own handlers once an operator marks a chat handled</li>
	<li><strong>reply / edit / delete</strong> any message, full-text <strong>search</strong>, one-click <strong>export</strong></li>
	<li>chat <strong>status</strong>, <strong>unread</strong> counts, <strong>assign</strong>, <strong>pin</strong>, canned responses, typing indicator</li>
	<li><strong>runtime-neutral</strong> <code>panelHandler</code> plus Node <code>serve</code>, <code>sqlite</code> and <code>sklad</code> store entries</li>
</ul>

<div class="note">
	upgrading from 0.0.x? this release breaks the api — see <a href="#breaking-changes">breaking changes</a> below.
</div>

<h2>installation</h2>
<Code code={install} lang="sh" title="terminal" />

<h2>yaebal setup</h2>
<p>
	use the yaebal plugin recorder when the bot itself is yaebal. add <code>recordOutgoing</code> if
	you want replies sent by normal handlers to appear in the panel too. open the panel and enter
	<code>PANEL_TOKEN</code> — the browser exchanges it once for an <code>HttpOnly</code> session
	cookie, so the token itself never appears in a url.
</p>
<Code code={yaebalSetup} title="yaebal-panel.ts" />

<h2>multiple operators + audit trail</h2>
<p>
	pass <code>operators</code> instead of a single <code>token</code> to give each operator their
	own login. every panel-sent message is recorded with <code>PanelMessage.operator</code> set to
	whoever sent it, and <code>assign(chatId, operator)</code> tracks who owns a conversation.
</p>
<Code code={multiOperator} title="multi-operator.ts" />

<h2>handoff: let an operator take over from the bot</h2>
<p>
	install <code>handoff(store)</code> before your reply handlers. once an operator marks a chat
	<code>"handled"</code> in the panel, the guard short-circuits the chain and the bot goes quiet
	for that chat until it's released back to <code>"open"</code> (or archived).
</p>
<Code code={handoffSetup} title="handoff.ts" />

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

<h3>recording group/channel chats too</h3>
<p>
	<code>recorder</code>/<code>recordTelegramUpdate</code> only log <strong>private</strong> chats
	by default — the panel is an operator inbox for support-style conversations. pass
	<code>chats</code> to widen that.
</p>
<Code code={scoping} title="scoping.ts" />

<h2>mounting</h2>
<p>
	<code>panelHandler</code> returns <code>(Request) =&gt; Promise&lt;Response&gt;</code>. it binds no port,
	so the same handler works on Node, Bun, Deno, edge runtimes and fetch-compatible frameworks. if
	you mount on something other than <code>@yaebal/panel/serve</code>, make sure it streams
	<code>Response</code> bodies chunk-by-chunk — SSE requires it.
</p>
<Code code={mounting} title="mounting.ts" />

<h2>options</h2>
<Code code={options} title="options.ts" />
<p>
	<code>basePath</code> makes the SPA build API URLs under a prefix. <code>rateLimit</code> throttles
	failed auth *guesses*; a request presenting no credential at all (e.g. an expired session's
	<code>EventSource</code> reconnecting) never counts against it, so a stale session can't lock an
	operator out of logging back in. <code>trustProxy</code> defaults to <code>false</code> — only
	trust <code>x-forwarded-for</code>/<code>x-forwarded-proto</code> behind a proxy you control.
	<code>recordSends</code> controls whether panel-originated sends are written to the store by the
	handler itself.
</p>

<h2>persistence</h2>
<p>
	<code>MemoryPanelStore</code> keeps up to 1000 messages per chat and is lost on restart.
	<code>SqlitePanelStore</code> uses Node's built-in <code>node:sqlite</code>, persists identity,
	status, assignment, edits and deletions, and backs <code>search()</code> with FTS5 when available.
</p>
<Code code={sqlite} title="sqlite.ts" />
<p>
	<code>skladPanelStore</code> bridges any <code>@yaebal/sklad</code> <code>StorageAdapter</code> —
	Redis, Cloudflare KV, a flat file, or <code>MemoryStorage</code> — for edge runtimes or anywhere
	<code>node:sqlite</code> isn't available. it read-modifies-writes on every record, correct for a
	single bot process, same as every other yaebal plugin's sklad integration.
</p>
<Code code={sklad} title="sklad-store.ts" />
<p>or implement <code>PanelStore</code> against your own database:</p>
<Code code={customStore} title="store.ts" />

<h2>what gets recorded</h2>
<ul>
	<li>private message text and captions (widen with <code>recorder(store, {`{ chats }`})</code>)</li>
	<li>photos, videos, animations, audio, voice, video notes, documents, stickers and albums</li>
	<li>inline and reply keyboards attached to messages</li>
	<li>callback queries, message reactions, reaction counts, poll answers, member-status changes</li>
	<li>edits (<code>edited_message</code>) patch the existing row instead of duplicating it</li>
	<li>outgoing <code>send*</code> results when <code>recordOutgoing</code> is installed, and every reply, edit or delete made from the panel, stamped with the sending operator's name</li>
</ul>
<Code code={outgoing} title="outgoing.ts" />

<h2>media and UI</h2>
<p>
	media bytes are proxied through <code>GET /api/file?id=...</code> (cookie-authenticated, no token
	in the url), so the bot token never reaches the browser. operator uploads use
	<code>sendPhoto</code>, <code>sendVideo</code>, <code>sendVoice</code>, <code>sendAudio</code> or
	<code>sendDocument</code> based on MIME type, capped at <code>maxUploadBytes</code>. the UI renders
	media previews in the sidebar, opens photos/videos in a viewer dialog, groups albums, and updates
	the open conversation incrementally — new messages, edits and deletions patch in place without
	ever wiping out an operator's unsent draft.
</p>

<h2>security model</h2>
<ul>
	<li>the shared secret is exchanged once at <code>POST /api/login</code> for an <code>HttpOnly</code>, <code>SameSite=Strict</code> session cookie — never placed in a url, including the SSE stream and media loads.</li>
	<li><code>X-Frame-Options: DENY</code> and <code>frame-ancestors 'none'</code> block clickjacking; keyboard button urls are restricted to <code>http(s):</code>/<code>tg:</code> schemes, since <code>PanelStore.record</code> is a public interface any adapter can write to.</li>
	<li>the inline <code>&lt;script&gt;</code> still runs under <code>script-src 'unsafe-inline'</code> — the single-file, zero-build-step UI is the point of this package. put the panel behind its own network-level auth (a VPN, an IP allowlist) if that tradeoff doesn't fit your threat model.</li>
</ul>

<h2>api routes</h2>
<Code code={apiRoutes} lang="text" title="routes" />

<h2 id="breaking-changes">breaking changes from 0.0.x</h2>
<ul>
	<li><strong>auth</strong>: the panel authenticates via session cookie from <code>POST /api/login</code>, not a <code>?token=</code> query parameter. <code>token</code> still works for a single operator; <code>operators</code> is new.</li>
	<li><strong><code>PanelStore</code></strong> gained required methods: <code>status</code>, <code>setStatus</code>, <code>assign</code>, <code>pin</code>, <code>markRead</code>, <code>updateMessage</code>, <code>deleteChat</code>, plus optional <code>search</code>. <code>chats()</code> now takes options.</li>
	<li><strong><code>HistoryOptions</code></strong> gained <code>beforeSeq</code> — pass it alongside <code>before</code> when paginating, or same-second messages can be dropped.</li>
	<li><strong><code>PanelEvent</code></strong> is now a discriminated union (<code>record</code> | <code>status</code> | <code>read</code> | <code>chat</code> | <code>deleted</code>).</li>
	<li><strong><code>recordTelegramUpdate</code>/<code>recorder</code></strong> take an options bag (<code>{`{ chats }`}</code>).</li>
</ul>

<h2>api</h2>
<table>
	<thead>
		<tr><th>export</th><th>from</th><th>kind</th><th>description</th></tr>
	</thead>
	<tbody>
		<tr><td><code>panelHandler(api, store, options)</code></td><td><code>@yaebal/panel</code></td><td>function</td><td>returns a <code>(Request) =&gt; Promise&lt;Response&gt;</code> handler</td></tr>
		<tr><td><code>createPanelApi(token)</code></td><td><code>@yaebal/panel</code></td><td>function</td><td>Bot API client satisfying <code>PanelApi</code>, including uploads and file URLs</td></tr>
		<tr><td><code>recordTelegramUpdate(store, update, options?)</code></td><td><code>@yaebal/panel</code></td><td>function</td><td>framework-neutral raw update recorder; <code>{`{ chats }`}</code> scopes which chats to log</td></tr>
		<tr><td><code>recorder(store, options?)</code></td><td><code>@yaebal/panel</code></td><td>Plugin</td><td>YAEBAL middleware wrapper around <code>recordTelegramUpdate</code></td></tr>
		<tr><td><code>handoff(store, options?)</code></td><td><code>@yaebal/panel</code></td><td>Plugin</td><td>suppresses the bot's own handlers on chats marked <code>"handled"</code></td></tr>
		<tr><td><code>recordOutgoing(api, store, options?)</code></td><td><code>@yaebal/panel</code></td><td>function</td><td>logs successful outgoing <code>send*</code> results</td></tr>
		<tr><td><code>MemoryPanelStore</code></td><td><code>@yaebal/panel</code></td><td>class</td><td>in-memory <code>PanelStore</code> with SSE subscriptions</td></tr>
		<tr><td><code>SqlitePanelStore</code></td><td><code>@yaebal/panel/sqlite</code></td><td>class</td><td>persistent store on <code>node:sqlite</code> with FTS5 search; requires Node >= 22.5</td></tr>
		<tr><td><code>skladPanelStore(adapter, options?)</code></td><td><code>@yaebal/panel/sklad</code></td><td>function</td><td>persistent store on any <code>@yaebal/sklad</code> <code>StorageAdapter</code></td></tr>
		<tr><td><code>serve(handler, options)</code></td><td><code>@yaebal/panel/serve</code></td><td>function</td><td>native <code>node:http</code> server helper, streams SSE correctly</td></tr>
		<tr><td><code>PanelApi</code></td><td><code>@yaebal/panel</code></td><td>interface</td><td><code>sendMessage</code>, optional <code>call</code> and <code>fileUrl</code></td></tr>
		<tr><td><code>PanelStore</code></td><td><code>@yaebal/panel</code></td><td>interface</td><td><code>record</code>, <code>chats</code>, <code>history</code>, <code>status</code>, <code>setStatus</code>, <code>assign</code>, <code>pin</code>, <code>markRead</code>, <code>updateMessage</code>, <code>deleteChat</code>, optional <code>search</code>/<code>subscribe</code></td></tr>
		<tr><td><code>PanelChatRecord</code></td><td><code>@yaebal/panel</code></td><td>interface</td><td>chat id plus optional name, first name, last name and username</td></tr>
		<tr><td><code>PanelChat</code></td><td><code>@yaebal/panel</code></td><td>interface</td><td>identity, preview, <code>status</code>, <code>unread</code>, <code>assignedTo</code>, <code>pinned</code></td></tr>
		<tr><td><code>PanelMessage</code></td><td><code>@yaebal/panel</code></td><td>interface</td><td>text, date, direction, <code>seq</code>, <code>id</code>, <code>replyToId</code>, <code>operator</code>, <code>edited</code>, <code>deleted</code>, attachments, media group, keyboard and event metadata</td></tr>
		<tr><td><code>PanelKeyboard</code></td><td><code>@yaebal/panel</code></td><td>interface</td><td>inline/reply keyboard preview rows</td></tr>
		<tr><td><code>PanelMessageEvent</code></td><td><code>@yaebal/panel</code></td><td>interface</td><td>callback, reaction, poll and member event metadata</td></tr>
		<tr><td><code>PanelEvent</code></td><td><code>@yaebal/panel</code></td><td>type</td><td>discriminated union of realtime store events</td></tr>
	</tbody>
</table>

<div class="note">
	the panel HTML is a single self-contained page with inline SVG icons and no external assets.
	for production, serve it behind TLS and use long random operator tokens. SQLite uses
	Node's built-in <code>node:sqlite</code>, so <code>@yaebal/panel/sqlite</code> requires Node >= 22.5.
</div>
