<script lang="ts">
	import Code from "$lib/Code.svelte";

	const install = `pnpm add @yaebal/commands`;

	const usage = `import { Bot } from "@yaebal/core";
import { commands } from "@yaebal/commands";

const bot = new Bot(process.env.BOT_TOKEN!);

const cmd = commands()
  .add("start", "start the bot", async (ctx) => {
    await ctx.reply(\`welcome! args: \${ctx.args.join(", ")}\`);
  })
  .add("help", "show help", async (ctx) => {
    await ctx.reply("available commands: /start, /help");
  });

// wire the handlers onto the bot
bot.install(cmd.plugin());

// push the /command menu — only the menus that changed
await cmd.sync(bot.api);

bot.start();`;

	const typed = `import type { Context } from "@yaebal/core";
import { session } from "@yaebal/session";

type MyContext = Context & { session: { count: number } };

const cmd = commands<MyContext>().add("count", "count up", async (ctx) => {
  // ctx.session (from the session plugin) and ctx.args are fully typed
  await ctx.reply(\`count: \${++ctx.session.count}, args: \${ctx.args.length}\`);
});

// the bot must provide MyContext before install — checked by the compiler
bot.install(session({ initial: () => ({ count: 0 }) })).install(cmd.plugin());`;

	const localized = `const cmd = commands()
  .add("start", { default: "start the bot", ru: "запустить бота" }, handler)
  .add("help", { default: "show help", ru: "показать помощь" }, handler);

// pushes the default menu + one menu per locale;
// commands missing a locale fall back to their default text
await cmd.register(bot.api);`;

	const scoped = `const cmd = commands().add("start", "start the bot", handler);

cmd.scoped({ type: "all_chat_administrators" })
  .add("ban", "ban a user", banHandler)
  .add("unban", "unban a user", unbanHandler);

await cmd.register(bot.api);
// everyone's menu: /start
// admins' menu:    /start /ban /unban`;

	const shadow = `const cmd = commands().add("start", "start the bot", handler);
cmd.scoped({ type: "all_private_chats" })
  .add("start", "start the bot (dm)", dmHandler);

await cmd.register(bot.api);
// default menu:        /start (generic text)
// private-chats menu:  /start (dm text)`;

	const extras = `const cmd = commands()
  // ["name", ...aliases] — every name is handled, only the first shows in the menu
  .add(["settings", "prefs"], "open settings", handler)
  // handled but never shown in any menu (debug/admin commands)
  .hidden("debug", async (ctx) => ctx.reply("debug info"))
  // menu-only: no handlers — the command is handled elsewhere (a router, a scene)
  .add("report", "file a report");`;

	const inspect = `cmd.list();                          // default menu: { command, description }[]
cmd.list({ languageCode: "ru" });    // ru menu, falling back to default text
cmd.list({ scope: { type: "all_chat_administrators" } });
cmd.menus();                         // every (scope, language) menu register() would push

// a /help text from the same source of truth
bot.command("help", (ctx) =>
  ctx.reply(cmd.list().map((c) => \`/\${c.command} — \${c.description}\`).join("\\n")),
);`;

	const lifecycle = `await cmd.register(bot.api);                         // push every menu
await cmd.register(bot.api, { languageCode: "ru" }); // push a single menu
const { pushed, skipped } = await cmd.sync(bot.api); // push only what changed
await cmd.unregister(bot.api);                       // deleteMyCommands for every menu`;

	const testing = `import { createTestEnv } from "@yaebal/test";

const env = createTestEnv(new Composer<Context>().install(cmd.plugin()));
await env.createUser().sendCommand("start");
env.lastApiCall("sendMessage"); // assert the reply

await cmd.register(env.api); // menu pushes are recorded too
env.callsTo("setMyCommands");`;
</script>

<svelte:head>
	<title>@yaebal/commands — yaebal</title>
</svelte:head>

<h1>@yaebal/commands</h1>
<p class="lead">
	one registry for command handlers and the telegram <code>/</code> command menu — define each
	command once (name, menu description, handlers), wire the handlers with <code>plugin()</code>,
	and push the menu with <code>register()</code> or the diff-aware <code>sync()</code>. supports
	localized descriptions, menu scopes, aliases and hidden commands, and validates everything at
	<code>add()</code> time.
</p>

<h2>install</h2>
<Code code={install} title="terminal" lang="sh" />

<h2>usage</h2>
<p>
	create a registry with <code>commands()</code>, chain <code>.add()</code> calls, then
	<code>bot.install(cmd.plugin())</code> to register the handlers and
	<code>cmd.sync(bot.api)</code> to push the menu to telegram.
</p>
<Code code={usage} title="bot.ts" />

