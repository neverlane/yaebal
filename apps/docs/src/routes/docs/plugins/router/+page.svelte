<script lang="ts">
	import Code from "$lib/Code.svelte";

	const install = `pnpm add @yaebal/router`;

	const structure = `routes/
  use/
    logger.ts            # → bot.use(handler) — mounted first, in file order
  commands/
    start.ts              # → defineCommand("start", ...)
    admin/
      _guard.ts            # → defineGuard(...) gates everything under admin/
      ban.ts               # → defineCommand("ban", ...) — still just "/ban", nesting is organizational
  hears/
    ping.ts                # → defineHears("ping", ...)
  on/
    message.text.ts        # → defineOn("message:text", ...) — dots become ":"
    callback_query.data.ts`;

	const commandFile = `// routes/commands/start.ts
import { defineCommand } from "@yaebal/router";

export default defineCommand("start", { description: "start the bot" }, async (ctx) => {
  await ctx.reply(\`welcome! args: \${ctx.args.join(", ")}\`);
});`;

	const onFile = `// routes/on/message.text.ts
import { defineOn } from "@yaebal/router";

export default defineOn("message:text", async (ctx) => {
  await ctx.reply(\`you said: \${ctx.text}\`); // ctx.text: string — narrowed, not optional
});`;

	const hearsFile = `// routes/hears/ping.ts
import { defineHears } from "@yaebal/router";

export default defineHears("ping", async (ctx) => {
  await ctx.reply(\`pong (matched: \${ctx.match})\`);
});`;

	const useFile = `// routes/use/logger.ts
import { defineUse } from "@yaebal/router";

export default defineUse((ctx, next) => {
  console.log(\`update #\${ctx.update.update_id}\`);
  return next();
});`;

	const guardFile = `// routes/commands/admin/_guard.ts
import { defineGuard } from "@yaebal/router";

export default defineGuard((ctx) => ctx.from?.id === ADMIN_ID);
// gates every route under commands/admin/ — a failing guard stops the update right there,
// exactly like Composer.guard(): nothing registered after it runs for that update`;

	const usage = `import { Bot } from "@yaebal/core";
import { loadRoutes } from "@yaebal/router";
import { fileURLToPath } from "node:url";

const bot = new Bot(process.env.BOT_TOKEN!);
const routesDir = fileURLToPath(new URL("./routes", import.meta.url));

const result = await loadRoutes(bot, routesDir);
console.log(result.routes.map((r) => \`\${r.kind}:\${r.trigger}\`));
// ["use:logger", "command:start", "command:ban", "hears:ping", "on:message:text", ...]

bot.start();`;

	const typedContext = `// routes/router.ts — bind define*() to your bot's own accumulated context once
import type { ContextOf } from "@yaebal/router";
import { createRouter } from "@yaebal/router";
import { bot } from "../bot.js";

export const { defineCommand, defineOn, defineHears, defineUse, defineGuard } =
  createRouter<ContextOf<typeof bot>>();

// routes/commands/start.ts — import the bound helper instead of the bare package
import { defineCommand } from "../router.js";

export default defineCommand("start", async (ctx) => {
  // sees every derive()/decorate() field this bot has, not just the bare Context
  await ctx.reply(ctx.session ? "welcome back" : "welcome");
});`;

	const validation = `// strict (the default): a bad route throws at load time, before the bot ever starts —
// nothing silently registers a handler that can never match.
await loadRoutes(bot, routesDir);
// Error: @yaebal/router: "mesage" is not a telegram update type — did you mean "message"?
//   (in on-query "mesage:text") (in on/mesage.text.js)

// strict: false collects the same failures as warnings instead, and keeps loading the rest —
// handy while iterating with watchRoutes(), where a mid-edit file is expected, not exceptional.
const result = await loadRoutes(bot, routesDir, { strict: false });
result.warnings;
// [{ message: '"mesage" is not a telegram update type — did you mean "message"? ...', file: "on/mesage.text.js" }]`;

	const menuBridge = `// bare — LoadResult.commands is a ready BotCommand[] for the default menu
// (menu-visible: has a meta.description, not hidden, no scope — scoped/localized menus need
// the bridge below)
const result = await loadRoutes(bot, routesDir);
await bot.api.call("setMyCommands", { commands: result.commands });

// full power (scopes, locales, diff-aware sync) via the optional @yaebal/commands peer dependency
import { commands } from "@yaebal/commands";

const registry = commands();
await loadRoutes(bot, routesDir, { commands: registry });
// add your own scoped/localized entries too, then push everything in one sync
registry.scoped({ type: "all_chat_administrators" }).add("audit", "view the audit log");
await registry.sync(bot.api);

// or let router run the sync itself — no separate @yaebal/commands import needed
await loadRoutes(bot, routesDir, { syncCommands: true });          // uses target.api
await loadRoutes(bot, routesDir, { syncCommands: { api: otherApi } });`;

	const watch = `import { watchRoutes } from "@yaebal/router";

// dev only — keeps watching routesDir and hot-swaps the route set on every change, no restart
const stop = await watchRoutes(bot, routesDir, {
  onReload: (result) => console.log("routes reloaded:", result.routes.length),
  onError: (error) => console.error("route reload failed, keeping the last good set:", error),
});

process.once("SIGINT", async () => {
  await stop();
  await bot.stop();
});`;

	const testing = `import { createTestEnv } from "@yaebal/test";
import { Bot } from "@yaebal/core";

const bot = new Bot(process.env.BOT_TOKEN!);
await loadRoutes(bot, routesDir);

const env = createTestEnv(bot);
await env.createUser().sendCommand("start");
env.lastApiCall("sendMessage"); // assert the reply from routes/commands/start.ts`;
</script>

