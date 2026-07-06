<script lang="ts">
	import Code from "$lib/Code.svelte";

	const install = `pnpm add @yaebal/toml`;

	const botToml = `[bot]
name = "demo"

[[commands]]
name = "start"
description = "say hello"
reply = "привет! я бот из toml."

[[commands]]
name = "ping"
description = "check the bot is alive"
handler = "ping"

[[hears]]
regex = "^p[io]ng$"
reply = "pong"

[[messages]]
on = "message:text"
contains = "yaebal"
reply = "yaebal мощь"

[[callbacks]]
data = "profile"
handler = "profileCallback"

[[callbacks]]
regex = "^item:\\\\d+$"
reply = "открываю товар…"`;

	const usage = `import { Bot } from "@yaebal/core";
import { installToml } from "@yaebal/toml";

const bot = new Bot(process.env.BOT_TOKEN!);

installToml(bot, "./bot.toml", {
  syncCommands: true, // push described commands to the / menu on start
  handlers: {
    ping: async (ctx) => {
      await ctx.reply("pong from typescript");
    },
    profileCallback: async (ctx) => {
      await ctx.answerCallbackQuery();
      await ctx.reply("profile");
    },
  },
});

await bot.start();`;

	const pluginUsage = `import { createTomlPlugin } from "@yaebal/toml";

bot.install(createTomlPlugin("./bot.toml", { handlers }));`;

	const rawString = `import { parseTomlConfig, validateTomlConfig } from "@yaebal/toml";

const config = parseTomlConfig(` + "`" + `[[commands]]
name = "start"
reply = "hi"
` + "`" + `);

validateTomlConfig(config);`;
</script>

<svelte:head>
	<title>@yaebal/toml — yaebal</title>
</svelte:head>

<h1>@yaebal/toml</h1>
<p class="lead">
	declarative toml routes for yaebal bots. describe simple commands, text routes, message
	filters, callback queries and replies in toml, then keep real logic in typescript handlers.
</p>

<h2>install</h2>
<Code code={install} title="terminal" lang="sh" />

<h2>bot.toml</h2>
<p>
	all route arrays are optional. an empty config is valid and registers nothing. every route must
	define at least <code>reply</code> or <code>handler</code>. <code>hears</code> takes exactly one
	of <code>text</code> (exact match) or <code>regex</code>; <code>callbacks</code> takes exactly
	one of <code>data</code> or <code>regex</code>. a <code>regex</code> value is compiled with
	<code>new RegExp()</code> at install time — an invalid pattern is a startup error, not a dead
	route.
</p>
<Code code={botToml} title="bot.toml" lang="toml" />

<h2>usage</h2>
<p>
	call <code>installToml</code> once before <code>bot.start()</code>. it accepts a file path,
	a raw toml string, or an already parsed object, and returns the same bot or composer instance.
	the whole config is validated up front, so a bad route can never leave the bot half-wired.
</p>
<Code code={usage} title="index.ts" />

<h2>command menu</h2>
<p>
	with <code>syncCommands: true</code>, commands that have a <code>description</code> are pushed
	to the telegram command menu (<code>setMyCommands</code>) once the bot starts. commands without
	a description are still routed — they just stay out of the menu. <code>syncCommands</code>
	needs a <code>Bot</code> target (it hooks <code>onStart</code>); installing on a plain
	<code>Composer</code> fails with a readable error.
</p>

<h2>handler registry</h2>
<p>
	<code>handler = "name"</code> looks up <code>options.handlers.name</code>. if the handler is
	missing, installation fails with a readable startup error instead of silently skipping the route.
