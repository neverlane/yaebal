<script lang="ts">
	import Code from "$lib/Code.svelte";
	import Try from "$lib/Try.svelte";

	const install = `pnpm add @yaebal/pagination`;

	const lazy = `const users = pagination({
  id: "users",
  pageSize: 10,
  source: {
    // the plugin asks for one page — paginate in the database
    fetch: ({ offset, limit }) => db.user.findMany({ skip: offset, take: limit }),
    count: () => db.user.count(), // optional — makes "page N/M" exact
  },
  line: (u, i) => \`\${i + 1}. \${u.name}\`,
});`;

	const probe = `const feed = pagination({
  id: "feed",
  source: {
    // no count: the plugin fetches limit + 1 rows — the extra row only
    // answers "is there a next page", it is never rendered
    fetch: ({ offset, limit }) => db.events(offset, limit),
  },
  line: (e) => e.title,
});
// the header shows "page N" until the reader hits the end — then the
// real total is known and it upgrades to "page N/M"`;

	const select = `const shop = pagination({
  id: "shop",
  pageSize: 4,
  columns: 2,                                    // item buttons per row
  source: () => products,
  line: (p) => \`\${p.name} — $\${p.price}\`,       // optional alongside item
  item: (p) => ({ label: p.name, id: p.id }),    // each item is a button
  onSelect: (ctx, sel) => {
    // sel.id keeps its type: numbers stay numbers, strings stay strings
    // sel.page lets a detail card link back to the exact page
    return showCard(ctx, sel.id, sel.page);
  },
});`;

	const rawButtons = `const links = pagination({
  id: "docs",
  source: () => articles,
  // a raw InlineKeyboardButton passes through verbatim — url, web_app,
  // or your own callback_data instead of the built-in select
  item: (a) => ({ text: a.title, url: a.href }),
});`;

	const payload = `import { field } from "@yaebal/callback-data";

const byGenre = pagination({
  id: "genre",
  payload: { genre: field.enum(["fantasy", "sci-fi", "poetry"]) },
  source: {
    fetch: ({ offset, limit, payload }) => db.books(payload.genre, offset, limit),
    count: (ctx, payload) => db.countBooks(payload.genre),
  },
  header: (info) => \`\${info.payload.genre} — page \${info.page + 1}/\${info.pages}\`,
  line: (b) => b.title,
});

// the payload rides the buttons, not server state — it survives restarts
bot.command("fantasy", (ctx) =>
  byGenre.send(ctx, { payload: { genre: "fantasy" } }));`;

	const ownership = `const mine = pagination({
  id: "mine",
  payload: { owner: Number },
  source: { fetch: ({ offset, limit, payload }) => myRows(payload.owner, offset, limit) },
  line: (r) => r.title,
  // the decoded payload is passed to filter — ownership rides the buttons
  filter: (ctx, payload) => ctx.from?.id === payload.owner,
  denied: "not your list",
});

bot.command("mine", (ctx) =>
  mine.send(ctx, { payload: { owner: ctx.from!.id } }));`;

	const embedding = `// view(): render without sending — text, entities, markup, items, page info
const v = await users.view(ctx, { page: 2 });
await ctx.sendPhoto(cover, { caption: v.text, reply_markup: v.markup });

// edit(): re-render in place — the current callback message by default,
// or an explicit target
await users.edit(ctx, { page: 0 });
await users.edit(ctx, { page: 0, chatId, messageId });

// button(): a jump-to-page button for any keyboard. pressing it edits
// that message into the list — menus morph into lists in place
new InlineKeyboard()
  .add(byGenre.button("fantasy", { payload: { genre: "fantasy" } }))
  .add(byGenre.button("sci-fi", { payload: { genre: "sci-fi" } }));`;

	const formatting = `import { bold, format, italic } from "@yaebal/core";

const library = pagination({
  id: "lib",
  source: () => books,
  header: (info) => format\`\${bold("library")} — \${info.count} books\`,
  line: (b) => format\`\${bold(b.title)} — \${italic(b.author)}\`,
  empty: "no books yet",
  labels: { prev: "‹", next: "›" },   // and first/last for ⏮ ⏭
  counter: true,                      // "N/M" button — doubles as refresh
  firstLast: true,                    // ⏮ ⏭ jump buttons
  keyboard: (kb) => kb.row().text("✖ close", "lib:close"),
});`;

	const testing = `import { apiError, createTestEnv } from "@yaebal/test";

const env = createTestEnv(new Composer().install(list.plugin()));
const user = env.createUser();

await user.sendCommand("list");
const bubble = env.lastBotMessage({ withReplyMarkup: true })!;

await user.on(bubble).clickByText("▶");
assert.match(env.lastApiCall("editMessageText")?.params?.text, /page 2/);

// the failure model is testable too
env.onApi("editMessageText", apiError(400, "Bad Request: message is not modified"), { times: 1 });
await user.on(bubble).clickByText("▶"); // swallowed — never reaches onError`;
</script>