<svelte:head>
	<title>@yaebal/router — yaebal</title>
</svelte:head>

<h1>@yaebal/router</h1>
<p class="lead">
	file-based routing — load <code>commands/</code>, <code>on/</code>, <code>hears/</code>, and
	<code>use/</code> handlers from a <code>routes/</code> directory by convention, typed end to
	end via <code>define*()</code> helpers. a route file's default export is never a bare
	handler — it's a value only <code>defineCommand()</code> / <code>defineOn()</code> /
	<code>defineHears()</code> / <code>defineUse()</code> can produce, so <code>loadRoutes</code>
	can validate the trigger (a typo'd update type or an invalid command name throws at load
	time, with a "did you mean" where it can help) instead of registering a handler nothing will
	ever call.
</p>

<h2>install</h2>
<Code code={install} title="terminal" lang="sh" />

<h2>directory convention</h2>
<p>
	place route files under four sub-directories inside your routes folder. nesting inside any of
	them is purely organizational (and guardable — see below): a nested command or event still
	registers by whatever the route itself declares, not by its path.
</p>
<Code code={structure} title="routes/" lang="text" />
<p>
	files under <code>on/</code> use <code>.</code> as a filename separator for the query, since
	<code>:</code> isn't a legal filename character on every os — dots become <code>:</code>
	automatically (<code>message.text.ts</code> → <code>"message:text"</code>). files starting
	with <code>_</code> are never treated as routes; <code>_guard.ts</code> is the one reserved
	name router looks for.
</p>

<h2>route files</h2>
<p>
	each kind has its own <code>define*()</code> helper, mirroring the matching
	<code>Composer</code> method (<code>command()</code> / <code>on()</code> /
	<code>hears()</code> / <code>use()</code>) — including its context narrowing.
</p>
<Code code={commandFile} title="routes/commands/start.ts" />
<Code code={onFile} title="routes/on/message.text.ts" />
<Code code={hearsFile} title="routes/hears/ping.ts" />
<Code code={useFile} title="routes/use/logger.ts" />
<p>
	<code>use/</code> is the escape hatch for anything the other three don't fit: a plain
	middleware file, several handlers of different kinds in one file, or a whole standalone
	<code>Composer</code> (<code>defineUse(someComposer)</code> — it's collapsed via
	<code>toMiddleware()</code>).
</p>

<h2>usage</h2>
<p>
	call <code>loadRoutes(bot, dir)</code> once after constructing the bot. it scans every
	sub-directory, validates and imports each file, and registers routes in a fixed order —
	<code>use</code> → <code>commands</code> → <code>hears</code> → <code>on</code>, regardless of
	file-system order — then returns what it registered.
</p>
<Code code={usage} title="bot.ts" />

<h2>typed context with createRouter()</h2>
<p>
	the bare <code>defineCommand</code> etc. default to the plain <code>Context</code>. bind them
	once to your bot's own accumulated context — <code>derive()</code>/<code>decorate()</code>
	extras included — with <code>createRouter&lt;ContextOf&lt;typeof bot&gt;&gt;()</code>, and
	import the bound helpers from route files instead of the bare package.
</p>
<Code code={typedContext} title="router.ts + a route file" />

<h2>nested guards</h2>
<p>
	a <code>_guard.ts</code> default-exporting <code>defineGuard(predicate)</code> gates every
	route in its own directory and every subdirectory beneath it, across all four kinds. a route
	nested several levels deep collects every guard from its directory up to the routes root,
	evaluated outermost first — every one of them has to pass.
