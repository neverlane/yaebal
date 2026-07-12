# @yaebal/panel

framework-agnostic operator panel for Telegram bots. view incoming private chats, hand a
conversation off from the bot to a human, reply, edit or delete a message, search across
every chat, and export a conversation — all from the browser. ships as a self-contained
`fetch` handler, so it mounts on Node, Bun, Deno, edge runtimes, Hono, Fastify, Express
adapters, grammY, GramIO, puregram, or any other bot stack.

## 0.1.0 highlights

- **cookie-session auth**, multi-operator: named operators each get their own token, every
  panel-sent message is stamped with who sent it (audit trail) — no token ever sits in a URL
- **handoff**: `handoff(store)` — mark a chat `"handled"` and the bot's own handlers go quiet
  until an operator releases it back to `"open"`
- **reply / edit / delete** any message from the panel, with a full-text **search** across
  every chat (FTS5-backed on `SqlitePanelStore`) and one-click conversation **export**
- chat **status** (open/handled/archived), **unread counts**, **assign** to an operator, **pin**
- **canned responses**, a typing indicator, optional desktop notifications
- **`skladPanelStore`** — persistence on any `@yaebal/sklad` `StorageAdapter` (Redis,
  Cloudflare KV, a flat file, `MemoryStorage`) — for edge runtimes and anywhere `node:sqlite`
  isn't available. `SqlitePanelStore` remains the fast, FTS5-backed path on Node 22.5+.
- realtime SSE that actually streams (no more buffering the whole connection in memory),
  rate limiting that can no longer lock an operator out by itself, and a redesigned UI that
  never wipes your unsent draft out from under you

