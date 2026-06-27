import { b as escape_html, a as attr } from "./index.js";
function Code($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let { code, title = "", lang = "ts", onTry, running = false } = $$props;
    $$renderer2.push(`<div class="code svelte-168wuw6"><div class="bar svelte-168wuw6"><span class="title mono svelte-168wuw6">${escape_html(title || lang)}</span> <div class="actions svelte-168wuw6">`);
    if (onTry) {
      $$renderer2.push("<!--[0-->");
      $$renderer2.push(`<button class="try-btn svelte-168wuw6"${attr("disabled", running, true)} aria-label="run example">`);
      if (running) {
        $$renderer2.push("<!--[0-->");
        $$renderer2.push(`running…`);
      } else {
        $$renderer2.push("<!--[-1-->");
        $$renderer2.push(`<svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" class="svelte-168wuw6"><path d="M8 5v14l11-7z"></path></svg> Try it`);
      }
      $$renderer2.push(`<!--]--></button>`);
    } else {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]--> <button class="copy svelte-168wuw6" aria-label="copy code">${escape_html("copy")}</button></div></div> `);
    {
      $$renderer2.push("<!--[-1-->");
      $$renderer2.push(`<pre class="mono svelte-168wuw6"><code class="svelte-168wuw6">${escape_html(code.trim())}</code></pre>`);
    }
    $$renderer2.push(`<!--]--></div>`);
  });
}
export {
  Code as C
};
