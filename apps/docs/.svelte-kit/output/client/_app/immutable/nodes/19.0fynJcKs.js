import{a as c,f as h}from"../chunks/CBlwNYzs.js";import"../chunks/Dwy-z0HI.js";import{s as e,f,e as p,$ as g,n as m}from"../chunks/CILFtpHi.js";import{h as b}from"../chunks/BElR-AbQ.js";import{C as t}from"../chunks/1IpLXSSe.js";var y=h('<h1>@yaebal/files</h1> <p class="lead">resolve and download Telegram files. adds <code>ctx.files</code> with two helpers: get a CDN URL for any <code>file_id</code>, or buffer the whole file into a <code>Uint8Array</code>.</p> <h2>install</h2> <!> <h2>registration</h2> <p>call <code>bot.install(files())</code> once. the plugin adds <code>ctx.files</code> to every subsequent handler in the chain.</p> <!> <h2>api</h2> <table><thead><tr><th>export</th><th>kind</th><th>signature</th><th>description</th></tr></thead><tbody><tr><td><code>files</code></td><td>function</td><td><code>() =&gt; Plugin</code></td><td>returns the plugin. install with <code>bot.install(files())</code>.</td></tr><tr><td><code>FilesControl</code></td><td>interface</td><td>—</td><td>the type of <code>ctx.files</code>.</td></tr></tbody></table> <h2>ctx.files</h2> <table><thead><tr><th>method</th><th>signature</th><th>description</th></tr></thead><tbody><tr><td><code>fileLink</code></td><td><code>(fileId: string) =&gt; Promise&lt;string&gt;</code></td><td>calls <code>getFile</code> then returns the full CDN URL. throws if <code>file_path</code> is absent.</td></tr><tr><td><code>download</code></td><td><code>(fileId: string) =&gt; Promise&lt;Uint8Array&gt;</code></td><td>resolves the URL via <code>fileLink</code> then <code>fetch</code>es it into memory. throws on a non-2xx response.</td></tr></tbody></table> <h2>example</h2> <!> <div class="note"><strong>buffers the whole file.</strong> <code>download</code> uses <code>fetch</code> + <code>arrayBuffer()</code> — the entire file lands in memory before you get the bytes. for large files (video, documents) consider streaming from the URL returned by <code>fileLink</code> instead.</div>',1);function U(l){const s="pnpm add @yaebal/files",n=`import { Bot } from "@yaebal/core";
import { files } from "@yaebal/files";

const bot = new Bot(token);
bot.install(files());`,a=`bot.on("message:photo", async (ctx) => {
  const photo = ctx.photo[ctx.photo.length - 1];

  // get a download URL for the file
  const url = await ctx.files.fileLink(photo.file_id);
  console.log("url:", url);

  // download the whole file into memory
  const bytes = await ctx.files.download(photo.file_id);
  console.log("size:", bytes.byteLength, "bytes");
});`;var o=y();b("1gneyep",u=>{p(()=>{g.title="@yaebal/files — yaebal"})});var d=e(f(o),6);t(d,{code:s,lang:"sh",title:"shell"});var i=e(d,6);t(i,{code:n,title:"bot.ts"});var r=e(i,12);t(r,{code:a,title:"download-photo.ts"}),m(2),c(l,o)}export{U as component};