<svelte:head>
	<title>@yaebal/pagination — yaebal</title>
</svelte:head>

<h1>@yaebal/pagination</h1>
<p class="lead">
	paginated lists over any data source. renders a page as a telegram message with ◀ / ▶
	navigation (plus optional ⏮ ⏭ jumps and a counter), edits it in place on every press, and
	optionally turns each item into a tappable button with a typed <code>onSelect</code>. sources
	can be a plain array or a lazy <code>{'{ fetch, count? }'}</code> that paginates in the
	database; a typed payload parameterizes one list instance per category, owner, or filter.
</p>

<h2>installation</h2>
<Code code={install} lang="sh" title="terminal" />

<h2>basic usage</h2>
<p>
	<code>pagination(options)</code> returns a <code>Pagination</code> object. install
	<code>list.plugin()</code> once to handle the button presses, then <code>list.send(ctx)</code>
	renders a page into the chat. the plugin adds nothing to the context — everything lives on the
	returned object.
</p>
<Try id="pagination-list" title="bot.ts" />

<h2>lazy sources</h2>
<p>
	an array source re-materializes the whole list on every press — fine in memory, wasteful over a
	database. a lazy source is asked for exactly one page: <code>fetch</code> receives
	<code>{'{ offset, limit, page, ctx, payload }'}</code>. with <code>count</code> the totals are
	exact and <code>fetch</code> + <code>count</code> run in parallel.
</p>
<Code code={lazy} title="lazy.ts" />
<p>
	without <code>count</code> the plugin probes <code>limit + 1</code> rows per page instead of
	counting — the cheapest way to know whether ▶ should exist.
</p>
<Code code={probe} title="probe.ts" />

<h2>items as buttons</h2>
<p>
	<code>item</code> renders each row into the inline keyboard (wrapped into <code>columns</code>
	per row); <code>onSelect</code> handles the tap and the callback query is answered
	automatically. <code>line</code> and <code>item</code> combine freely — text list, button list,
	or both.
</p>
<Code code={select} title="shop.ts" />
<Try id="pagination-select" title="bot.ts" />
<p>
	returning a raw <code>InlineKeyboardButton</code> from <code>item</code> passes it through
	verbatim — url lists, web apps, or custom <code>callback_data</code> routed by your own
	handlers.
</p>
<Code code={rawButtons} title="links.ts" />

<h2>typed payload</h2>
<p>
	<code>payload</code> is a <code>@yaebal/callback-data</code> schema fragment baked into every
	button this list emits. one instance serves every parameterization; the values come back
	decoded in <code>source</code>, <code>header</code>, <code>filter</code>, and
	<code>onSelect</code>. when the schema has required fields, <code>send</code> requires the
	payload at compile time.
</p>
<Code code={payload} title="genres.ts" />

<h2>ownership</h2>
<p>
	in a group everyone sees the same message — <code>filter</code> decides who may press its
	buttons, and <code>denied</code> is the toast the rest get. because the filter receives the
	decoded payload, ownership travels inside the buttons and survives restarts with zero server
	state.
</p>
<Code code={ownership} title="ownership.ts" />

<h2>rendering and navigation</h2>
<p>
	headers, lines, and the empty state accept plain strings or <code>format</code> results —
	entities are merged and offset-shifted for you. page text is clamped to telegram's 4096-char
	limit with entities clipped to the cut.
</p>
<Code code={formatting} title="library.ts" />

<h2>embedding: view, edit, button</h2>
<p>
	the rendered page is not locked inside <code>send</code> — <code>view()</code> returns it for
	your own delivery, <code>edit()</code> re-renders an existing message, and
	<code>button()</code> makes any keyboard open the list in place.