<h2>typed context</h2>
<p>
	the registry is generic over your bot's accumulated context. pass the context type and handlers
	see plugin-added properties with no casting; installing the plugin on a bot that doesn't
	provide that context is a compile error. inside a handler the context also carries the fields
	<code>Composer.command()</code> adds:
</p>
<table>
	<thead>
		<tr><th>context field</th><th>type</th><th>description</th></tr>
	</thead>
	<tbody>
		<tr>
			<td><code>ctx.command</code></td>
			<td><code>string</code></td>
			<td>the matched command name (what the user typed, minus <code>/</code> and <code>@botname</code>)</td>
		</tr>
		<tr>
			<td><code>ctx.args</code></td>
			<td><code>string[]</code></td>
			<td>whitespace-split words after the command</td>
		</tr>
		<tr>
			<td><code>ctx.payload</code></td>
			<td><code>string</code></td>
			<td>the raw trimmed text after the command — deep-link parameters arrive intact</td>
		</tr>
	</tbody>
</table>
<Code code={typed} title="typed.ts" />

<h2>localized descriptions</h2>
<p>
	a description is a plain string or per-locale strings with a required <code>default</code>.
	<code>register()</code> / <code>sync()</code> push the default menu plus one menu per locale
	seen in the registry — commands missing a locale fall back to their <code>default</code> text.
</p>
<Code code={localized} title="localized.ts" />

<h2>scopes</h2>
<p>
	<code>scoped(scope)</code> returns a view whose commands only show in that scope's menu. scoped
	menus repeat the unscoped commands, because telegram <em>replaces</em> (not merges) the command
	list for users a more specific scope matches.
</p>
<Code code={scoped} title="scoped.ts" />

<h2>shadowing an unscoped command in one explicit scope</h2>
<p>
	a name may be defined both unscoped and in <em>one</em> explicit scope — the explicit def
	shadows the unscoped one. that's the escape hatch for targeting the base command's own menu at
	a scope other than the default (e.g. <code>all_private_chats</code> instead of
	<code>BotCommandScopeDefault</code>) without losing the auto-repeat into other explicit scopes
	shown above.
</p>
<Code code={shadow} title="shadow.ts" />
<div class="note">
	since <code>plugin()</code> wires <code>command()</code> by name alone (no scope awareness at
	runtime), the explicit def's handler wins globally, not just inside its scope — a menu-only
	shadow (no handlers) falls back to the unscoped handler instead. two <em>explicit</em> scopes
	can never share a name: nothing at runtime could pick between two differing handlers, so that
	stays a <code>duplicate command name</code> error.
</div>

<h2>aliases, hidden and menu-only commands</h2>
<Code code={extras} title="extras.ts" />

<h2>inspecting the registry</h2>
<Code code={inspect} title="inspect.ts" />

<h2>register, sync, unregister</h2>
<Code code={lifecycle} title="lifecycle.ts" />

<h2>api</h2>
<table>
	<thead>
		<tr><th>export</th><th>signature</th><th>description</th></tr>
	</thead>
	<tbody>
		<tr>
			<td><code>commands</code></td>
			<td><code>&lt;C extends Context&gt;() =&gt; Commands&lt;C&gt;</code></td>
			<td>create a registry typed to your bot's accumulated context</td>
		</tr>
		<tr>
			<td><code>Commands</code></td>
			<td>class</td>
			<td>the registry — see the method table below</td>
		</tr>
		<tr>
			<td><code>ScopedCommands</code></td>
			<td>interface</td>
			<td>the view returned by <code>scoped()</code> — <code>add()</code> only</td>
		</tr>
		<tr>
			<td><code>CommandContext</code></td>
			<td>interface</td>
			<td><code>&#123; command: string; args: string[] &#125;</code> — what handlers see on <code>ctx</code></td>
		</tr>
		<tr>
			<td><code>CommandDescription</code></td>
			<td>type</td>
			<td><code>string</code> or <code>&#123; default: string; [locale]: string &#125;</code></td>
		</tr>
		<tr>
			<td><code>CommandMenu</code></td>
			<td>interface</td>
			<td>one <code>setMyCommands</code> payload: <code>&#123; scope?, languageCode?, commands &#125;</code></td>
		</tr>
		<tr>
			<td><code>SyncResult</code></td>
			<td>interface</td>
			<td><code>&#123; pushed: CommandMenu[]; skipped: CommandMenu[] &#125;</code></td>
		</tr>
		<tr>
			<td><code>BotCommand</code>, <code>BotCommandScope</code></td>
			<td>type re-exports</td>
			<td>the generated telegram types from <code>@yaebal/types</code></td>
		</tr>
	</tbody>
</table>

