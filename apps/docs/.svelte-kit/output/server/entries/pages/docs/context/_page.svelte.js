import { h as head } from "../../../../chunks/index.js";
import { C as Code } from "../../../../chunks/Code.js";
function _page($$renderer) {
  const base = `bot.on("message:text", (ctx) => {
  ctx.update;      // the raw Update
  ctx.updateType;  // "message" | "callback_query" | …
  ctx.message;     // message ?? edited_message ?? channel_post
  ctx.from;        // User | undefined
  ctx.chat;        // Chat | undefined
  ctx.text;        // message.text ?? message.caption
  ctx.is("callback_query"); // puregram-style narrowing check
});`;
  const send = `bot.on("message:text", async (ctx) => {
  await ctx.send("hi");                       // to the current chat
  await ctx.reply("yo");                      // reply_parameters set for you
  await ctx.sendPhoto("AgAC…");               // file_id or url string
  await ctx.sendDocument(media.path("./a.pdf"));
});

bot.on("callback_query", (ctx) =>
  ctx.answerCallbackQuery({ text: "got it" }), // no-op if no query
);`;
  const filters = `bot.on("message:text", (ctx) => ctx.text);        // L1:L2
bot.on("message:caption", (ctx) => ctx.text);     // caption also fills .text
bot.on("callback_query:data", (ctx) => ctx.callbackQuery);
bot.on("message:entities", (ctx) => ctx.entities);
bot.on(":photo", (ctx) => { /* any update with a message.photo */ });`;
  const filtered = `// Filtered<C, Q> — how a query narrows the context type:
//   "…:text" | "…:caption"     →  C & { text: string }
//   "…:data" | "callback_query" →  C & { callbackQuery: CallbackQuery }
//   "…:entities…"               →  C & { entities: MessageEntity[] }
//   anything else               →  C  (unchanged)

bot.on("message:text", (ctx) => {
  ctx.text;          // string, not string | undefined
});
bot.on("callback_query:data", (ctx) => {
  ctx.callbackQuery; // CallbackQuery, guaranteed present
});`;
  const match = `// matchQuery splits "message:text" into head + fields and checks each:
//   head  → must equal ctx.updateType
//   text  → ctx.text is a non-empty string
//   data  → ctx.callbackQuery?.data is set
//   entities → ctx.message?.entities has length
//   <other> → truthy on ctx.message[field] (e.g. photo, document, sticker)`;
  const enrich = `bot
  .derive(async (ctx) => ({ user: await db.find(ctx.from!.id) })) // per-request
  .decorate({ appVersion: "1.0.0" })                              // static
  .on("message:text", (ctx) => {
    ctx.user;        // ✅ from derive
    ctx.appVersion;  // ✅ from decorate
    ctx.text;        // ✅ from the filter query
  });`;
  head("6tc754", $$renderer, ($$renderer2) => {
    $$renderer2.title(($$renderer3) => {
      $$renderer3.push(`<title>context — yaebal</title>`);
    });
  });
  $$renderer.push(`<h1>context</h1> <p class="lead">one object wraps each update, exposes typed accessors, and grows new properties as the chain
	enriches it.</p> <h2>the base context</h2> <p>every update is wrapped in a <code>Context</code>. it holds the raw <code>update</code> and a
	detected <code>updateType</code>, and derives the common shapes through getters — so <code>ctx.message</code> already resolves <code>message</code> / <code>edited_message</code> / <code>channel_post</code>, and <code>ctx.text</code> falls back from text to caption.</p> `);
  Code($$renderer, { code: base, title: "handler.ts" });
  $$renderer.push(`<!----> <h2>sending from the context</h2> <p>the context carries a handful of hand-written shortcuts that infer the chat from the current
	update. <code>send</code> accepts a plain string or a <code>format</code> result; <code>reply</code> sets <code>reply_parameters</code> for you; the media shortcuts accept a <code>MediaSource</code> or a raw <code>file_id</code>/url string.</p> `);
  Code($$renderer, { code: send, title: "handler.ts" });
  $$renderer.push(`<!----> <div class="note"><strong>guard rails.</strong> <code>send</code>/<code>sendPhoto</code>/<code>sendDocument</code> reject if the update has no chat, and <code>answerCallbackQuery</code> resolves to <code>false</code> when there is no callback query — so they're safe to call unconditionally.</div> <h2>filter queries</h2> <p>grammY-style <code>L1:L2:L3</code> queries route on the update. the first segment must match <code>ctx.updateType</code>; each following segment is a field that must be present.</p> `);
  Code($$renderer, { code: filters, title: "filters.ts" });
  $$renderer.push(`<!----> `);
  Code($$renderer, { code: match, title: "matchQuery", lang: "text" });
  $$renderer.push(`<!----> <h2>how Filtered narrows</h2> <p>the same query that routes also <strong>narrows the context type</strong>. <code>Filtered&lt;C,
	Q></code> is a conditional type: for the queries it knows, it intersects the matching field onto
	the context so your handler sees it as non-optional.</p> `);
  Code($$renderer, { code: filtered, title: "filtered.ts" });
  $$renderer.push(`<!----> <h2>derive / decorate accumulation</h2> <p>on top of filter-query narrowing, <code>derive</code> and <code>decorate</code> add their own
	properties to the context type, and those carry downstream to every handler after them in the
	chain.</p> `);
  Code($$renderer, { code: enrich, title: "enrich.ts" });
  $$renderer.push(`<!----> <h2>generated shortcuts</h2> <p>the base <code>Context</code> shown here is intentionally small. the much larger set of
	per-update context classes — with API-method shortcuts generated from the Bot API schema — is the
	autogen layer.</p> <ul><li><a href="/docs/contexts/">contexts</a> — the auto-generated context layer (the killer feature)</li></ul>`);
}
export {
  _page as default
};