</p>
<Code code={embedding} title="embedding.ts" />

<h2>api</h2>
<table>
	<thead>
		<tr><th>export</th><th>kind</th><th>description</th></tr>
	</thead>
	<tbody>
		<tr><td><code>pagination(options)</code></td><td>function</td><td>build a <code>Pagination</code> — <code>(options: PaginationOptions&lt;T, P&gt;) =&gt; Pagination&lt;T, P&gt;</code></td></tr>
		<tr><td><code>Pagination</code></td><td>interface</td><td><code>plugin</code> / <code>send</code> / <code>edit</code> / <code>view</code> / <code>button</code></td></tr>
		<tr><td><code>PaginationOptions</code></td><td>interface</td><td>configuration — see the options table</td></tr>
		<tr><td><code>PageInfo</code></td><td>interface</td><td><code>page</code>, <code>pages?</code>, <code>count?</code>, <code>hasPrev</code>, <code>hasNext</code>, <code>payload</code></td></tr>
		<tr><td><code>PageQuery</code></td><td>interface</td><td>what a lazy <code>fetch</code> receives</td></tr>
		<tr><td><code>PageView</code></td><td>interface</td><td><code>view()</code> result — <code>text</code>, <code>entities?</code>, <code>markup</code>, <code>items</code> + <code>PageInfo</code></td></tr>
		<tr><td><code>SelectEvent</code></td><td>interface</td><td><code>onSelect</code> event — <code>id</code>, <code>page</code>, <code>payload</code></td></tr>
		<tr><td><code>PaginationItem</code></td><td>interface</td><td><code>{'{ label, id }'}</code> returned by <code>item</code></td></tr>
		<tr><td><code>PaginationContext</code></td><td>type</td><td><code>Context</code> narrowed to a callback query</td></tr>
		<tr><td><code>LazySource</code> / <code>ArraySource</code> / <code>Source</code></td><td>types</td><td>the <code>source</code> shapes</td></tr>
	</tbody>
</table>

<h2>Pagination object</h2>
<table>
	<thead>
		<tr><th>member</th><th>returns</th><th>description</th></tr>
	</thead>
	<tbody>
		<tr><td><code>plugin()</code></td><td><code>Plugin</code></td><td>handles this list's ◀ ▶ ⏮ ⏭ and item presses — <code>bot.install(list.plugin())</code></td></tr>
		<tr><td><code>send(ctx, pageOrOpts?)</code></td><td><code>Promise&lt;Message&gt;</code></td><td>send the page as a new message; <code>send(ctx, 2)</code> or <code>send(ctx, {'{ page, payload }'})</code></td></tr>
		<tr><td><code>edit(ctx, pageOrOpts?)</code></td><td><code>Promise&lt;Message | true&gt;</code></td><td>re-render in place — the callback message, or an explicit <code>chatId</code>/<code>messageId</code>/<code>inlineMessageId</code>; a no-op edit resolves <code>true</code></td></tr>
		<tr><td><code>view(ctx, pageOrOpts?)</code></td><td><code>Promise&lt;PageView&gt;</code></td><td>render without sending</td></tr>
		<tr><td><code>button(label, pageOrOpts?)</code></td><td><code>InlineKeyboardButton</code></td><td>a button that opens the list at <code>page</code> when pressed, from any keyboard</td></tr>
	</tbody>
</table>