</p>
<Code code={guardFile} title="routes/commands/admin/_guard.ts" />
<div class="note">
	a broken <code>_guard.ts</code> — one that fails to import, or doesn't default-export
	<code>defineGuard(...)</code> — always throws, even under <code>strict: false</code>. a guard
	is access control; silently downgrading a broken one to "no guard" would be a security
	regression, not a lint warning.
</div>

<h2>ordering</h2>
<p>
	directory scans are sorted (natural, numeric-aware), so registration order never depends on
	the filesystem's own listing order. give a file a numeric prefix (<code>10-first.ts</code>,
	<code>20-second.ts</code>) to control its position within a directory — the prefix is
	stripped from the trigger/label, it's ordering only.
</p>

<h2>validation</h2>
<p>
	<code>loadRoutes</code> checks every route before registering anything: the default export
	must come from a <code>define*()</code> helper, an <code>on()</code> query's update type must
	be real (checked against <code>@yaebal/core</code>'s own <code>updateNames</code>, with a
	"did you mean" for close typos), a command name must match telegram's
	<code>[a-z0-9_]&#123;1,32&#125;</code>, and no two files may claim the same trigger. a route
	whose file name doesn't match its own declared trigger (copy-paste drift) is always just a
	warning — the route still registers as declared.
</p>
<Code code={validation} title="strict vs. non-strict" />

<h2>the bot's command menu</h2>
<p>
	<code>LoadResult.commands</code> is always a ready <code>BotCommand[]</code> built from every
	<code>defineCommand</code>'s <code>meta.description</code> — router only ever reads
	<code>(name, description, scope)</code> for this, never handlers: the handlers are wired by
	<code>loadRoutes</code> itself regardless of these options, so nothing double-registers.
</p>
<Code code={menuBridge} title="menu.ts" />

<h2>dev hot-reload with watchRoutes()</h2>
<p>
	<code>watchRoutes(bot, dir, options)</code> behaves like <code>loadRoutes</code> for its first
	build (a bad route still throws, same as <code>loadRoutes</code> would), then keeps watching
	<code>dir</code> and swaps in the new route set on every change — no process restart. it
	mounts exactly one stable middleware (<code>Composer</code>/<code>Bot</code> can't drop a
	middleware once added) that delegates to a rebuildable off-bot registry, so an update already
	in flight finishes against whichever route set was live when it started.
</p>
<Code code={watch} title="dev entrypoint" />
<div class="note">
	<strong><code>strict</code> defaults to <code>false</code> under <code>watchRoutes</code></strong>
	(the opposite of <code>loadRoutes</code>): a route file mid-edit is expected during
	development, not exceptional — it becomes a warning delivered via <code>onReload</code>
	instead of killing the watcher. a live rebuild that still throws (a broken
	<code>_guard.ts</code>, or an explicit <code>strict: true</code>) reports through
	<code>onError</code> and keeps the previous, last-good route set mounted.
	<br /><br />
	<strong>dev only.</strong> cache-busted re-imports leak the previous module instance on every
	reload (node has no way to unload an es module), and the fallback watcher re-scans the
	directory tree on every change. use <code>loadRoutes</code> in production.
</div>

<h2>testing</h2>
<p>
	with <a href="/docs/plugins/test"><code>@yaebal/test</code></a> a routed bot is driven the
	same way any other bot is — <code>loadRoutes</code> runs once before <code>createTestEnv</code>
	wraps it:
</p>
<Code code={testing} title="router.test.ts" />

