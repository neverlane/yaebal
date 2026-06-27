import { h as head } from "../../../../../chunks/index.js";
import { C as Code } from "../../../../../chunks/Code.js";
function _page($$renderer) {
  const install = `pnpm add @yaebal/broadcast`;
  const basic = `import { Bot } from "@yaebal/core";
import { broadcast } from "@yaebal/broadcast";

const bot = new Bot(token);

// send a plain message to every subscriber
const result = await broadcast(bot.api, subscriberIds, "hello everyone!");
console.log(result.sent, "sent,", result.failed, "failed");`;
  const withOptions = `const result = await broadcast(
  bot.api,
  subscriberIds,
  "<b>weekly digest</b>\\n\\ncheck the latest posts below.",
  {
    extra: { parse_mode: "HTML" },
    onError: (chatId, error) => {
      console.error("failed for", chatId, error);
      // mark the user as unreachable in your db, etc.
    },
  },
);`;
  head("1aww77h", $$renderer, ($$renderer2) => {
    $$renderer2.title(($$renderer3) => {
      $$renderer3.push(`<title>@yaebal/broadcast — yaebal</title>`);
    });
  });
  $$renderer.push(`<h1>@yaebal/broadcast</h1> <p class="lead">send a text message to many chats, one at a time, counting successes and failures. one blocked user never aborts the rest of the run.</p> <h2>install</h2> `);
  Code($$renderer, { code: install, lang: "sh", title: "shell" });
  $$renderer.push(`<!----> <h2>usage</h2> <p><code>broadcast</code> is a plain async function — it takes <code>bot.api</code> directly and needs no middleware registration.</p> `);
  Code($$renderer, { code: basic, title: "broadcast.ts" });
  $$renderer.push(`<!----> <h2>api</h2> <table><thead><tr><th>export</th><th>kind</th><th>signature</th></tr></thead><tbody><tr><td><code>broadcast</code></td><td>async function</td><td><code>(api, chatIds, text, options?) => Promise&lt;BroadcastResult></code></td></tr><tr><td><code>BroadcastResult</code></td><td>interface</td><td><code>\\{ sent: number; failed: number \\}</code></td></tr><tr><td><code>BroadcastOptions</code></td><td>interface</td><td>see options table below</td></tr></tbody></table> <h2>parameters</h2> <table><thead><tr><th>parameter</th><th>type</th><th>description</th></tr></thead><tbody><tr><td><code>api</code></td><td><code>Api</code></td><td>the bot's API object (<code>bot.api</code>).</td></tr><tr><td><code>chatIds</code></td><td><code>Array&lt;number | string></code></td><td>the list of chat IDs to send to.</td></tr><tr><td><code>text</code></td><td><code>string</code></td><td>the message text.</td></tr><tr><td><code>options.extra</code></td><td><code>Record&lt;string, unknown></code></td><td>extra params merged into every <code>sendMessage</code> call (e.g. <code>parse_mode</code>, <code>reply_markup</code>). per-chat fields (<code>chat_id</code>, <code>text</code>) always win.</td></tr><tr><td><code>options.onError</code></td><td><code>(chatId, error) => void</code></td><td>called for each failed chat. the run continues regardless.</td></tr></tbody></table> <h2>example with options</h2> `);
  Code($$renderer, { code: withOptions, title: "weekly-digest.ts" });
  $$renderer.push(`<!----> <div class="note"><strong>no rate limiting built in.</strong> Telegram allows at most 30 messages per second to different chats. for large audiences pair this with <code>@yaebal/throttle</code> to avoid hitting the limit and triggering 429 errors.</div>`);
}
export {
  _page as default
};
