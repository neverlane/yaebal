import { h as head } from "../../../../../chunks/index.js";
import { C as Code } from "../../../../../chunks/Code.js";
function _page($$renderer) {
  const install = `pnpm add @yaebal/pagination`;
  const setup = `import { Bot } from "@yaebal/core";
import { pagination } from "@yaebal/pagination";

const bot = new Bot(token);

const userList = pagination<string>({
  id: "users",        // namespaces callback_data — must be unique per list
  pageSize: 5,        // items per page (default 5)
  source: async (ctx) => fetchAllUsers(),   // may be async
  line: (name, index) => \`\${index + 1}. \${name}\`,
});

// register the prev/next button handler
bot.install(userList.plugin());

// send the first page on command
bot.command("users", (ctx) => userList.send(ctx));`;
  const customHeader = `const itemList = pagination<string>({
  id: "items",
  source: () => ["apple", "banana", "cherry", "date", "elderberry", "fig"],
  line: (item, i) => \`\${i}: \${item}\`,
  header: (page, pages) => \`results — page \${page + 1} of \${pages}\`,
});`;
  head("101pixm", $$renderer, ($$renderer2) => {
    $$renderer2.title(($$renderer3) => {
      $$renderer3.push(`<title>@yaebal/pagination — yaebal</title>`);
    });
  });
  $$renderer.push(`<h1>@yaebal/pagination</h1> <p class="lead">paginated inline lists with automatic prev/next navigation. renders a page of items as a message, attaches ◀ / ▶ buttons, and handles the button presses — editing the message in place.</p> <h2>install</h2> `);
  Code($$renderer, { code: install, lang: "sh", title: "shell" });
  $$renderer.push(`<!----> <h2>registration</h2> <p><code>pagination(options)</code> returns a <code>Pagination</code> object. call <code>bot.install(list.plugin())</code> to register the callback handler, then <code>list.send(ctx)</code> to display the first page.</p> `);
  Code($$renderer, { code: setup, title: "user-list.ts" });
  $$renderer.push(`<!----> <h2>api</h2> <table><thead><tr><th>export</th><th>kind</th><th>description</th></tr></thead><tbody><tr><td><code>pagination</code></td><td>function</td><td><code>(options: PaginationOptions&lt;T>) => Pagination</code></td></tr><tr><td><code>PaginationOptions</code></td><td>interface</td><td>configuration — see options table.</td></tr><tr><td><code>Pagination</code></td><td>interface</td><td>the object returned by <code>pagination()</code>.</td></tr></tbody></table> <h2>PaginationOptions</h2> <table><thead><tr><th>field</th><th>type</th><th>required</th><th>description</th></tr></thead><tbody><tr><td><code>id</code></td><td><code>string</code></td><td>yes</td><td>unique namespace for this list's <code>callback_data</code>. must not contain <code>:</code>.</td></tr><tr><td><code>source</code></td><td><code>(ctx: Context) => T[] | Promise&lt;T[]></code></td><td>yes</td><td>returns the full item list. called on every page render.</td></tr><tr><td><code>line</code></td><td><code>(item: T, index: number) => string</code></td><td>yes</td><td>renders one item. <code>index</code> is the global index across all pages.</td></tr><tr><td><code>pageSize</code></td><td><code>number</code></td><td>no</td><td>items per page. default <code>5</code>.</td></tr><tr><td><code>header</code></td><td><code>(page: number, pages: number) => string</code></td><td>no</td><td>custom page header. default: <code>"page N/M"</code>. <code>page</code> is 0-based (add 1 for display); <code>pages</code> is the total page count (1-based).</td></tr></tbody></table> <h2>Pagination object</h2> <table><thead><tr><th>member</th><th>signature</th><th>description</th></tr></thead><tbody><tr><td><code>plugin()</code></td><td><code>() => Plugin</code></td><td>returns a plugin that intercepts ◀ / ▶ callback queries and edits the message. install with <code>bot.install(list.plugin())</code>.</td></tr><tr><td><code>send(ctx, page?)</code></td><td><code>(ctx: Context, page?: number) => Promise&lt;unknown></code></td><td>sends the list starting at <code>page</code> (default <code>0</code>). only shows ▶ on the first page; both ◀ and ▶ in the middle; only ◀ on the last.</td></tr></tbody></table> <h2>custom header example</h2> `);
  Code($$renderer, { code: customHeader, title: "custom-header.ts" });
  $$renderer.push(`<!----> <div class="note"><strong>each <code>id</code> must be unique.</strong> the id is baked into the <code>callback_data</code> via <code>@yaebal/callback-data</code>. two lists with the same <code>id</code> will intercept each other's button presses. <code>@yaebal/keyboard</code> and <code>@yaebal/callback-data</code> are peer dependencies installed automatically.</div>`);
}
export {
  _page as default
};
