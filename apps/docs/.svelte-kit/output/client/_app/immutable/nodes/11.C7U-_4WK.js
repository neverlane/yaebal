import{a as u,f}from"../chunks/CBlwNYzs.js";import"../chunks/Dwy-z0HI.js";import{s as e,f as g,e as b,$ as y,n as w}from"../chunks/CILFtpHi.js";import{h as _}from"../chunks/BElR-AbQ.js";import{C as t}from"../chunks/1IpLXSSe.js";var A=f(`<h1>media</h1> <p class="lead">one uniform way to point at a file — local path, url, in-memory buffer, or an existing Telegram
	file_id — and the Api layer picks the right wire form.</p> <h2>the four sources</h2> <p>a <code>MediaSource</code> is a small discriminated, branded object. you never build one by hand —
	use the <code>media.*</code> helpers:</p> <!> <table><thead><tr><th>helper</th><th>kind</th><th>on the wire</th></tr></thead><tbody><tr><td><code>media.path</code></td><td><code>path</code></td><td>read from disk, uploaded as multipart</td></tr><tr><td><code>media.buffer</code></td><td><code>buffer</code></td><td>bytes uploaded as multipart (with optional filename)</td></tr><tr><td><code>media.url</code></td><td><code>url</code></td><td>sent as a plain url string</td></tr><tr><td><code>media.fileId</code></td><td><code>fileId</code></td><td>sent as the file_id string</td></tr></tbody></table> <h2>isMediaSource</h2> <p>every helper brands its result with a unique symbol. <code>isMediaSource</code> checks that brand,
	so a plain object that merely looks like one is rejected — the Api layer uses this to decide what
	to encode.</p> <!> <h2>sending media</h2> <p><code>ctx.sendPhoto</code> and <code>ctx.sendDocument</code> accept a <code>MediaSource</code> or a
	raw <code>file_id</code>/url string directly. extra params (caption, reply markup, …) go in the
	second argument.</p> <!> <h2>how upload works</h2> <p><code>encodeRequest</code> decides the encoding per request. if no <code>path</code> or <code>buffer</code> is present, the body is JSON and any <code>url</code>/<code>fileId</code> media
	is inlined to its string:</p> <!> <p>the moment a <code>path</code> or <code>buffer</code> appears anywhere in the top-level params, the
	whole request switches to <code>multipart/form-data</code>. each upload is written to a generated
	field and the param points at it with <code>attach://</code>:</p> <!> <div class="note"><strong>top-level only.</strong> media is handled at the top level of the params. nested <code>MediaSource</code> (e.g. inside <code>sendMediaGroup</code>'s <code>media[]</code>) is
	rejected loudly rather than silently serialized to garbage — pass media as a top-level param.</div>`,1);function j(n){const c=`import { media } from "@yaebal/core";

media.path("./photo.jpg");                 // local file → uploaded
media.url("https://example.com/p.png");    // remote url → passed as a string
media.buffer(new Uint8Array([…]), "p.png"); // in-memory bytes → uploaded
media.fileId("AgACAgIAAx…");               // already on Telegram → reused`,s=`import { isMediaSource, media } from "@yaebal/core";

isMediaSource(media.fileId("AgAC")); // true — branded with a symbol
isMediaSource({ kind: "fileId", fileId: "x" }); // false — not branded`,p=`bot.command("photo", (ctx) =>
  ctx.sendPhoto(media.url("https://picsum.photos/400"), {
    caption: "a random picture",
  }),
);

bot.command("doc", (ctx) =>
  ctx.sendDocument(media.path("./report.pdf")),
);

// a raw file_id or url string works too — no wrapper required:
ctx.sendPhoto("AgACAgIAAx…");`,l=`// no path/buffer present → JSON, with url/fileId inlined to strings
await encodeRequest({ chat_id: 1, photo: media.fileId("AgAC") });
//   { body: '{"chat_id":1,"photo":"AgAC"}', contentType: "application/json" }

await encodeRequest({ photo: media.url("https://e/p.png") });
//   { body: '{"photo":"https://e/p.png"}', contentType: "application/json" }`,h=`// a path or buffer present → the whole request becomes multipart.
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
//   reply_markup = '{"inline_keyboard":[]}'    (object → JSON)`;var d=A();_("qqogft",v=>{b(()=>{y.title="media — yaebal"})});var o=e(g(d),8);t(o,{code:c,title:"media.ts"});var a=e(o,8);t(a,{code:s,title:"guard.ts"});var i=e(a,6);t(i,{code:p,title:"handler.ts"});var r=e(i,6);t(r,{code:l,title:"api.ts"});var m=e(r,4);t(m,{code:h,title:"api.ts"}),w(2),u(n,d)}export{j as component};