> upgrading from 0.0.x? this release breaks the api: `PanelStore` gained new required
> methods, the panel now authenticates with a session cookie instead of a query-string
> token, and `HistoryOptions`/`PanelEvent` changed shape. see [breaking changes](#breaking-changes-from-00x).

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

open `http://localhost:8080` and enter `PANEL_TOKEN`. the panel signs you in with a
`Set-Cookie` session (`HttpOnly`, `SameSite=Strict`) — the token itself never appears in a
URL, and every browser request (including the SSE stream and media loads) rides on that
cookie automatically.

## multiple operators + audit trail

```ts
const handler = panelHandler(bot.api, store, {
  operators: [
    { name: "alice", token: process.env.ALICE_TOKEN! },
    { name: "bob", token: process.env.BOB_TOKEN! },
  ],
});
```

each operator logs in with their own token. every message sent from the panel is recorded
with `PanelMessage.operator` set to whoever sent it, and `assign(chatId, operator)` tracks
who owns a conversation. `token` (singular) is shorthand for a single operator named
`"operator"` — use it for a one-person setup.

## handoff: let an operator take over from the bot

```ts
import { handoff, recorder } from "@yaebal/panel";

bot.install(recorder(store));
bot.install(handoff(store)); // must come before your reply handlers
bot.on("message:text", (ctx) => ctx.reply("..."));
```

an operator marks a chat `"handled"` in the panel (a click on the status pill in the thread
header) and the bot's own handlers stop firing for that chat — `handoff()` is a guard that
short-circuits the chain before they run. releasing the chat back to `"open"` (or archiving
it) resumes the bot. pass `{ suppressOn: ["handled", "archived"] }` to also silence the bot
on archived chats.

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

### grammY / GramIO / puregram

```ts
bot.use(async (ctx, next) => {
  await recordTelegramUpdate(store, ctx.update); // grammY/GramIO: ctx.update — puregram: ctx.update.raw
  await next(); // or `return next()`, per that framework's middleware convention
});
```

### other frameworks

if your framework exposes raw Telegram updates, pass them to `recordTelegramUpdate`. if it
does not, record manually with `store.record({ id, firstName, lastName, username }, message)`.
the panel only needs `PanelMessage` objects and a `PanelApi` implementation.

### recording group/channel chats too

`recorder`/`recordTelegramUpdate` only log **private** chats by default — the panel is an
operator inbox for support-style conversations. pass `chats` to widen that:

```ts
bot.install(recorder(store, { chats: "all" }));
// or a predicate:
bot.install(recorder(store, { chats: (chat) => chat.type !== "channel" }));
```

## mounting

`panelHandler` returns `(Request) => Promise<Response>` and binds no port of its own.

```ts
// node 20+, native node:http helper (streams SSE properly — see below)
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

if you mount on a runtime other than `@yaebal/panel/serve`, make sure it actually streams
`Response` bodies chunk-by-chunk (SSE requires this) and, if you want rate limiting keyed by
client IP, pass `clientKey` yourself — see [rate limiting](#rate-limiting--proxies) below.

## options

```ts
panelHandler(api, store, {
  token: process.env.PANEL_TOKEN!,          // or `operators: [...]`
  basePath: "/panel",
  cors: "https://ops.example",              // "*" disables session cookies in browsers (see below)
  rateLimit: { max: 10, windowMs: 60_000 },
  clientKey: (req) => req.headers.get("x-real-ip") ?? "shared",
  trustProxy: false,                        // only set true behind a proxy you control
  recordSends: true,
  maxUploadBytes: 50 * 1024 * 1024,
  sessionTtlMs: 12 * 60 * 60 * 1000,
  cannedResponses: [{ label: "Hours", text: "We're open 9-5 UTC." }],
  notifyChatId: process.env.ADMIN_CHAT_ID,  // telegram DM'd when a message arrives idle
  onError: (error, context) => console.error(`panel:${context}`, error),
});
```

## persistence

```ts
// fast, FTS5 search, Node 22.5+
import { SqlitePanelStore } from "@yaebal/panel/sqlite";
const store = new SqlitePanelStore({ path: "./panel.db" });
```

```ts
// any @yaebal/sklad StorageAdapter — Redis, Cloudflare KV, a flat file, MemoryStorage —
// for edge runtimes or anywhere node:sqlite isn't available
import { MemoryStorage } from "@yaebal/sklad"; // or redisStorage/kvStorage/sqliteStorage
import { skladPanelStore } from "@yaebal/panel/sklad";
const store = skladPanelStore(new MemoryStorage());
```

`skladPanelStore` reads-modifies-writes on every record, the same model every other yaebal
plugin's sklad integration uses — correct for a single bot process, not for several processes
sharing one store without their own locking. `SqlitePanelStore` does real SQL queries instead
and is the better choice when you have `node:sqlite` available.

implement `PanelStore` yourself (see its full method list in `src/index.ts`) for Postgres or
any other persistence layer. `subscribe` powers SSE; without it the UI still works, just
without realtime push.

## what gets recorded

- private message text and captions (widen with `recorder(store, { chats })`)
- photos, videos, animations, audio, voice, video notes, documents, stickers and albums
- inline and reply keyboards attached to messages
- callback queries, message reactions, reaction counts, poll answers, member-status changes
- edits (`edited_message`) patch the existing row instead of duplicating it
- outgoing `send*` results when you install `recordOutgoing(api, store)`, and every reply,
  edit or delete made from the panel itself, stamped with the sending operator's name

## security model

- the shared secret is never placed in a URL: the browser exchanges it once at
  `POST /api/login` for an `HttpOnly`, `SameSite=Strict` session cookie, which the browser
  then attaches automatically to every request — including the SSE stream and media loads,
  which is exactly what removes the token from `EventSource` urls, access logs and `Referer`
  headers that plagued 0.0.x.
- failed **auth guesses** (a wrong bearer token, or a wrong token at `/api/login`) are rate
  limited; a request that presents **no credential at all** (e.g. an `EventSource`
  reconnecting after its session naturally expired) never counts against that limiter, so an
  expired session can't lock an operator out of logging back in.
- `X-Frame-Options: DENY` and `frame-ancestors 'none'` stop the panel from being framed for
  clickjacking. keyboard button urls are restricted to `http(s):`/`tg:` schemes before the UI
  ever follows them, since `PanelStore.record` is a public interface any adapter can write to.
- `trustProxy` defaults to `false`: `x-forwarded-for`/`x-forwarded-proto` are only trusted for
  rate-limit keys and cookie `Secure` detection when you explicitly opt in from behind a proxy
  you control. `@yaebal/panel/serve` stamps a same-origin `x-panel-remote-addr` header from the
  actual socket, which the rate limiter uses by default without needing to trust anything.
- the inline `<script>` still runs under `script-src 'unsafe-inline'` — the single-file,
  zero-build-step UI is the point of this package, and a proper CSP hash/nonce would require a
  build step that defeats it. if that tradeoff doesn't work for your threat model, put the
  panel behind its own auth layer (a VPN, an IP allowlist) in addition to its own login.
- one shared or per-operator static token still has no rotation or expiry of its own (only
  the *session* expires, via `sessionTtlMs`) — rotate tokens the same way you'd rotate any
  other long-lived secret.

### rate limiting & proxies

the default `clientKey` reads `x-panel-remote-addr`, a header only `@yaebal/panel/serve` sets
(from the real socket address). mounting on bun/Deno/an edge runtime without that helper means
every client falls into one shared bucket unless you pass your own `clientKey` using that
platform's client-ip mechanism. behind a reverse proxy, either forward `x-panel-remote-addr`
yourself, or set `trustProxy: true` and rely on `x-forwarded-for`/`x-real-ip` — only do this
if the proxy strips any client-supplied copies of those headers first.

## media

incoming media is stored by `file_id`; the browser loads bytes through
`GET /api/file?id=<file_id>` (cookie-authenticated, no token in the url), so the bot token
never reaches the browser. operator uploads use multipart `POST /api/chats/:id/send`, capped
at `maxUploadBytes` (default 50 MiB, telegram's own limit); the panel infers `sendPhoto`,
`sendVideo`, `sendVoice`, `sendAudio` or `sendDocument` from the file MIME type.

`createPanelApi(token)` uses the yaebal Bot API encoder internally, so media proxying and
operator uploads work even when the bot itself runs on grammY, GramIO, puregram or another
framework.

## api routes

```text
GET    /                                        -> login + chat SPA (public)
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
GET    {base}/api/file?id=<file_id>              -> proxied file bytes
```

## breaking changes from 0.0.x

- **auth**: the panel authenticates the browser with a session cookie from `POST /api/login`,
  not a `?token=` query parameter. `PanelOptions.token` still works for a single operator;
  `operators` is new. `EventSource`/media urls no longer carry a token.
- **`PanelStore`** gained required methods: `status`, `setStatus`, `assign`, `pin`,
  `markRead`, `updateMessage`, `deleteChat` (all `void | Promise<void>`), plus optional
  `search`. `chats()` now takes `ChatsOptions`. implement these on any custom store — the two
  built-ins (`MemoryPanelStore`, `SqlitePanelStore`) and the new `skladPanelStore` already do.
- **`HistoryOptions`** gained `beforeSeq` — pass the oldest loaded message's `seq` alongside
  `before` when paginating, or messages sharing the exact same second can be silently dropped.
- **`PanelEvent`** is now a discriminated union (`record` | `status` | `read` | `chat` |
  `deleted`) instead of a single fixed-shape object.
- **`PanelChat`** gained required `status`/`unread` fields.
- **`recordTelegramUpdate`/`recorder`** take an options bag (`{ chats }`) instead of nothing.

## example

run [`examples/panel`](https://github.com/neverlane/yaebal/tree/master/examples/panel) for
the complete demo: multi-operator login, handoff, statuses, search, canned responses, media
viewer, styled voice/video messages, albums, and outgoing logging.

---

part of [**yaebal**](https://github.com/neverlane/yaebal) — a type-safe, runtime-agnostic Telegram Bot API framework. MIT.