<h3>Commands&lt;C&gt;</h3>
<table>
	<thead>
		<tr><th>method</th><th>signature</th><th>description</th></tr>
	</thead>
	<tbody>
		<tr>
			<td><code>add</code></td>
			<td><code>(name | [name, ...aliases], description, ...handlers) =&gt; this</code></td>
			<td>define a command; no handlers = menu-only entry — chainable</td>
		</tr>
		<tr>
			<td><code>hidden</code></td>
			<td><code>(name | [name, ...aliases], ...handlers) =&gt; this</code></td>
			<td>define a command with handlers but no menu entry</td>
		</tr>
		<tr>
			<td><code>scoped</code></td>
			<td><code>(scope: BotCommandScope) =&gt; ScopedCommands&lt;C&gt;</code></td>
			<td>a view whose <code>add()</code>s attach commands to a specific menu scope</td>
		</tr>
		<tr>
			<td><code>list</code></td>
			<td><code>(options?: &#123; languageCode?, scope? &#125;) =&gt; BotCommand[]</code></td>
			<td>one menu's <code>&#123; command, description &#125;[]</code>; unknown scopes fall back to default</td>
		</tr>
		<tr>
			<td><code>menus</code></td>
			<td><code>() =&gt; CommandMenu[]</code></td>
			<td>every <code>(scope, language)</code> menu <code>register()</code> would push</td>
		</tr>
		<tr>
			<td><code>plugin</code></td>
			<td><code>() =&gt; Plugin&lt;C, Record&lt;never, never&gt;&gt;</code></td>
			<td>wires every command's (and alias's) handlers — pass to <code>bot.install()</code></td>
		</tr>
		<tr>
			<td><code>register</code></td>
			<td><code>(api, options?: &#123; languageCode?, scope? &#125;) =&gt; Promise&lt;CommandMenu[]&gt;</code></td>
			<td>push every menu via <code>setMyCommands</code>, or a single one via options</td>
		</tr>
		<tr>
			<td><code>sync</code></td>
			<td><code>(api) =&gt; Promise&lt;SyncResult&gt;</code></td>
			<td>diff each menu against <code>getMyCommands</code> and push only what changed</td>
		</tr>
		<tr>
			<td><code>unregister</code></td>
			<td><code>(api) =&gt; Promise&lt;CommandMenu[]&gt;</code></td>
			<td>clear every managed menu via <code>deleteMyCommands</code></td>
		</tr>
	</tbody>
</table>

<h2>validation</h2>
<p>
	<code>add()</code> / <code>hidden()</code> throw early — instead of a late bot api 400 — on:
	names not matching <code>[a-z0-9_]&#123;1,32&#125;</code>, duplicate names or aliases, empty or
	&gt;256-char descriptions, locale keys that aren't two-letter iso 639-1 codes, and menus over
	100 commands (scoped menus count the repeated unscoped commands).
</p>

<h2>testing</h2>
<p>
	with <a href="/docs/plugins/test"><code>@yaebal/test</code></a> the plugin's handlers are driven
	by actors, and menu pushes through <code>env.api</code> are recorded like any other api call:
</p>
<Code code={testing} title="commands.test.ts" />

<div class="note">
	<strong>run <code>sync()</code> on deploy, not <code>register()</code>.</strong>
	<code>sync()</code> reads each menu first and skips unchanged ones, so redeploys don't hammer
	<code>setMyCommands</code>. skip both during local development against a production token to
	avoid overwriting the live menu.
	<br /><br />
	<strong>scope affects the menu, not the handlers.</strong> a command scoped to
	<code>all_chat_administrators</code> is still executable by anyone who types it — guard the
	handler itself (for example with <a href="/docs/plugins/filters"><code>@yaebal/filters</code></a>).
	<br /><br />
	<strong><code>bot.install()</code>, not <code>bot.use()</code>.</strong> the plugin is installed
	via <code>bot.install(cmd.plugin())</code> — <code>install</code> is the method that threads the
	context type through.
	<br /><br />
	<strong>registration order is insertion order.</strong> commands appear in each menu in the
	order they were added, unscoped and scoped interleaved as written.
</div>

<p>
	see the <a href="https://github.com/neverlane/yaebal/tree/master/examples/commands">commands
	example</a> for a focused tour of every feature, the
	<a href="https://github.com/neverlane/yaebal/tree/master/examples/commerce-suite">commerce-suite
	example</a> for the registry driving a real bot's localized menu, and
	<a href="/docs/plugins/router"><code>@yaebal/router</code></a> /
	<a href="/docs/plugins/scenes"><code>@yaebal/scenes</code></a> for the handlers menu-only
	entries typically point at.
</p>