</p>
<table>
	<thead>
		<tr><th>toml</th><th>registered as</th></tr>
	</thead>
	<tbody>
		<tr><td><code>[[commands]] name = "start" reply = "hi"</code></td><td><code>bot.command("start", ctx =&gt; ctx.reply("hi"))</code></td></tr>
		<tr><td><code>[[hears]] text = "ping" reply = "pong"</code></td><td><code>bot.hears("ping", ...)</code> — exact match</td></tr>
		<tr><td><code>[[hears]] regex = "^p[io]ng$"</code></td><td><code>bot.hears(/^p[io]ng$/, ...)</code></td></tr>
		<tr><td><code>[[messages]] on = "message:text" contains = "x"</code></td><td><code>bot.on("message:text", ...)</code> plus a text filter</td></tr>
		<tr><td><code>[[callbacks]] data = "profile" handler = "profile"</code></td><td><code>bot.callbackQuery("profile", handlers.profile)</code></td></tr>
		<tr><td><code>[[callbacks]] regex = "^item:\d+$" reply = "…"</code></td><td><code>bot.callbackQuery(/^item:\d+$/, ...)</code></td></tr>
	</tbody>
</table>

<div class="note">
	if both <code>handler</code> and <code>reply</code> are present, the handler wins. the reply is
	only used when no handler is configured. callback routes that use <code>reply</code> answer the
	callback query first (<code>answerCallbackQuery</code>), so the button never hangs on a spinner
	— handler-based callback routes answer it themselves.
	<br /><br />
	example errors: <code>Missing handler "ping" referenced in commands[1]</code>,
	<code>commands[0] must define either reply or handler</code>,
	<code>hears[0] must define either text or regex</code>,
	<code>messages[0].on unknown update type "mesage"</code>.
</div>

<h2>validation</h2>
<p>
	the config is validated with zod before anything touches the bot: every route needs a response,
	<code>regex</code> patterns must compile, and the update-type prefix of
	<code>messages[].on</code> is checked against the real bot api update names (generated from the
	telegram schema), so a typo like <code>"mesage:text"</code> fails at install instead of
	registering a route that never matches.
</p>

<h2>plugin usage</h2>
<p>
	<code>createTomlPlugin</code> returns a normal yaebal plugin, so it can be installed through
	<code>bot.install()</code> or composed with other feature modules.
</p>
<Code code={pluginUsage} title="plugin.ts" />

<h2>api</h2>
<table>
	<thead>
		<tr><th>export</th><th>signature</th><th>description</th></tr>
	</thead>
	<tbody>
		<tr>
			<td><code>installToml</code></td>
			<td><code>(bot, configPathOrObject, options?) =&gt; bot</code></td>
			<td>parse, validate and register routes on an existing bot or composer</td>
		</tr>
		<tr>
			<td><code>createTomlPlugin</code></td>
			<td><code>(configPathOrObject, options?) =&gt; Plugin</code></td>
			<td>create a yaebal-compatible plugin that installs the toml routes</td>
		</tr>
		<tr>
			<td><code>parseTomlConfig</code></td>
			<td><code>(input) =&gt; TomlBotConfig</code></td>
			<td>parse from file path, raw toml string or parsed object, then validate</td>
		</tr>
		<tr>
			<td><code>validateTomlConfig</code></td>
			<td><code>(input) =&gt; TomlBotConfig</code></td>
			<td>runtime validation through zod with human-readable error paths</td>
		</tr>
	</tbody>
</table>
<p>
	<code>options.handlers</code> is the named handler registry; <code>options.syncCommands</code>
	enables the command-menu sync described above.
</p>

<h2>raw strings and objects</h2>
<p>
	file paths are the common case, but tests and generated configs can pass raw toml or an object.
	a path that does not exist fails with a clear read error; a path-looking string that cannot be
	parsed as toml gets a "is this a missing file?" hint.
</p>
<Code code={rawString} title="config.ts" />

<h2>limits</h2>
<p>
	toml is not a replacement for typescript. use it for routes and simple replies; use the handler
	registry for database calls, external services, branching flows, permissions and anything that
	needs compile-time types.
</p>

<div class="note">
	status: experimental. the format is intentionally small: commands, hears, message filters and
	callback queries. no hidden dependency graph, no dynamic import magic, no second routing engine.
</div>
