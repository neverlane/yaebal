import{a as h,f as c}from"../chunks/CBlwNYzs.js";import"../chunks/Dwy-z0HI.js";import{s as e,f as p,e as m,$ as u,n as g}from"../chunks/CILFtpHi.js";import{h as b}from"../chunks/BElR-AbQ.js";import{C as t}from"../chunks/1IpLXSSe.js";var f=c('<h1>@yaebal/media-group</h1> <p class="lead">collect Telegram album updates into a single handler call. Telegram delivers each photo or video in an album as a separate update sharing a <code>media_group_id</code>; this plugin debounces them and fires your handler once with all parts.</p> <h2>install</h2> <!> <h2>registration</h2> <p>pass the handler and optional options directly to <code>mediaGroup()</code>, then install the result with <code>bot.install()</code>.</p> <!> <h2>api</h2> <table><thead><tr><th>export</th><th>kind</th><th>description</th></tr></thead><tbody><tr><td><code>mediaGroup</code></td><td>function</td><td><code>(handler: MediaGroupHandler, options?: MediaGroupOptions) =&gt; Plugin</code></td></tr><tr><td><code>MediaGroupHandler</code></td><td>type alias</td><td><code>(ctx: Context, messages: Message[]) =&gt; unknown | Promise&lt;unknown&gt;</code></td></tr><tr><td><code>MediaGroupOptions</code></td><td>interface</td><td>see options table.</td></tr></tbody></table> <h2>MediaGroupOptions</h2> <table><thead><tr><th>field</th><th>type</th><th>default</th><th>description</th></tr></thead><tbody><tr><td><code>delayMs</code></td><td><code>number</code></td><td><code>200</code></td><td>how long to wait after the last album part arrives before firing the handler. each new part resets the debounce timer.</td></tr></tbody></table> <h2>example — save an album</h2> <!> <div class="note"><strong>album messages are consumed.</strong> updates with a <code>media_group_id</code> never reach other handlers — the plugin intercepts them entirely. messages without a <code>media_group_id</code> are passed through normally. multiple concurrent albums are tracked independently by their <code>media_group_id</code>. the <code>ctx</code> passed to the handler is the context of the first part that arrived.</div>',1);function M(s){const r="pnpm add @yaebal/media-group",i=`import { Bot } from "@yaebal/core";
import { mediaGroup } from "@yaebal/media-group";

const bot = new Bot(token);

bot.install(
  mediaGroup(
    (ctx, messages) => {
      console.log("album received:", messages.length, "parts");
      // messages[0] is the first update that arrived for this album
    },
    { delayMs: 200 }, // optional — default is 200 ms
  ),
);`,n=`bot.install(
  mediaGroup(async (ctx, messages) => {
    for (const msg of messages) {
      const photo = msg.photo?.[msg.photo.length - 1];
      if (photo) {
        const url = await ctx.files.fileLink(photo.file_id);
        await db.savePhoto(url);
      }
    }
    await ctx.reply(\`saved \${messages.length} photos\`);
  }),
);`;var a=f();b("1xxxg56",y=>{m(()=>{u.title="@yaebal/media-group — yaebal"})});var o=e(p(a),6);t(o,{code:r,lang:"sh",title:"shell"});var d=e(o,6);t(d,{code:i,title:"bot.ts"});var l=e(d,12);t(l,{code:n,title:"save-album.ts"}),g(2),h(s,a)}export{M as component};
