import { g as getContext, a as attr, e as ensure_array_like, b as escape_html, c as attr_class, s as store_get, u as unsubscribe_stores } from "../../../chunks/index.js";
import "@sveltejs/kit/internal";
import "../../../chunks/exports.js";
import "../../../chunks/utils.js";
import "@sveltejs/kit/internal/server";
import "../../../chunks/root.js";
import "../../../chunks/state.svelte.js";
import { T as ThemeToggle, n as nav, G as GITHUB } from "../../../chunks/nav.js";
function html(value) {
  var html2 = String(value ?? "");
  var open = "<!---->";
  return open + html2 + "<!---->";
}
const getStores = () => {
  const stores$1 = getContext("__svelte__");
  return {
    /** @type {typeof page} */
    page: {
      subscribe: stores$1.page.subscribe
    },
    /** @type {typeof navigating} */
    navigating: {
      subscribe: stores$1.navigating.subscribe
    },
    /** @type {typeof updated} */
    updated: stores$1.updated
  };
};
const page = {
  subscribe(fn) {
    const store = getStores().page;
    return store.subscribe(fn);
  }
};
function Search($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let query = "";
    let results = [];
    $$renderer2.push(`<div class="search-wrap svelte-1387u27"><div class="box svelte-1387u27"><div class="input-row svelte-1387u27"><svg class="icon svelte-1387u27" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="8"></circle><path d="m21 21-4.35-4.35"></path></svg> <input class="input mono svelte-1387u27" type="search" placeholder="search docs…"${attr("value", query)}/> `);
    {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]--></div> `);
    if (results.length > 0) {
      $$renderer2.push("<!--[0-->");
      $$renderer2.push(`<ul class="results svelte-1387u27"><!--[-->`);
      const each_array = ensure_array_like(results);
      for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
        let result = each_array[$$index];
        $$renderer2.push(`<li><a class="result-item svelte-1387u27"${attr("href", result.url)}><span class="result-title svelte-1387u27">${escape_html(result.meta.title ?? result.url)}</span> <span class="result-excerpt svelte-1387u27">${html(result.excerpt)}</span></a></li>`);
      }
      $$renderer2.push(`<!--]--></ul>`);
    } else {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]--></div></div>`);
  });
}
function Sidebar($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    var $$store_subs;
    function isActive(href) {
      return store_get($$store_subs ??= {}, "$page", page).url.pathname.replace(/\/$/, "") === href.replace(/\/$/, "");
    }
    $$renderer2.push(`<aside class="sidebar svelte-1nhzsi7"><a class="brand unbounded svelte-1nhzsi7" href="/">yaebal</a> `);
    Search($$renderer2);
    $$renderer2.push(`<!----> <nav class="nav svelte-1nhzsi7"><!--[-->`);
    const each_array = ensure_array_like(nav);
    for (let $$index_1 = 0, $$length = each_array.length; $$index_1 < $$length; $$index_1++) {
      let section = each_array[$$index_1];
      $$renderer2.push(`<div class="section svelte-1nhzsi7"><span class="section-title mono svelte-1nhzsi7">${escape_html(section.title)}</span> <!--[-->`);
      const each_array_1 = ensure_array_like(section.items);
      for (let $$index = 0, $$length2 = each_array_1.length; $$index < $$length2; $$index++) {
        let item = each_array_1[$$index];
        $$renderer2.push(`<a${attr_class("item svelte-1nhzsi7", void 0, { "active": isActive(item.href) })}${attr("href", item.href)}>${escape_html(item.label)} `);
        if (item.badge) {
          $$renderer2.push("<!--[0-->");
          $$renderer2.push(`<span class="badge svelte-1nhzsi7">${escape_html(item.badge)}</span>`);
        } else {
          $$renderer2.push("<!--[-1-->");
        }
        $$renderer2.push(`<!--]--></a>`);
      }
      $$renderer2.push(`<!--]--></div>`);
    }
    $$renderer2.push(`<!--]--></nav> <div class="bottom svelte-1nhzsi7"><a class="ghlink svelte-1nhzsi7"${attr("href", GITHUB)} target="_blank" rel="noreferrer">github ↗</a> `);
    ThemeToggle($$renderer2);
    $$renderer2.push(`<!----></div></aside>`);
    if ($$store_subs) unsubscribe_stores($$store_subs);
  });
}
function _layout($$renderer, $$props) {
  let { children } = $$props;
  let menuOpen = false;
  $$renderer.push(`<div class="shell svelte-1bpnej"><div class="mobilebar svelte-1bpnej"><a class="brand unbounded svelte-1bpnej" href="/">yaebal</a> <button class="menu svelte-1bpnej" aria-label="toggle menu"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">`);
  {
    $$renderer.push("<!--[-1-->");
    $$renderer.push(`<path d="M3 12h18M3 6h18M3 18h18"></path>`);
  }
  $$renderer.push(`<!--]--></svg></button></div> <div${attr_class("sidebar-wrap svelte-1bpnej", void 0, { "open": menuOpen })}>`);
  Sidebar($$renderer);
  $$renderer.push(`<!----></div> `);
  {
    $$renderer.push("<!--[-1-->");
  }
  $$renderer.push(`<!--]--> <main class="content svelte-1bpnej"><article class="prose svelte-1bpnej" data-pagefind-body="">`);
  children($$renderer);
  $$renderer.push(`<!----></article></main></div>`);
}
export {
  _layout as default
};