<h2>options</h2>
<table>
	<thead>
		<tr><th>option</th><th>default</th><th>description</th></tr>
	</thead>
	<tbody>
		<tr><td><code>id</code></td><td>—</td><td>unique namespace for the <code>callback_data</code>. must not contain <code>:</code> or <code>\</code></td></tr>
		<tr><td><code>source</code></td><td>—</td><td><code>(ctx, payload) =&gt; T[]</code> or <code>{'{ fetch, count? }'}</code></td></tr>
		<tr><td><code>line</code></td><td>—</td><td><code>(item, index, ctx) =&gt; string | FormatResult</code> — a text row; <code>index</code> is global</td></tr>
		<tr><td><code>item</code></td><td>—</td><td><code>(item, index) =&gt; string | {'{ label, id }'} | InlineKeyboardButton</code> — a button row (at least one of <code>line</code>/<code>item</code> is required)</td></tr>
		<tr><td><code>onSelect</code></td><td>—</td><td><code>(ctx, {'{ id, page, payload }'}) =&gt; unknown</code> — item tap handler</td></tr>
		<tr><td><code>pageSize</code></td><td><code>5</code></td><td>items per page</td></tr>
		<tr><td><code>columns</code></td><td><code>1</code></td><td>item buttons per keyboard row</td></tr>
		<tr><td><code>header</code></td><td><code>"page N/M"</code></td><td><code>(info, ctx) =&gt; string | FormatResult</code>; return <code>""</code> to omit</td></tr>
		<tr><td><code>empty</code></td><td><code>"nothing here"</code></td><td>shown when the page has no items — value or <code>(info, ctx) =&gt;</code></td></tr>
		<tr><td><code>payload</code></td><td>—</td><td>callback-data schema fragment carried by every button (<code>$</code>-names reserved)</td></tr>
		<tr><td><code>labels</code></td><td><code>◀ ▶ ⏮ ⏭</code></td><td>navigation button labels — <code>{'{ prev, next, first, last }'}</code></td></tr>
		<tr><td><code>counter</code></td><td><code>false</code></td><td><code>"N/M"</code> button between prev/next; pressing it refreshes the page. pass a function to format it</td></tr>
		<tr><td><code>firstLast</code></td><td><code>false</code></td><td>⏮ ⏭ jump buttons (⏭ needs a known total)</td></tr>
		<tr><td><code>keyboard</code></td><td>—</td><td><code>(kb, info, ctx) =&gt; InlineKeyboard | void</code> — append rows or reshape the keyboard</td></tr>
		<tr><td><code>filter</code></td><td>—</td><td><code>(ctx, payload) =&gt; boolean</code> — gate presses</td></tr>
		<tr><td><code>denied</code></td><td>—</td><td>toast shown when <code>filter</code> rejects</td></tr>
	</tbody>
</table>

<h2>failure model</h2>
<div class="note">
	built for the ways pagination actually fails in production: every callback query is answered in
	a <code>finally</code>, so the client spinner never hangs — even when your <code>source</code>
	throws. a double-tap produces telegram's <code>message is not modified</code> — swallowed, never
	an error. a press on a message older than 48 hours can't be edited — the page is re-sent as a
	fresh message instead. forged or stale callback data (fractional, negative, or out-of-range
	pages — telegram warns clients can send arbitrary <code>callback_data</code>) is clamped, never
	crashes. inline-mode messages are edited through <code>inline_message_id</code>, business-chat
	messages through their connection.
</div>

<h2>production notes</h2>
<div class="note">
	<strong>each <code>id</code> must be unique</strong> — two lists with the same id intercept each
	other's presses. every button press re-renders the page, so give hot lists a lazy
	<code>source</code> (and a cheap <code>count</code>), or rate-limit with
	<code>@yaebal/ratelimiter</code>. <code>callback_data</code> is capped at 64 bytes: keep
	<code>id</code>, item ids, and payload values short — <code>pack</code> throws a clear
	<code>RangeError</code> when a button would not fit. schema changes to <code>payload</code>
	invalidate buttons already on screen (they safely fall through to other handlers).
</div>

<h2>testing</h2>
<p>
	drive the list with <code>@yaebal/test</code> actors: <code>clickByText("▶")</code> presses
	real buttons, <code>lastBotMessage</code> mirrors the edits, and <code>onApi</code> +
	<code>apiError</code> exercise the failure paths. see
	<code>packages/pagination/src/index.test.ts</code> for the full pattern.
</p>
<Code code={testing} title="list.test.ts" />

<h2>related</h2>
<p>
	built on <a href="/docs/plugins/callback-data">@yaebal/callback-data</a> (the wire format and
	the payload schema) and <a href="/docs/plugins/keyboard">@yaebal/keyboard</a> (the markup;
	both are regular dependencies — installed with the plugin). runnable bots:
	<code>examples/pagination</code> (lazy sources, genres via payload, ownership) and
	<code>examples/commerce-suite</code> (a shop catalog with selectable products). for stateful
	multi-screen dialogs, reach for <a href="/docs/plugins/morda">@yaebal/morda</a> instead.
</p>
