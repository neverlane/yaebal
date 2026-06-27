import { h as head } from "../../../../chunks/index.js";
import { C as Code } from "../../../../chunks/Code.js";
function _page($$renderer) {
  const pipeline = `Telegram Bot API (HTML)
        │  ark0f parses → machine-readable JSON
        ▼
packages/types/schema.json        ← single source of truth
        │
        ├──────────►  @yaebal/types/generate.mjs   → telegram.ts (types)
        │
        └──────────►  @yaebal/contexts/generate.mjs
                            ├─ Update.props      → 23 context types
                            ├─ payload fields    → providers (which ids it carries)
                            └─ each API method   → matched shortcut
                                      ▼
                            src/generated/*.ts  (one file per context)`;
  const providers = `// payload field  →  id this context can fill
chat            →  chat_id      = this.chat.id
message_id      →  message_id   = this.message_id
from            →  user_id      = this.from.id
CallbackQuery   →  callback_query_id = this.id
                   chat_id / message_id from this.message`;
  const generated = `// generated/message.ts — derived, never hand-written
react(params: Omit<SetMessageReactionParams, "chat_id" | "message_id">) {
  return this.api.call<boolean>("setMessageReaction", {
    chat_id: this.chat.id,
    message_id: this.message_id,
    ...params,
  });
}`;
  const evolution = `# Bot API 7.0 (Dec 2023) added setMessageReaction.
# nothing in the generator changed — only the schema did:

+ { "name": "setMessageReaction",
+   "arguments": [ {chat_id, required}, {message_id, required},
+                  {reaction?}, {is_big?} ] }

# pnpm --filter @yaebal/contexts generate

# → ctx.react() now exists on every Message-based context.
#   gramio would need a maintainer to hand-write it.`;
  const sugar = `// src/sugar/message.ts — thin hand-written layer (a "mixin")
export class MessageContext extends MessageContextBase {
  override send(text: string, params?: SendExtra): Promise<Message>;
  override send(params: Omit<SendMessageParams, "chat_id">): Promise<Message>;
  override send(a, b?) {
    return super.send(typeof a === "string" ? { text: a, ...b } : a);
  }
}`;
  const usage = `bot.on("message:text", (ctx) => {
  ctx.send("hi");                  // positional sugar
  ctx.reply("yo", { parse_mode: "HTML" });
  ctx.react("🔥");                  // auto-generated, no chat_id/message_id
  ctx.editText("edited");
});`;
  const getters = `// camel-case getters generated on EVERY context that has the field
bot.on("message:text", (ctx) => {
  ctx.senderId;   // number | undefined
  ctx.chatId;     // number
  ctx.firstName;  // string | undefined
  ctx.isPM;       // boolean   (also isGroup, messageId)
});`;
  const shortcuts = `ctx.react("🔥");                          // emoji
ctx.react("🔥", "<custom_emoji_id>");     // custom emoji (+ fallback)
ctx.react([{ emoji: "👍" }, { custom_emoji_id: "1" }]);   // many
ctx.react();                              // clear all

callbackCtx.answer("saved");              // CallbackQueryContext
inlineCtx.answer([...results]);           // InlineQueryContext
joinCtx.approve();   joinCtx.decline();   // ChatJoinRequestContext
shippingCtx.answer(true);                 // ShippingQueryContext`;
  head("12ov3fb", $$renderer, ($$renderer2) => {
    $$renderer2.title(($$renderer3) => {
      $$renderer3.push(`<title>contexts — yaebal</title>`);
    });
  });
  $$renderer.push(`<h1>contexts <span class="killer svelte-12ov3fb">killer feature</span></h1> <p class="lead">gramio-style per-update context classes — except the shortcut methods aren't hand-written.
	they're generated from the Bot API schema, so they're always complete and never lag a version.</p> <h2>how it's built</h2> <p>contexts are a pure function of the schema. there's no per-method, per-context hand-coding —
	the generator derives everything.</p> `);
  Code($$renderer, { code: pipeline, title: "pipeline", lang: "text" });
  $$renderer.push(`<!----> <h2>detection, in two steps</h2> <p><strong>1. providers</strong> — from a payload's <em>fields</em>, the generator works out which
	ids that context can supply:</p> `);
  Code($$renderer, { code: providers, title: "providers", lang: "text" });
  $$renderer.push(`<!----> <p><strong>2. matching</strong> — for each of the 135 Bot API methods, it collects the id-arguments
	(<code>chat_id</code>, <code>message_id</code>, <code>user_id</code>, query ids). if the
	context's providers cover the required ones, it emits a shortcut with those keys <code>Omit</code>-ted from the params:</p> `);
  Code($$renderer, { code: generated, title: "generated/message.ts" });
  $$renderer.push(`<!----> <h2>adding a feature is free</h2> <p>because the contexts derive from the schema, a new Bot API method shows up on every context that
	has the right ids — automatically. take reactions, added in Bot API 7.0:</p> `);
  Code($$renderer, { code: evolution, title: "schema diff", lang: "diff" });
  $$renderer.push(`<!----> <div class="note">one regen, and <code>ctx.react()</code> lands on <code>MessageContext</code>, <code>ChannelPostContext</code>, <code>BusinessMessageContext</code> — every Message-based
	context — with the right <code>Omit</code> signature. zero hand-written code.</div> <h2>the sugar layer</h2> <p>autogen gives breadth; a thin hand-written layer gives ergonomics. a shared <code>MessageSugar</code> mixin adds positional-string overloads on top of the generated base —
	the best of both:</p> `);
  Code($$renderer, { code: sugar, title: "sugar/message.ts" });
  $$renderer.push(`<!----> `);
  Code($$renderer, { code: usage, title: "handler.ts" });
  $$renderer.push(`<!----> <h2>convenience getters</h2> <p>the generator also emits camel-case getters (the gramio / puregram idea) on <strong>every</strong> context that carries the field — <code>senderId</code>, <code>chatId</code>, <code>firstName</code>, <code>isPM</code>, <code>isGroup</code>, <code>messageId</code> — so you
	never reach into the raw payload for the common things.</p> `);
  Code($$renderer, { code: getters, title: "getters.ts" });
  $$renderer.push(`<!----> <h2>per-context shortcuts</h2> <p>one <code>MessageSugar</code> mixin gives every message-based context (<code>message</code>, <code>channel_post</code>, the <code>edited_*</code> and <code>business_*</code> ones) the positional <code>send</code> / <code>reply</code> / <code>react</code> / <code>editText</code>; query contexts
	get a positional <code>answer</code>; join requests get <code>approve</code> / <code>decline</code>.</p> `);
  Code($$renderer, { code: shortcuts, title: "shortcuts.ts" });
  $$renderer.push(`<!----> <table><thead><tr><th></th><th>gramio / puregram</th><th>yaebal</th></tr></thead><tbody><tr><td>shortcuts</td><td>hand-written</td><td>generated from schema</td></tr><tr><td>coverage</td><td>what a maintainer wrapped</td><td>everything fillable</td></tr><tr><td>new API method</td><td>wait for a PR</td><td><code>pnpm generate</code></td></tr><tr><td>version lag</td><td>contexts trail the API</td><td>contexts == schema version</td></tr><tr><td>ergonomics</td><td>hand-tuned</td><td>autogen + thin sugar layer</td></tr></tbody></table>`);
}
export {
  _page as default
};
