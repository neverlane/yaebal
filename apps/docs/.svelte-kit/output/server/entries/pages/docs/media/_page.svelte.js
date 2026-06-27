import { h as head } from "../../../../chunks/index.js";
import { C as Code } from "../../../../chunks/Code.js";
function _page($$renderer) {
  const helpers = `import { media } from "@yaebal/core";

media.path("./photo.jpg");                 // local file → uploaded
media.url("https://example.com/p.png");    // remote url → passed as a string
media.buffer(new Uint8Array([…]), "p.png"); // in-memory bytes → uploaded
media.fileId("AgACAgIAAx…");               // already on Telegram → reused`;
  const guard = `import { isMediaSource, media } from "@yaebal/core";

isMediaSource(media.fileId("AgAC")); // true — branded with a symbol
isMediaSource({ kind: "fileId", fileId: "x" }); // false — not branded`;
  const send = `bot.command("photo", (ctx) =>
  ctx.sendPhoto(media.url("https://picsum.photos/400"), {
    caption: "a random picture",
  }),
);

bot.command("doc", (ctx) =>
  ctx.sendDocument(media.path("./report.pdf")),
);

// a raw file_id or url string works too — no wrapper required:
ctx.sendPhoto("AgACAgIAAx…");`;
  const json = `// no path/buffer present → JSON, with url/fileId inlined to strings
await encodeRequest({ chat_id: 1, photo: media.fileId("AgAC") });
//   { body: '{"chat_id":1,"photo":"AgAC"}', contentType: "application/json" }

await encodeRequest({ photo: media.url("https://e/p.png") });
//   { body: '{"photo":"https://e/p.png"}', contentType: "application/json" }`;
  const multipart = `// a path or buffer present → the whole request becomes multipart.
// each upload is attached under a generated field and referenced via attach://
await encodeRequest({
  chat_id: 7,
  photo: media.buffer(new Uint8Array([1, 2, 3]), "pic.png"),
  reply_markup: { inline_keyboard: [] },
});
// FormData:
//   photo        = "attach://_file0"
//   _file0       = <Blob "pic.png">
//   chat_id      = "7"                         (non-string → stringified)
//   reply_markup = '{"inline_keyboard":[]}'    (object → JSON)`;
  head("qqogft", $$renderer, ($$renderer2) => {
    $$renderer2.title(($$renderer3) => {
      $$renderer3.push(`<title>media — yaebal</title>`);
    });
  });
  $$renderer.push(`<h1>media</h1> <p class="lead">one uniform way to point at a file — local path, url, in-memory buffer, or an existing Telegram
	file_id — and the Api layer picks the right wire form.</p> <h2>the four sources</h2> <p>a <code>MediaSource</code> is a small discriminated, branded object. you never build one by hand —
	use the <code>media.*</code> helpers:</p> `);
  Code($$renderer, { code: helpers, title: "media.ts" });
  $$renderer.push(`<!----> <table><thead><tr><th>helper</th><th>kind</th><th>on the wire</th></tr></thead><tbody><tr><td><code>media.path</code></td><td><code>path</code></td><td>read from disk, uploaded as multipart</td></tr><tr><td><code>media.buffer</code></td><td><code>buffer</code></td><td>bytes uploaded as multipart (with optional filename)</td></tr><tr><td><code>media.url</code></td><td><code>url</code></td><td>sent as a plain url string</td></tr><tr><td><code>media.fileId</code></td><td><code>fileId</code></td><td>sent as the file_id string</td></tr></tbody></table> <h2>isMediaSource</h2> <p>every helper brands its result with a unique symbol. <code>isMediaSource</code> checks that brand,
	so a plain object that merely looks like one is rejected — the Api layer uses this to decide what
	to encode.</p> `);
  Code($$renderer, { code: guard, title: "guard.ts" });
  $$renderer.push(`<!----> <h2>sending media</h2> <p><code>ctx.sendPhoto</code> and <code>ctx.sendDocument</code> accept a <code>MediaSource</code> or a
	raw <code>file_id</code>/url string directly. extra params (caption, reply markup, …) go in the
	second argument.</p> `);
  Code($$renderer, { code: send, title: "handler.ts" });
  $$renderer.push(`<!----> <h2>how upload works</h2> <p><code>encodeRequest</code> decides the encoding per request. if no <code>path</code> or <code>buffer</code> is present, the body is JSON and any <code>url</code>/<code>fileId</code> media
	is inlined to its string:</p> `);
  Code($$renderer, { code: json, title: "api.ts" });
  $$renderer.push(`<!----> <p>the moment a <code>path</code> or <code>buffer</code> appears anywhere in the top-level params, the
	whole request switches to <code>multipart/form-data</code>. each upload is written to a generated
	field and the param points at it with <code>attach://</code>:</p> `);
  Code($$renderer, { code: multipart, title: "api.ts" });
  $$renderer.push(`<!----> <div class="note"><strong>top-level only.</strong> media is handled at the top level of the params. nested <code>MediaSource</code> (e.g. inside <code>sendMediaGroup</code>'s <code>media[]</code>) is
	rejected loudly rather than silently serialized to garbage — pass media as a top-level param.</div>`);
}
export {
  _page as default
};
