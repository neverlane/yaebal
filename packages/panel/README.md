# @yaebal/panel

framework-agnostic operator panel for Telegram bots. view incoming private chats, inspect
media, callbacks and UI events, and reply from the browser. ships as a self-contained
`fetch` handler, so it mounts on Node, Bun, Deno, edge runtimes, Hono, Fastify, Express
adapters, grammY, GramIO, puregram, or any other bot stack.

## 0.0.3 highlights

- framework-neutral recording with `recordTelegramUpdate(store, update)`
- `createPanelApi(token)` for text replies, file proxying and operator media uploads
- redesigned SVG-only UI: avatars, identity sidebar, rich text/media previews
- media viewer dialog, polished voice cards, video cards, albums and documents
- inline/reply keyboard previews plus callback, reaction, poll and member-event rows
- persistence via pluggable `PanelStore` (in-memory + sqlite included)
- CORS, `basePath` mounting and failed-auth rate limiting

## install

```sh
pnpm add @yaebal/panel
```

## quick start: yaebal

```ts
import { Bot } from "@yaebal/core";
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
bot.start();
```

open `http://localhost:8080` and paste `PANEL_TOKEN`. the token is kept in
`sessionStorage` and sent as `Authorization: Bearer ...`; it is not placed in page URLs
except for the EventSource stream, where browsers cannot set headers.

## quick start: any framework

use your existing framework for updates. use `@yaebal/panel` for the store, panel HTTP
handler, and a Bot API client that understands panel uploads.

```ts
import {
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
serve(handler, { port: 8080 });
```

### grammY

```ts
import { Bot } from "grammy";
import { MemoryPanelStore, createPanelApi, panelHandler, recordTelegramUpdate } from "@yaebal/panel";

const bot = new Bot(process.env.BOT_TOKEN!);
const store = new MemoryPanelStore();

bot.use(async (ctx, next) => {
  await recordTelegramUpdate(store, ctx.update);
  await next();
});

const handler = panelHandler(createPanelApi(process.env.BOT_TOKEN!), store, {
  token: process.env.PANEL_TOKEN!,
});
```

### GramIO

```ts
import { Bot } from "gramio";
import { MemoryPanelStore, createPanelApi, panelHandler, recordTelegramUpdate } from "@yaebal/panel";

const bot = new Bot(process.env.BOT_TOKEN!);
const store = new MemoryPanelStore();

bot.use(async (ctx, next) => {
  await recordTelegramUpdate(store, ctx.update);
  return next();
});

const handler = panelHandler(createPanelApi(process.env.BOT_TOKEN!), store, {
  token: process.env.PANEL_TOKEN!,
});
```

### puregram

```ts
import { Telegram } from "puregram";
import { MemoryPanelStore, createPanelApi, panelHandler, recordTelegramUpdate } from "@yaebal/panel";

const telegram = new Telegram({ token: process.env.BOT_TOKEN! });
const store = new MemoryPanelStore();

telegram.updates.use(async (ctx, next) => {
  await recordTelegramUpdate(store, ctx.update);
  return next();
});

const handler = panelHandler(createPanelApi(process.env.BOT_TOKEN!), store, {
  token: process.env.PANEL_TOKEN!,
});
```

### other frameworks

if your framework exposes raw Telegram updates, pass them to `recordTelegramUpdate`. if it
does not, record manually with `store.record({ id, firstName, lastName, username }, message)`.
the panel only needs `PanelMessage` objects and a `PanelApi` implementation.

## mounting

`panelHandler` returns `(Request) => Promise<Response>` and binds no port of its own.

```ts
// node 20+, native node:http helper
import { serve } from "@yaebal/panel/serve";
serve(handler, { port: 8080 });

// bun
Bun.serve({ port: 8080, fetch: handler });

// deno
Deno.serve({ port: 8080 }, handler);

// hono / any fetch framework, pair with basePath: "/panel"
app.all("/panel/*", (c) => handler(c.req.raw));

// cloudflare workers / deno deploy / vercel edge
export default { fetch: handler };
```

## options

```ts
panelHandler(api, store, {
  token: process.env.PANEL_TOKEN!,
  basePath: "/panel",
  cors: "https://ops.example",
  rateLimit: { max: 10, windowMs: 60_000 },
  clientKey: (req) => req.headers.get("x-real-ip") ?? "shared",
  recordSends: true,
});
```

## persistence

```ts
import { SqlitePanelStore } from "@yaebal/panel/sqlite";

const store = new SqlitePanelStore({ path: "./panel.db" });
```

implement `PanelStore` (`record`, `chats`, `history`, optional `subscribe`) for Redis,
Postgres or any other persistence layer. `subscribe` powers SSE; without it the UI still
works through polling.

## what gets recorded

- private message text and captions
- photos, videos, animations, audio, voice, video notes, documents, stickers and albums
- inline and reply keyboards attached to messages
- callback queries as timeline event rows
- message reactions, reaction counts, poll answers and private member-status changes
- outgoing `send*` results when you install `recordOutgoing(api, store)`

`recordTelegramUpdate` and `recorder` ignore group chat messages by design. The panel is an
operator inbox for private support-style conversations.

## media

incoming media is stored by `file_id`; the browser loads bytes through
`GET /api/file?id=<file_id>`, so the bot token never reaches the browser. Operator uploads
use multipart `POST /api/chats/:id/send`; the panel infers `sendPhoto`, `sendVideo`,
`sendVoice`, `sendAudio` or `sendDocument` from the file MIME type.

`createPanelApi(token)` uses the yaebal Bot API encoder internally, so media proxying and
operator uploads work even when the bot itself runs on grammY, GramIO, puregram or another
framework.

## api routes

```text
GET  /                       -> login + chat SPA (public)
GET  /api/chats              -> PanelChat[]
GET  /api/chats/:id          -> PanelMessage[] (?before=&limit=)
GET  /api/stream             -> text/event-stream of record events
GET  /api/file?id=<file_id>  -> proxied file bytes
POST /api/chats/:id/send     -> json { text, reply_markup?, ... } or multipart { file, caption?, type? }
```

## example

run [`examples/panel`](https://github.com/neverlane/yaebal/tree/master/examples/panel) for
the complete demo: keyboards, callbacks, event rows, media viewer, styled voice/video
messages, albums, outgoing logging, login and SSE.

---

part of [**yaebal**](https://github.com/neverlane/yaebal) — a type-safe, runtime-agnostic Telegram Bot API framework. MIT.
