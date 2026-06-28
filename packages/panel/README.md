# @yaebal/panel

an operator panel for [yaebal](https://github.com/neverlane/yaebal) bots: view
incoming private-chat messages and reply from the browser, live. ships as a
self-contained `fetch` handler — mount it on any HTTP framework.

- **login page** on the panel root — paste your token, no secrets in the url
- **realtime** updates over server-sent events, with a polling safety net
- **media**: photos, docs, voice, video and albums — both directions, in the browser
- **persistence** via a pluggable `PanelStore` (in-memory + sqlite included)
- CORS, basePath mounting and failed-auth rate limiting

## install

```sh
pnpm add @yaebal/panel
```

## usage

```ts
import { Bot } from "@yaebal/core";
import { MemoryPanelStore, recorder, panelHandler } from "@yaebal/panel";
import { serve } from "@yaebal/panel/serve";

const bot = new Bot(token);
const store = new MemoryPanelStore();

bot.install(recorder(store)); // log incoming private messages
bot.start();

// serve the panel — a fetch handler: (Request) => Promise<Response>
const handler = panelHandler(bot.api, store, { token: process.env.PANEL_TOKEN! });
serve(handler, { port: 8080 });
// open http://localhost:8080 and paste your token on the login screen
```

The panel root serves a small SPA: a centered login (token input + **authorize**
button), then the live chat view. The token is kept in `sessionStorage` and sent as
`Authorization: Bearer …` — it never rides in the page url.

## mounting

`panelHandler` returns a plain `(Request) => Promise<Response>` — it binds no port of
its own. pick a port when you wire it into a server.

```ts
// node 20+ — `serve` ships in the box (native `node:http`, no deps)
import { serve } from "@yaebal/panel/serve";

serve(handler, { port: 8080, onListen: ({ port }) => console.log(`panel on :${port}`) });

// bun
Bun.serve({ port: 8080, fetch: handler });

// deno
Deno.serve({ port: 8080 }, handler);

// hono / any fetch framework
app.all("/panel/*", (c) => handler(c.req.raw)); // pair with basePath: "/panel"
```

`serve` is a separate entry (`@yaebal/panel/serve`) so the main module stays free of
`node:` imports for edge bundles. on cloudflare workers, deno deploy or vercel edge
just export the handler as the `fetch` entry — same handler, no port:

```ts
export default { fetch: handler };
```

## options

```ts
panelHandler(bot.api, store, {
  token: process.env.PANEL_TOKEN!,   // required shared secret
  basePath: "/panel",                // mount under a sub-path (default: root)
  cors: "https://ops.example",       // allow a browser origin (or a list, or "*")
  rateLimit: { max: 10, windowMs: 60_000 }, // throttle failed auth (default); false to disable
});
```

- **`basePath`** — the UI builds its api urls from this, so no extra rewriting is
  needed when you mount under a prefix.
- **`rateLimit`** — after `max` bad tokens within `windowMs`, a client gets `429`
  with `Retry-After` until the window passes. keyed by `x-forwarded-for` / `x-real-ip`
  by default; override with `clientKey`.

## persistence

implement `PanelStore` (`record` / `chats` / `history`, optional `subscribe` for
realtime) to keep conversations in redis, postgres, etc. a sqlite-backed store built
on node's native `node:sqlite` ships in the box:

```ts
import { SqlitePanelStore } from "@yaebal/panel/sqlite";

const store = new SqlitePanelStore({ path: "./panel.db" }); // or ":memory:"
bot.install(recorder(store));
const handler = panelHandler(bot.api, store, { token: process.env.PANEL_TOKEN! });
```

`subscribe` is what powers the SSE stream — a store without it still works, the UI
just falls back to polling.

## media

photos, documents, voice notes, video and **albums** flow both ways:

- **incoming** — the recorder stores each attachment's `file_id` (and album id). the
  browser renders them inline: images, `<video>`, `<audio>`, or a download link for
  documents. consecutive messages sharing a `media_group_id` are shown as one album.
- **outgoing** — the 📎 button in the composer uploads a file; the panel picks
  `sendPhoto` / `sendVideo` / `sendVoice` / `sendDocument` / … from its mime type
  (the text box becomes the caption).

media bytes are **proxied** through `GET /api/file?id=<file_id>` (the panel calls
`getFile` and streams the result) so the bot token never reaches the browser. this
needs an api with `call()` / `fileUrl()` — the real `@yaebal/core` `Api` has both;
without them, media routes answer `501` and text still works.

## what the recorder captures

incoming **private-chat** messages only. text and captions are stored verbatim;
a media-only message is previewed in the chat list as a `[photo]` / `[document]` /
`[voice]` / … placeholder. when you reply with text from the panel, the api accepts
`text` plus optional `parse_mode`, `reply_to_message_id` and `reply_parameters`,
forwarded to `sendMessage`.

`recorder` only sees **incoming** updates. to also capture replies the bot sends
*elsewhere* (e.g. `ctx.reply(...)` in your own handlers), hook the api with
`recordOutgoing` — and tell the panel to stop recording its own sends so they
aren't logged twice:

```ts
import { recordOutgoing } from "@yaebal/panel";

recordOutgoing(bot.api, store); // logs every outgoing sendMessage to a private chat
const handler = panelHandler(bot.api, store, {
  token: process.env.PANEL_TOKEN!,
  recordSends: false, // recordOutgoing already covers panel replies
});
```

## api routes

mounted relative to `basePath` (default root). all but the page require the token.

```text
GET  /                       → login + chat SPA (public)
GET  /api/chats              → PanelChat[]  (sorted by lastDate desc)
GET  /api/chats/:id          → PanelMessage[]  (?before=&limit= to page)
GET  /api/stream             → text/event-stream of record events
GET  /api/file?id=<file_id>  → proxied file bytes (getFile + stream)
POST /api/chats/:id/send     → json { text, … } → sendMessage
                               multipart { file, caption?, type? } → sendPhoto/Document/…
```

## example

a runnable, full-featured bot lives in
[`examples/panel`](https://github.com/neverlane/yaebal/tree/master/examples/panel) —
media both ways, `recordOutgoing`, login page and SSE, served on node.

---

part of [**yaebal**](https://github.com/neverlane/yaebal) — a type-safe, runtime-agnostic Telegram Bot API framework. MIT.