<h2>api</h2>
<table>
	<thead>
		<tr><th>export</th><th>signature</th><th>description</th></tr>
	</thead>
	<tbody>
		<tr>
			<td><code>loadRoutes</code></td>
			<td><code>(target, dir, options?: LoadOptions) =&gt; Promise&lt;LoadResult&gt;</code></td>
			<td>scan, validate, and register every route — see <code>LoadOptions</code>/<code>LoadResult</code> below</td>
		</tr>
		<tr>
			<td><code>watchRoutes</code></td>
			<td><code>(target, dir, options?: WatchOptions) =&gt; Promise&lt;() =&gt; Promise&lt;void&gt;&gt;</code></td>
			<td>like <code>loadRoutes</code>, plus dev hot-reload — returns a disposer</td>
		</tr>
		<tr>
			<td><code>defineCommand</code></td>
			<td><code>(name | [name, ...aliases], meta?, ...handlers) =&gt; RouteDef</code></td>
			<td>a <code>commands/</code> route — <code>ctx.command</code>/<code>args</code>/<code>payload</code>, menu-visible via <code>meta.description</code></td>
		</tr>
		<tr>
			<td><code>defineOn</code></td>
			<td><code>&lt;Q extends FilterQuery&gt;(query: Q, ...handlers) =&gt; RouteDef</code></td>
			<td>an <code>on/</code> route, narrowed exactly like <code>Composer.on(query, ...)</code></td>
		</tr>
		<tr>
			<td><code>defineHears</code></td>
			<td><code>(trigger: string | RegExp, ...handlers) =&gt; RouteDef</code></td>
			<td>a <code>hears/</code> route — exposes <code>ctx.match</code></td>
		</tr>
		<tr>
			<td><code>defineUse</code></td>
			<td><code>(...items: (Composer | Middleware)[]) =&gt; RouteDef</code></td>
			<td>a <code>use/</code> route — a standalone composer or bare middleware</td>
		</tr>
		<tr>
			<td><code>defineGuard</code></td>
			<td><code>(predicate: (ctx) =&gt; boolean | Promise&lt;boolean&gt;) =&gt; RouteDef</code></td>
			<td>a <code>_guard.ts</code> route — gates its directory and subdirectories</td>
		</tr>
		<tr>
			<td><code>createRouter</code></td>
			<td><code>&lt;C extends Context&gt;() =&gt; RouterHelpers&lt;C&gt;</code></td>
			<td>every <code>define*</code> helper, bound to <code>C</code></td>
		</tr>
		<tr>
			<td><code>ContextOf</code></td>
			<td><code>type ContextOf&lt;T&gt; = T extends Composer&lt;infer C&gt; ? C : never</code></td>
			<td>extracts a bot's accumulated context type — <code>ContextOf&lt;typeof bot&gt;</code></td>
		</tr>
		<tr>
			<td><code>RouteTarget</code></td>
			<td>interface</td>
			<td>the minimal surface a router needs — satisfied by <code>Bot</code>/<code>Composer</code></td>
		</tr>
	</tbody>
</table>

<h3>LoadOptions</h3>
<table>
	<thead>
		<tr><th>field</th><th>type</th><th>description</th></tr>
	</thead>
	<tbody>
		<tr>
			<td><code>strict</code></td>
			<td><code>boolean</code></td>
			<td>throw on validation failures instead of warning — default <code>true</code> (<code>loadRoutes</code>) / <code>false</code> (<code>watchRoutes</code>)</td>
		</tr>
		<tr>
			<td><code>extensions</code></td>
			<td><code>string[]</code></td>
			<td>module extensions to import — default <code>[".js", ".mjs", ".cjs", ".ts"]</code></td>
		</tr>
		<tr>
			<td><code>commands</code></td>
			<td><code>CommandsRegistryLike</code></td>
			<td>feed menu-visible commands into your own <code>@yaebal/commands</code> registry</td>
		</tr>
		<tr>
			<td><code>syncCommands</code></td>
			<td><code>boolean | &#123; api &#125;</code></td>
			<td>diff-sync the menu to telegram via the optional <code>@yaebal/commands</code> peer dependency</td>
		</tr>
	</tbody>
</table>

<h3>LoadResult</h3>
<table>
	<thead>
		<tr><th>field</th><th>type</th><th>description</th></tr>
	</thead>
	<tbody>
		<tr>
			<td><code>routes</code></td>
			<td><code>RegisteredRoute[]</code></td>
			<td><code>&#123; kind, trigger, aliases?, file &#125;[]</code>, in registration order</td>
		</tr>
		<tr>
			<td><code>commands</code></td>
			<td><code>BotCommand[]</code></td>
			<td>the default-menu commands — see "the bot's command menu" above</td>
		</tr>
		<tr>
			<td><code>warnings</code></td>
			<td><code>RouterWarning[]</code></td>
			<td><code>&#123; message, file? &#125;[]</code> — populated under <code>strict: false</code>, plus filename/trigger mismatches always</td>
		</tr>
	</tbody>
</table>

<p>
	see the
	<a href="https://github.com/neverlane/yaebal/tree/master/examples/modular-router">modular-router
	example</a> for all four route kinds, a nested guard, the menu bridge, and
	<code>watchRoutes</code> in one runnable bot, and
	<a href="/docs/plugins/commands"><code>@yaebal/commands</code></a> for the full registry api
	(scopes, locales, aliases, <code>sync()</code>/<code>register()</code>) behind the optional
	menu bridge.
</p>
