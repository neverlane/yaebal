import{a as x,f as y}from"../chunks/CBlwNYzs.js";import"../chunks/Dwy-z0HI.js";import{s as t,f as u,e as g,c as b,$ as v,n as i,r as A}from"../chunks/CILFtpHi.js";import{h as w}from"../chunks/BElR-AbQ.js";import{C as e}from"../chunks/1IpLXSSe.js";var C=y(`<h1>@yaebal/filters</h1> <p class="lead">composable, type-narrowing update filters (the mtcute idea) for the core <code>composer.filter(...)</code> method — combine with <code>and</code> / <code>or</code> / <code>not</code>, and some attach typed data to the context.</p> <h2>install</h2> <!> <h2>the filter() method</h2> <p><code>filter()</code> lives in core. It runs its handlers only when the filter matches, and because
	a filter is a type guard, the handler context is narrowed to <code>C &amp; Add</code> — including
	any data the filter attached.</p> <!> <h2>usage</h2> <!> <h2>built-in filters</h2> <table><thead><tr><th>filter</th><th>matches</th><th>attaches</th></tr></thead><tbody><tr><td><code>text</code></td><td>non-empty message text</td><td><code>ctx.text: string</code></td></tr><tr><td><code>regex(re)</code></td><td>text matches <code>re</code></td><td><code>ctx.match: RegExpMatchArray</code></td></tr><tr><td><code>command(name?)</code></td><td>a <code>/command</code></td><td><code>ctx.command</code>, <code>ctx.args</code></td></tr><tr><td><code>chatType(...t)</code></td><td>chat type in <code>t</code></td><td>—</td></tr><tr><td><code>isPrivate</code> / <code>isGroup</code></td><td>shorthand chat types</td><td>—</td></tr><tr><td><code>fromUser(...ids)</code></td><td>sender id in <code>ids</code></td><td>—</td></tr><tr><td><code>chatId(...ids)</code></td><td>chat id in <code>ids</code></td><td>—</td></tr><tr><td><code>mediaType(...k)</code></td><td>message has media kind <code>k</code></td><td>—</td></tr><tr><td><code>media</code></td><td>any media</td><td>—</td></tr><tr><td><code>hasEntity(type)</code></td><td>message has an entity of <code>type</code></td><td>—</td></tr></tbody></table> <h2>combinators</h2> <ul><li><code>and(a, b, …)</code> — all must match; the attached additions <strong>intersect</strong>.</li> <li><code>or(a, b, …)</code> — any matches; no additions (the matched branch is unknown).</li> <li><code>not(a)</code> — inverts; no additions.</li></ul> <div class="note">All of them are also under one namespace, mtcute-style: <code></code> then <code>filters.command(...)</code>, <code>filters.and(...)</code>.</div> <h2>custom filters</h2> <p>A filter is just an object with a type-guard <code>test</code>. Return <code>true</code> after
	(optionally) attaching data — exactly how <code>regex</code> exposes <code>ctx.match</code>.</p> <!> <div class="note">Filter queries (<code>on("message:text")</code>) still exist and are great for the common case — <code>filter()</code> adds composition, custom predicates, and data attachment on top.</div>`,1);function D(s){const n="pnpm add @yaebal/filters",l=`import { and, or, not, command, regex, isPrivate, fromUser, mediaType } from "@yaebal/filters";

bot.filter(and(isPrivate, command("buy")), (ctx) => ctx.args);   // ctx.args: string[]
bot.filter(regex(/^\\d+$/), (ctx) => ctx.match[0]);              // ctx.match: RegExpMatchArray
bot.filter(or(mediaType("photo"), mediaType("video")), handler);
bot.filter(not(fromUser(BANNED_ID)), handler);`,m=`// composer.filter(filter, ...handlers) — runs handlers only when the filter matches.
// the filter is a TYPE GUARD, so handlers see C & Add:
bot.filter(command("add"), (ctx) => {
  ctx.command; // string
  ctx.args;    // string[]   ← added by the filter, fully typed
});`,h=`import type { Filter, Context } from "@yaebal/core";

// a filter is just a type guard that may attach data:
const fromAdmin: Filter<Context, { isAdmin: true }> = {
  test(ctx): ctx is Context & { isAdmin: true } {
    if (!ADMINS.has(ctx.from?.id ?? 0)) return false;
    Object.assign(ctx, { isAdmin: true });
    return true;
  },
};
bot.filter(fromAdmin, (ctx) => ctx.isAdmin);`;var o=C();w("lx779h",_=>{g(()=>{v.title="@yaebal/filters — yaebal"})});var a=t(u(o),6);e(a,{code:n,title:"terminal",lang:"sh"});var c=t(a,6);e(c,{code:m,title:"filter.ts"});var r=t(c,4);e(r,{code:l,title:"bot.ts"});var d=t(r,10),f=t(b(d));f.textContent='import { filters } from "@yaebal/filters"',i(5),A(d);var p=t(d,6);e(p,{code:h,title:"custom.ts"}),i(2),x(s,o)}export{D as component};
