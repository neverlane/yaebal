import { h as head } from "../../../../../chunks/index.js";
import { C as Code } from "../../../../../chunks/Code.js";
function _page($$renderer) {
  const install = `pnpm add @yaebal/callback-data`;
  const usage = `import { Bot } from "@yaebal/core";
import { InlineKeyboard } from "@yaebal/keyboard";
import { callbackData } from "@yaebal/callback-data";

// define a namespace: prefix + field→codec schema
const userAction = callbackData("user", {
  id: Number,
  action: String,
  admin: Boolean,
});

const bot = new Bot(process.env.BOT_TOKEN!);

bot.command("manage", (ctx) => {
  const kb = new InlineKeyboard()
    .text("ban", userAction.pack({ id: 42, action: "ban", admin: false }))
    .text("promote", userAction.pack({ id: 42, action: "promote", admin: true }))
    .build();
  return ctx.reply("choose:", { reply_markup: kb });
});

// use the pattern to route only this namespace
bot.callbackQuery(userAction.pattern, (ctx) => {
  const payload = userAction.unpack(ctx.callbackQuery.data ?? "");
  if (!payload) return; // wrong namespace — shouldn't happen with pattern routing
  ctx.reply(\`id=\${payload.id} action=\${payload.action} admin=\${payload.admin}\`);
});`;
  const filterUsage = `// manual guard without pattern routing
bot.on("callback_query:data", (ctx) => {
  if (!userAction.filter(ctx.callbackQuery.data ?? "")) return;
  const payload = userAction.unpack(ctx.callbackQuery.data ?? "")!;
  // payload.id is number, payload.action is string, payload.admin is boolean
});`;
  const prefixOnly = `// a namespace with no fields — useful for simple action buttons
const ping = callbackData("ping", {});
ping.pack({});    // => "ping"
ping.unpack("ping"); // => {}
ping.filter("ping"); // => true`;
  head("pfbdqa", $$renderer, ($$renderer2) => {
    $$renderer2.title(($$renderer3) => {
      $$renderer3.push(`<title>@yaebal/callback-data — yaebal</title>`);
    });
  });
  $$renderer.push(`<h1>@yaebal/callback-data</h1> <p class="lead">typed <code>callback_data</code> — pack and unpack button payloads with a field schema and full type inference.</p> <h2>install</h2> `);
  Code($$renderer, { code: install, title: "terminal", lang: "sh" });
  $$renderer.push(`<!----> <h2>usage</h2> <p>call <code>callbackData(prefix, schema)</code> once per namespace. the schema maps field
	names to one of three codecs: <code>Number</code>, <code>String</code>, or <code>Boolean</code>. types are inferred — <code>pack</code> and <code>unpack</code> both carry the exact shape.</p> `);
  Code($$renderer, { code: usage, title: "bot.ts" });
  $$renderer.push(`<!----> <h2>routing with filter</h2> <p>use <code>.filter()</code> as a manual guard when you can't use <code>.pattern</code>:</p> `);
  Code($$renderer, { code: filterUsage, title: "filter.ts" });
  $$renderer.push(`<!----> <h2>prefix-only schema</h2> <p>pass an empty schema <code>{}</code> for buttons that carry no payload:</p> `);
  Code($$renderer, { code: prefixOnly, title: "prefix-only.ts" });
  $$renderer.push(`<!----> <h2>api</h2> <table><thead><tr><th>export</th><th>signature</th><th>description</th></tr></thead><tbody><tr><td><code>callbackData</code></td><td><code>(prefix: string, schema: S) => CallbackData&lt;S></code></td><td>creates a typed callback_data namespace</td></tr><tr><td><code>CallbackData</code></td><td>interface</td><td>the object returned by <code>callbackData()</code></td></tr></tbody></table> <h3>CallbackData&lt;S></h3> <table><thead><tr><th>member</th><th>type</th><th>description</th></tr></thead><tbody><tr><td><code>pack</code></td><td><code>(data: Infer&lt;S>) => string</code></td><td>serialize a payload into a <code>callback_data</code> string</td></tr><tr><td><code>unpack</code></td><td><code>(raw: string) => Infer&lt;S> | undefined</code></td><td>parse a raw string; returns <code>undefined</code> if prefix or arity doesn't match</td></tr><tr><td><code>filter</code></td><td><code>(raw: string | undefined) => boolean</code></td><td>true if <code>raw</code> belongs to this namespace; safe to pass <code>undefined</code></td></tr><tr><td><code>pattern</code></td><td><code>RegExp</code></td><td>regex anchored to the prefix — pass to <code>bot.callbackQuery()</code></td></tr></tbody></table> <h3>codecs</h3> <table><thead><tr><th>codec</th><th>TypeScript type</th><th>decode behaviour</th></tr></thead><tbody><tr><td><code>Number</code></td><td><code>number</code></td><td>parsed with <code>Number()</code>; non-numeric input decodes to <code>NaN</code></td></tr><tr><td><code>String</code></td><td><code>string</code></td><td>URL-decoded verbatim</td></tr><tr><td><code>Boolean</code></td><td><code>boolean</code></td><td>exact string <code>"true"</code> → <code>true</code>; anything else → <code>false</code></td></tr></tbody></table> <div class="note"><strong>Telegram caps <code>callback_data</code> at 64 bytes.</strong> values are
	URL-encoded so the <code>:</code> separator is safe inside field values, but encoding
	expands size — keep prefixes and values short. <br/><br/> <strong>the prefix must not contain <code>:</code></strong> — <code>callbackData</code> throws immediately if it does. <br/><br/> <strong>codecs are not validated on unpack.</strong> this is intentional: you only ever
	unpack data you packed yourself, so malformed values are not a concern in normal use.</div>`);
}
export {
  _page as default
};
