import{a as m,f as u}from"../chunks/CBlwNYzs.js";import"../chunks/Dwy-z0HI.js";import{s as e,f,e as g,$ as y,n as b}from"../chunks/CILFtpHi.js";import{h as k}from"../chunks/BElR-AbQ.js";import{C as t}from"../chunks/1IpLXSSe.js";var x=u(`<h1>media-cache</h1> <p class="lead">reuse a <code>file_id</code> instead of re-uploading the same file. the first send uploads the
	local file and stores the returned <code>file_id</code>; every subsequent send under the same key
	skips the upload entirely.</p> <h2>installation</h2> <!> <h2>basic usage</h2> <p>create a <code>MediaCache</code> instance with <code>mediaCache()</code>, then call <code>cache.photo</code> or <code>cache.document</code> instead of <code>ctx.sendPhoto</code> / <code>ctx.sendDocument</code> directly. supply a stable string key to identify each asset.</p> <!> <h2>how caching works</h2> <p>on the first call for a key the source is sent as-is (a path, url, or buffer). telegram returns a
	message containing the uploaded file's <code>file_id</code>. <code>media-cache</code> stores that
	id under your key. on the next call it calls <code>media.fileId(cached)</code> instead — no
	upload, just the id.</p> <p>for photos, the <em>last</em> (largest) size in the array is cached — that's the highest-quality
	variant telegram returns.</p> <h2>persistent storage</h2> <p>the default storage is in-memory and lost on restart. pass any <code>StorageAdapter&lt;string&gt;</code> from <code>@yaebal/session</code> to persist across
	restarts.</p> <!> <h2>documents</h2> <!> <h2>independent keys</h2> <p>keys are caller-supplied strings. distinct keys always cache independently — useful for per-locale
	or per-variant assets.</p> <!> <h2>api</h2> <table><thead><tr><th>export</th><th>kind</th><th>description</th></tr></thead><tbody><tr><td><code>mediaCache(options?)</code></td><td>function</td><td>creates a <code>MediaCache</code> instance</td></tr><tr><td><code>MediaCache</code></td><td>interface</td><td>the object returned by <code>mediaCache()</code></td></tr><tr><td><code>MediaCacheOptions</code></td><td>interface</td><td><code>storage?: StorageAdapter&lt;string&gt;</code></td></tr></tbody></table> <h2>MediaCache methods</h2> <table><thead><tr><th>method</th><th>description</th></tr></thead><tbody><tr><td><code>photo(ctx, key, source, extra?)</code></td><td>send a photo, caching the <code>file_id</code> under <code>key</code></td></tr><tr><td><code>document(ctx, key, source, extra?)</code></td><td>send a document, caching its <code>file_id</code> under <code>key</code></td></tr></tbody></table> <div class="note"><code>source</code> accepts anything <code>@yaebal/core</code>'s <code>MediaSource</code> accepts
	— <code>media.path()</code>, <code>media.url()</code>, <code>media.buffer()</code>, or a bare <code>file_id</code> string. <code>extra</code> is forwarded as send options (caption, parse_mode,
	etc.).</div>`,1);function $(r){const i=`import { Bot } from "@yaebal/core";
import { mediaCache } from "@yaebal/media-cache";
import { media } from "@yaebal/core";

const bot = new Bot(token);
const cache = mediaCache(); // defaults to in-memory storage

bot.command("logo", async (ctx) => {
  // first call: uploads the file and stores its file_id under "logo"
  // subsequent calls: skips the upload, sends the cached file_id instead
  await cache.photo(ctx, "logo", media.path("./assets/logo.png"));
});`,n=`import { mediaCache } from "@yaebal/media-cache";
import { RedisStorage } from "./my-redis-storage.js"; // your StorageAdapter<string>

const cache = mediaCache({ storage: new RedisStorage() });`,h=`import { media } from "@yaebal/core";

// send a PDF and cache it under "report-2024"
await cache.document(ctx, "report-2024", media.path("./report.pdf"), {
  caption: "Q4 report",
});`,l=`// "logo-en" and "logo-ru" are independent — distinct keys cache independently
await cache.photo(ctx, "logo-en", media.path("./logo-en.png"));
await cache.photo(ctx, "logo-ru", media.path("./logo-ru.png"));`;var o=x();k("12018rd",_=>{g(()=>{y.title="media-cache — yaebal"})});var a=e(f(o),6);t(a,{code:"pnpm add @yaebal/media-cache",lang:"sh",title:"terminal"});var d=e(a,6);t(d,{code:i,title:"bot.ts"});var c=e(d,12);t(c,{code:n,title:"bot.ts"});var s=e(c,4);t(s,{code:h,title:"send-doc.ts"});var p=e(s,6);t(p,{code:l,title:"keys.ts"}),b(10),m(r,o)}export{$ as component};
