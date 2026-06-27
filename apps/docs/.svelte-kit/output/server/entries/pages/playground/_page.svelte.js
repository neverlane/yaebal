import { h as head, a as attr, b as escape_html, e as ensure_array_like, c as attr_class, ab as stringify } from "../../../chunks/index.js";
import { b as base } from "../../../chunks/server.js";
import "../../../chunks/exports.js";
import "@sveltejs/kit/internal/server";
import "../../../chunks/root.js";
import "@sveltejs/kit/internal";
import "../../../chunks/utils.js";
import "../../../chunks/state.svelte.js";
import "sucrase";
function _page($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let exId = "getting-started";
    let code = "";
    let logs = [];
    let msg = "";
    let busy = false;
    head("j6hxly", $$renderer2, ($$renderer3) => {
      $$renderer3.title(($$renderer4) => {
        $$renderer4.push(`<title>playground — yaebal</title>`);
      });
    });
    $$renderer2.push(`<div class="pg svelte-j6hxly"><header class="svelte-j6hxly"><a class="back svelte-j6hxly"${attr("href", `${stringify(base)}/docs/getting-started`)}>← docs</a> <span class="name unbounded svelte-j6hxly">playground</span> <span class="sub mono svelte-j6hxly">${escape_html(exId)}</span></header> <div class="grid svelte-j6hxly"><section class="pane svelte-j6hxly"><div class="pane-bar svelte-j6hxly"><span class="mono label svelte-j6hxly">bot.ts</span> <button class="run svelte-j6hxly"${attr("disabled", busy, true)}>${escape_html("▶ Run")} <kbd class="svelte-j6hxly">⌘↵</kbd></button></div> <textarea class="editor mono svelte-j6hxly" spellcheck="false">`);
    const $$body = escape_html(code);
    if ($$body) {
      $$renderer2.push(`${$$body}`);
    }
    $$renderer2.push(`</textarea></section> <section class="pane svelte-j6hxly"><div class="pane-bar svelte-j6hxly"><span class="mono label svelte-j6hxly">result</span> <button class="ghost svelte-j6hxly">reset chat</button></div> <div class="chat svelte-j6hxly">`);
    {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]--></div> <div class="composer svelte-j6hxly"><input class="msg svelte-j6hxly" placeholder="send a message to the bot…"${attr("value", msg)}/> <button class="send svelte-j6hxly"${attr("disabled", busy, true)}>send</button></div> `);
    if (logs.length) {
      $$renderer2.push("<!--[0-->");
      $$renderer2.push(`<div class="console svelte-j6hxly"><div class="console-bar mono svelte-j6hxly">console</div> <!--[-->`);
      const each_array = ensure_array_like(logs);
      for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
        let l = each_array[$$index];
        $$renderer2.push(`<div${attr_class(`line ${stringify(l.level)} mono`, "svelte-j6hxly")}>${escape_html(l.text)}</div>`);
      }
      $$renderer2.push(`<!--]--></div>`);
    } else {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]--></section></div></div>`);
  });
}
export {
  _page as default
};
