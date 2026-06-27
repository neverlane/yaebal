import{a as R,f as T}from"../chunks/CBlwNYzs.js";import"../chunks/Dwy-z0HI.js";import{s as e,f as C,e as E,c as s,$ as F,n as o,r}from"../chunks/CILFtpHi.js";import{h as M}from"../chunks/BElR-AbQ.js";import{C as t}from"../chunks/1IpLXSSe.js";var j=T(`<h1>@yaebal/fmt</h1> <p class="lead"><code>html</code> and <code>md</code> tagged templates that parse Telegram's markup subset into
	real entities — with interpolations auto-escaped so user input can never break your formatting.</p> <h2>install</h2> <!> <h2>why</h2> <p>core ships <code>format</code> (entity <em>builders</em>: <code>bold()</code>, <code>link()</code>). <code>@yaebal/fmt</code> adds the <em>parser</em> angle — write familiar
	markdown or HTML, get the same <code></code> back. Both avoid <code>parse_mode</code> entirely, so there is nothing to escape.</p> <!> <h2>auto-escaped interpolation</h2> <p>this is the headline. a <code></code> interpolation is inserted as <strong>literal text</strong> — its <code>*</code>, <code>&lt;</code>, <code>\`</code> are never
	re-parsed as markup. user input cannot inject entities or break the message.</p> <!> <div class="note"><strong>composes with core.</strong> if an interpolation is itself a <code>FormatResult</code> (e.g. from <code>bold()</code> / <code>link()</code>), it's merged in with its offsets shifted —
	so dynamic links don't need attribute parsing, just drop in a <code>link()</code>.</div> <!> <h2>html tags</h2> <!> <h2>markdown syntax</h2> <!> <div class="note">this is a Telegram-oriented dialect (not full CommonMark): same delimiter can't nest in itself,
	and dynamic links compose via core's <code>link()</code> rather than <code></code> (the url interpolation would be escaped as text).</div> <h2>api</h2> <table><thead><tr><th>export</th><th>signature</th><th>returns</th></tr></thead><tbody><tr><td><code>html</code></td><td>tagged template</td><td><code>FormatResult</code></td></tr><tr><td><code>md</code></td><td>tagged template</td><td><code>FormatResult</code></td></tr><tr><td><code>htmlToEntities</code></td><td><code>(s: string)</code></td><td><code>FormatResult</code></td></tr><tr><td><code>mdToEntities</code></td><td><code>(s: string)</code></td><td><code>FormatResult</code></td></tr></tbody></table>`,1);function H(g){const u="pnpm add @yaebal/fmt",f='import { html, md } from "@yaebal/fmt";\n\n// parses into MessageEntity[] — no parse_mode, nothing to escape\nctx.send(html`<b>hello</b> <a href="https://yaebal.dev">docs</a>`);\nctx.send(md`**hello** and \\`code\\` and ||spoiler||`);',v=`const name = "<script>**hax**";

// the interpolation is inserted as LITERAL text — never re-parsed
ctx.send(html\`hi <b>\${name}</b>\`);
// → text: "hi <script>**hax**", one bold entity. no injection possible.`,x=`import { html } from "@yaebal/fmt";
import { bold, link } from "@yaebal/core";

// a FormatResult sub (from core's builders) is MERGED, offsets shifted
ctx.send(html\`welcome \${bold(user.name)} — \${link("open", url)}\`);`,k=`b / strong          → bold
i / em              → italic
u / ins             → underline
s / strike / del    → strikethrough
code                → code
pre                 → pre
a href="…"          → text_link
span.tg-spoiler     → spoiler
tg-spoiler          → spoiler
blockquote          → blockquote`,y="**bold**       __italic__      ~~strike~~\n||spoiler||    `code`          [text](url)\n\\`\\`\\`lang\nmulti-line pre\n\\`\\`\\`";var i=j();M("1k0891",L=>{E(()=>{F.title="@yaebal/fmt — yaebal"})});var n=e(C(i),6);t(n,{code:u,title:"terminal",lang:"sh"});var d=e(n,4),_=e(s(d),13);_.textContent="{ text, entities }",o(3),r(d);var c=e(d,2);t(c,{code:f,title:"basic.ts"});var a=e(c,4),$=e(s(a));$.textContent="$${string}",o(9),r(a);var l=e(a,2);t(l,{code:v,title:"safe.ts"});var m=e(l,4);t(m,{code:x,title:"compose.ts"});var p=e(m,4);t(p,{code:k,title:"supported tags",lang:"text"});var h=e(p,4);t(h,{code:y,title:"supported syntax",lang:"text"});var b=e(h,2),w=e(s(b),3);w.textContent="[x]($${url})",o(),r(b),o(4),R(g,i)}export{H as component};
