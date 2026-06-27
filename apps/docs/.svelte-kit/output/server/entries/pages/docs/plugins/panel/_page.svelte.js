import { h as head } from "../../../../../chunks/index.js";
import { C as Code } from "../../../../../chunks/Code.js";
function _page($$renderer) {
  const install = `pnpm add @yaebal/panel`;
  const fullSetup = `import { Bot } from "@yaebal/core";
import { MemoryPanelStore, recorder, panelHandler } from "@yaebal/panel";
import { createServer } from "node:http";

const bot = new Bot(token);
const store = new MemoryPanelStore();

// 1. attach the recorder plugin — logs incoming private messages to the store
bot.install(recorder(store));

bot.start();

// 2. mount the panel on any fetch-compatible server
const handler = panelHandler(bot.api, store, { token: "my-secret-panel-token" });

// example: Node.js built-in http
createServer(async (req, res) => {
  const response = await handler(new Request(\`http://localhost\${req.url}\`));
  res.writeHead(response.status, Object.fromEntries(response.headers));
  res.end(await response.text());
}).listen(3000);

// open: http://localhost:3000/?token=my-secret-panel-token`;
  const hono = `import { Hono } from "hono";
import { MemoryPanelStore, recorder, panelHandler } from "@yaebal/panel";

const store = new MemoryPanelStore();
const handler = panelHandler(bot.api, store, { token: process.env.PANEL_TOKEN! });

const app = new Hono();
app.all("/panel/*", (c) => {
  // strip the /panel prefix before forwarding
  const url = new URL(c.req.url);
  url.pathname = url.pathname.replace(/^\\/panel/, "") || "/";
  return handler(new Request(url, c.req.raw));
});`;
  const bearerAuth = `// the token can be passed either way:
// 1. as a query parameter (used by the UI on initial load)
//    http://localhost:3000/?token=my-secret-panel-token
// 2. as an Authorization header (used by the UI's API calls)
//    Authorization: Bearer my-secret-panel-token`;
  const customStore = `import type { PanelStore, PanelChat, PanelMessage } from "@yaebal/panel";

// implement PanelStore for persistence (redis, postgres, …)
class MyPersistentStore implements PanelStore {
  async record(chat: { id: number; name?: string }, message: PanelMessage) {
    await db.messages.insert({ chatId: chat.id, ...message });
  }
  async chats(): Promise<PanelChat[]> {
    return db.chats.findAll({ orderBy: "lastDate desc" });
  }
  async history(chatId: number): Promise<PanelMessage[]> {
    return db.messages.findAll({ where: { chatId } });
  }
}

const store = new MyPersistentStore();
bot.install(recorder(store));
const handler = panelHandler(bot.api, store, { token: "..." });`;
  const apiRoutes = `// GET  /?token=<t>            → serves the operator panel HTML
// GET  /api/chats             → PanelChat[]  (sorted by lastDate desc)
// GET  /api/chats/:id         → PanelMessage[]
// POST /api/chats/:id/send    → { text: string } → sends via bot.api.sendMessage`;
  head("32h10i", $$renderer, ($$renderer2) => {
    $$renderer2.title(($$renderer3) => {
      $$renderer3.push(`<title>@yaebal/panel — yaebal</title>`);
    });
  });
  $$renderer.push(`<h1>@yaebal/panel</h1> <p class="lead">an operator panel: view incoming private-chat messages and reply from the browser. ships as a
	self-contained fetch handler — mount it on any http framework. the <code>recorder()</code> plugin feeds the store; <code>panelHandler()</code> serves the UI and a
	small REST API.</p> <h2>installation</h2> `);
  Code($$renderer, { code: install, lang: "sh", title: "terminal" });
  $$renderer.push(`<!----> <h2>quick start</h2> <p>three moving parts: a <strong>store</strong>, the <strong>recorder plugin</strong>, and the <strong>panel handler</strong>.</p> `);
  Code($$renderer, { code: fullSetup, title: "server.ts" });
  $$renderer.push(`<!----> <h2>mounting on hono (or any fetch-based framework)</h2> `);
  Code($$renderer, { code: hono, title: "hono.ts" });
  $$renderer.push(`<!----> <h2>authentication</h2> <p><code>panelHandler</code> requires a non-empty <code>token</code>. it is checked on every
	request using a constant-time comparison to prevent timing attacks. the UI accepts the token
	either as a query parameter (initial page load) or as a <code>Bearer</code> header (all API
	calls).</p> `);
  Code($$renderer, { code: bearerAuth, lang: "text", title: "auth" });
  $$renderer.push(`<!----> <h2>panel API routes</h2> `);
  Code($$renderer, { code: apiRoutes, lang: "text", title: "routes" });
  $$renderer.push(`<!----> <h2>persistent storage</h2> <p><code>MemoryPanelStore</code> is the default — it keeps up to 1000 messages per chat in memory
	and is lost on restart. for production, implement <code>PanelStore</code> against your database.</p> `);
  Code($$renderer, { code: customStore, title: "store.ts" });
  $$renderer.push(`<!----> <h2>what the recorder captures</h2> <p><code>recorder(store)</code> is a standard yaebal plugin. it records incoming <em>private-chat
	text messages</em> to the store. non-text updates (photos, stickers, etc.) and group messages are
	passed through unchanged. outgoing messages sent via the panel's send button are also recorded
	(with <code>direction: "out"</code>) by <code>panelHandler</code> itself.</p> <h2>api</h2> <table><thead><tr><th>export</th><th>kind</th><th>description</th></tr></thead><tbody><tr><td><code>panelHandler(api, store, options)</code></td><td>function</td><td>returns a <code>(Request) => Promise&lt;Response></code> handler</td></tr><tr><td><code>recorder(store)</code></td><td>Plugin</td><td>logs incoming private text into the store</td></tr><tr><td><code>MemoryPanelStore</code></td><td>class</td><td>in-memory <code>PanelStore</code>; implements <code>record</code>, <code>chats</code>, <code>history</code></td></tr><tr><td><code>PanelStore</code></td><td>interface</td><td>implement to persist conversations</td></tr><tr><td><code>PanelMessage</code></td><td>interface</td><td><code>{ direction: 'in' | 'out'; text: string; date: number }</code></td></tr><tr><td><code>PanelChat</code></td><td>interface</td><td><code>{ id: number; name: string; lastText: string; lastDate: number }</code></td></tr><tr><td><code>PanelOptions</code></td><td>interface</td><td><code>{ token: string }</code> — required auth token</td></tr><tr><td><code>PANEL_HTML</code></td><td>string</td><td>the raw HTML of the panel UI (exported for custom serving)</td></tr></tbody></table> <div class="note">the panel HTML is a single self-contained page — no external assets, no CDN. it polls every 4
	seconds for new chats and refreshes the open conversation. for a production deployment, put the
	panel behind a reverse proxy with TLS and restrict the <code>token</code> to a long random value.</div>`);
}
export {
  _page as default
};
