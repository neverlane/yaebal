import { h as head } from "../../../../../chunks/index.js";
import { C as Code } from "../../../../../chunks/Code.js";
function _page($$renderer) {
  const install = `import { Bot } from "@yaebal/core";
import { mediaCache } from "@yaebal/media-cache";
import { media } from "@yaebal/core";

const bot = new Bot(token);
const cache = mediaCache(); // defaults to in-memory storage

bot.command("logo", async (ctx) => {
  // first call: uploads the file and stores its file_id under "logo"
  // subsequent calls: skips the upload, sends the cached file_id instead
  await cache.photo(ctx, "logo", media.path("./assets/logo.png"));
});`;
  const customStorage = `import { mediaCache } from "@yaebal/media-cache";
import { RedisStorage } from "./my-redis-storage.js"; // your StorageAdapter<string>

const cache = mediaCache({ storage: new RedisStorage() });`;
  const document = `import { media } from "@yaebal/core";

// send a PDF and cache it under "report-2024"
await cache.document(ctx, "report-2024", media.path("./report.pdf"), {
  caption: "Q4 report",
});`;
  const keyConcept = `// "logo-en" and "logo-ru" are independent — distinct keys cache independently
await cache.photo(ctx, "logo-en", media.path("./logo-en.png"));
await cache.photo(ctx, "logo-ru", media.path("./logo-ru.png"));`;
  head("12018rd", $$renderer, ($$renderer2) => {
    $$renderer2.title(($$renderer3) => {
      $$renderer3.push(`<title>media-cache — yaebal</title>`);
    });
  });
  $$renderer.push(`<h1>media-cache</h1> <p class="lead">reuse a <code>file_id</code> instead of re-uploading the same file. the first send uploads the
	local file and stores the returned <code>file_id</code>; every subsequent send under the same key
	skips the upload entirely.</p> <h2>installation</h2> `);
  Code($$renderer, {
    code: `pnpm add @yaebal/media-cache`,
    lang: "sh",
    title: "terminal"
  });
  $$renderer.push(`<!----> <h2>basic usage</h2> <p>create a <code>MediaCache</code> instance with <code>mediaCache()</code>, then call <code>cache.photo</code> or <code>cache.document</code> instead of <code>ctx.sendPhoto</code> / <code>ctx.sendDocument</code> directly. supply a stable string key to identify each asset.</p> `);
  Code($$renderer, { code: install, title: "bot.ts" });
  $$renderer.push(`<!----> <h2>how caching works</h2> <p>on the first call for a key the source is sent as-is (a path, url, or buffer). telegram returns a
	message containing the uploaded file's <code>file_id</code>. <code>media-cache</code> stores that
	id under your key. on the next call it calls <code>media.fileId(cached)</code> instead — no
	upload, just the id.</p> <p>for photos, the <em>last</em> (largest) size in the array is cached — that's the highest-quality
	variant telegram returns.</p> <h2>persistent storage</h2> <p>the default storage is in-memory and lost on restart. pass any <code>StorageAdapter&lt;string></code> from <code>@yaebal/session</code> to persist across
	restarts.</p> `);
  Code($$renderer, { code: customStorage, title: "bot.ts" });
  $$renderer.push(`<!----> <h2>documents</h2> `);
  Code($$renderer, { code: document, title: "send-doc.ts" });
  $$renderer.push(`<!----> <h2>independent keys</h2> <p>keys are caller-supplied strings. distinct keys always cache independently — useful for per-locale
	or per-variant assets.</p> `);
  Code($$renderer, { code: keyConcept, title: "keys.ts" });
  $$renderer.push(`<!----> <h2>api</h2> <table><thead><tr><th>export</th><th>kind</th><th>description</th></tr></thead><tbody><tr><td><code>mediaCache(options?)</code></td><td>function</td><td>creates a <code>MediaCache</code> instance</td></tr><tr><td><code>MediaCache</code></td><td>interface</td><td>the object returned by <code>mediaCache()</code></td></tr><tr><td><code>MediaCacheOptions</code></td><td>interface</td><td><code>storage?: StorageAdapter&lt;string></code></td></tr></tbody></table> <h2>MediaCache methods</h2> <table><thead><tr><th>method</th><th>description</th></tr></thead><tbody><tr><td><code>photo(ctx, key, source, extra?)</code></td><td>send a photo, caching the <code>file_id</code> under <code>key</code></td></tr><tr><td><code>document(ctx, key, source, extra?)</code></td><td>send a document, caching its <code>file_id</code> under <code>key</code></td></tr></tbody></table> <div class="note"><code>source</code> accepts anything <code>@yaebal/core</code>'s <code>MediaSource</code> accepts
	— <code>media.path()</code>, <code>media.url()</code>, <code>media.buffer()</code>, or a bare <code>file_id</code> string. <code>extra</code> is forwarded as send options (caption, parse_mode,
	etc.).</div>`);
}
export {
  _page as default
};
