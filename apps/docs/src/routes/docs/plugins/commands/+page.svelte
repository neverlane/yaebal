<script lang="ts">
	import Code from "$lib/Code.svelte";

	const install = `pnpm add @yaebal/commands`;

	const usage = `import { Bot } from "@yaebal/core";
import { commands } from "@yaebal/commands";

const bot = new Bot(process.env.BOT_TOKEN!);

const cmd = commands()
  .add("start", "start the bot", async (ctx) => {
    await ctx.reply("welcome!");
  })
  .add("help", "show help", async (ctx) => {
    await ctx.reply("available commands: /start, /help");
  });

// wire handlers onto the bot
bot.install(cmd.plugin());

// push the /command menu to Telegram
await cmd.register(bot.api);

bot.start();`;

	const withLanguage = `// push a localised menu for Russian users
await cmd.register(bot.api, { languageCode: "ru" });`;

	const listUsage = `const cmd = commands()
  .add("start", "go", () => {})
  .add("help", "help", () => {});

cmd.list();
// [
//   { command: "start", description: "go" },
//   { command: "help", description: "help" },
// ]`;

	const pluginUsage = `import { Composer } from "@yaebal/core";

// install on a plain Composer as well as on Bot
const composer = new Composer().install(cmd.plugin());`;
</script>

<svelte:head>
	<title>@yaebal/commands — yaebal</title>
</svelte:head>

<h1>@yaebal/commands</h1>
<p class="lead">
	one registry for command handlers and the Telegram <code>/</code> command menu — define each
	command once, then wire the handlers and push the menu from the same source of truth.
</p>

<h2>install</h2>
<Code code={install} title="terminal" lang="sh" />

<h2>usage</h2>
<p>
	create a registry with <code>commands()</code>, chain <code>.add()</code> calls to define
	each command, then call <code>bot.install(cmd.plugin())</code> to register the handlers and
	<code>cmd.register(bot.api)</code> to push the menu to Telegram.
</p>
<Code code={usage} title="bot.ts" />

<h2>localised menus</h2>
<p>
	pass a <code>languageCode</code> to <code>register()</code> to push a language-specific
	menu. call it multiple times for different locales.
</p>
<Code code={withLanguage} title="bot.ts" />

<h2>api</h2>
<table>
	<thead>
		<tr><th>export</th><th>signature</th><th>description</th></tr>
	</thead>
	<tbody>
		<tr>
			<td><code>commands</code></td>
			<td><code>() =&gt; CommandsRegistry</code></td>
			<td>create a new commands registry</td>
		</tr>
		<tr>
			<td><code>CommandsRegistry</code></td>
			<td>interface</td>
			<td>the object returned by <code>commands()</code></td>
		</tr>
		<tr>
			<td><code>BotCommand</code></td>
			<td>interface</td>
			<td><code>\&#123; command: string; description: string \&#125;</code> — the shape used by <code>setMyCommands</code></td>
		</tr>
	</tbody>
</table>

<h3>CommandsRegistry</h3>
<table>
	<thead>
		<tr><th>method</th><th>signature</th><th>description</th></tr>
	</thead>
	<tbody>
		<tr>
			<td><code>add</code></td>
			<td><code>(name, description, ...handlers) =&gt; CommandsRegistry</code></td>
			<td>define a command — chainable</td>
		</tr>
		<tr>
			<td><code>list</code></td>
			<td><code>() =&gt; BotCommand[]</code></td>
			<td>return the <code>\&#123; command, description \&#125;[]</code> array for inspection or manual use</td>
		</tr>
		<tr>
			<td><code>plugin</code></td>
			<td><code>() =&gt; Plugin&lt;Context, Record&lt;never, never&gt;&gt;</code></td>
			<td>returns a plugin that registers every command's handler on the composer — pass to <code>bot.install()</code></td>
		</tr>
		<tr>
			<td><code>register</code></td>
			<td><code>(api, options?) =&gt; Promise&lt;unknown&gt;</code></td>
			<td>calls <code>setMyCommands</code> via the Telegram API with the command list</td>
		</tr>
	</tbody>
</table>

<h3>register options</h3>
<table>
	<thead>
		<tr><th>field</th><th>type</th><th>description</th></tr>
	</thead>
	<tbody>
		<tr>
			<td><code>languageCode</code></td>
			<td><code>string</code></td>
			<td>IETF language tag passed as <code>language_code</code> to <code>setMyCommands</code></td>
		</tr>
	</tbody>
</table>

<h2>list() and plugin() separately</h2>
<Code code={listUsage} title="list.ts" />
<Code code={pluginUsage} title="composer.ts" />

<div class="note">
	<strong>registration order is insertion order.</strong> commands appear in the Telegram menu
	in the order they were added with <code>.add()</code>.
	<br /><br />
	<strong><code>bot.install()</code>, not <code>bot.use()</code>.</strong> the plugin is
	installed via <code>bot.install(cmd.plugin())</code>. calling <code>bot.use(cmd.plugin())</code>
	will not work — <code>install</code> is the correct method for plugins in yaebal.
	<br /><br />
	<strong>handlers and menu are decoupled.</strong> <code>plugin()</code> only wires handlers;
	<code>register()</code> only pushes the menu. you can call them independently — for example,
	skip <code>register()</code> during local development to avoid overwriting the live menu.
</div>
