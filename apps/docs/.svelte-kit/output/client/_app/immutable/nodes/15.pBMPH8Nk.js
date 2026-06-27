import{a as l,f as h}from"../chunks/CBlwNYzs.js";import"../chunks/Dwy-z0HI.js";import{s as t,f as b,e as p,$ as m,n as g}from"../chunks/CILFtpHi.js";import{h as f}from"../chunks/BElR-AbQ.js";import{C as e}from"../chunks/1IpLXSSe.js";var u=h(`<h1>@yaebal/broadcast</h1> <p class="lead">send a text message to many chats, one at a time, counting successes and failures. one blocked user never aborts the rest of the run.</p> <h2>install</h2> <!> <h2>usage</h2> <p><code>broadcast</code> is a plain async function — it takes <code>bot.api</code> directly and needs no middleware registration.</p> <!> <h2>api</h2> <table><thead><tr><th>export</th><th>kind</th><th>signature</th></tr></thead><tbody><tr><td><code>broadcast</code></td><td>async function</td><td><code>(api, chatIds, text, options?) =&gt; Promise&lt;BroadcastResult&gt;</code></td></tr><tr><td><code>BroadcastResult</code></td><td>interface</td><td><code>\\&#123; sent: number; failed: number \\&#125;</code></td></tr><tr><td><code>BroadcastOptions</code></td><td>interface</td><td>see options table below</td></tr></tbody></table> <h2>parameters</h2> <table><thead><tr><th>parameter</th><th>type</th><th>description</th></tr></thead><tbody><tr><td><code>api</code></td><td><code>Api</code></td><td>the bot's API object (<code>bot.api</code>).</td></tr><tr><td><code>chatIds</code></td><td><code>Array&lt;number | string&gt;</code></td><td>the list of chat IDs to send to.</td></tr><tr><td><code>text</code></td><td><code>string</code></td><td>the message text.</td></tr><tr><td><code>options.extra</code></td><td><code>Record&lt;string, unknown&gt;</code></td><td>extra params merged into every <code>sendMessage</code> call (e.g. <code>parse_mode</code>, <code>reply_markup</code>). per-chat fields (<code>chat_id</code>, <code>text</code>) always win.</td></tr><tr><td><code>options.onError</code></td><td><code>(chatId, error) =&gt; void</code></td><td>called for each failed chat. the run continues regardless.</td></tr></tbody></table> <h2>example with options</h2> <!> <div class="note"><strong>no rate limiting built in.</strong> Telegram allows at most 30 messages per second to different chats. for large audiences pair this with <code>@yaebal/throttle</code> to avoid hitting the limit and triggering 429 errors.</div>`,1);function _(r){const s="pnpm add @yaebal/broadcast",c=`import { Bot } from "@yaebal/core";
import { broadcast } from "@yaebal/broadcast";

const bot = new Bot(token);

// send a plain message to every subscriber
const result = await broadcast(bot.api, subscriberIds, "hello everyone!");
console.log(result.sent, "sent,", result.failed, "failed");`,n=`const result = await broadcast(
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
);`;var o=u();f("1aww77h",y=>{p(()=>{m.title="@yaebal/broadcast — yaebal"})});var d=t(b(o),6);e(d,{code:s,lang:"sh",title:"shell"});var a=t(d,6);e(a,{code:c,title:"broadcast.ts"});var i=t(a,12);e(i,{code:n,title:"weekly-digest.ts"}),g(2),l(r,o)}export{_ as component};
