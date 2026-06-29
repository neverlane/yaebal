<script lang="ts">
	import Code from "$lib/Code.svelte";

	const install = `pnpm add @yaebal/morda`;

	const basicDialogs = `import { Bot } from "@yaebal/core";
import { dialogs, switchTo, back, button } from "@yaebal/morda";

const bot = new Bot(process.env.BOT_TOKEN!)
  .install(dialogs({
    main: () => ({
      text: "main menu",
      keyboard: [
        [switchTo("settings →", "settings")],
        [button("ping", { id: "ping", onClick: (ctx) => ctx.answerCallbackQuery({ text: "pong" }) })],
      ],
    }),
    settings: () => ({
      text: "settings",
      keyboard: [[back("← back")]],
    }),
  }));

bot.command("menu", (ctx) => ctx.dialog.start("main"));
bot.start();`;

	const dialogControl = `// ctx.dialog is available on every update after .install(dialogs(...))

// open a fresh dialog (sends a new message + initialises the stack)
await ctx.dialog.start("main");

// push a window onto the stack (edits the message)
await ctx.dialog.push("settings");

// replace the top window without growing the stack
await ctx.dialog.replace("confirm");

// pop one window; if the stack becomes empty the message is deleted
await ctx.dialog.back();

// re-render the current window in place after mutating external state
await ctx.dialog.rerender();`;

	const buttonHelpers = `import { switchTo, back, button } from "@yaebal/morda";

// navigate to another window on click
switchTo("settings →", "settings");

// pop the stack (default label "← назад")
back();
back("← go back");

// arbitrary action button
button("refresh", {
  id: "refresh",
  onClick: async (ctx) => {
    await ctx.answerCallbackQuery({ text: "refreshed" });
    await ctx.dialog.rerender();
  },
});`;

	const customStorage = `import { dialogs } from "@yaebal/morda";
import { type StorageAdapter } from "@yaebal/session";
import type { DialogState } from "@yaebal/morda";

class RedisDialogStorage implements StorageAdapter<DialogState> {
  async get(key: string) { /* ... */ }
  async set(key: string, value: DialogState) { /* ... */ }
  async delete(key: string) { /* ... */ }
}

bot.install(dialogs(def, { storage: new RedisDialogStorage() }));`;

	const jsxSetup = `// tsconfig.json — point the compiler at morda's jsx transform
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "@yaebal/morda"
  }
}`;

	const jsxBasic = `/** @jsxImportSource @yaebal/morda */
import { Bot } from "@yaebal/core";
import {
  jsxDialogs,
  Screen, ButtonRow, Button,
  useState, useNavigation,
} from "@yaebal/morda/jsx";

function SettingsScreen() {
  const nav = useNavigation();
  return (
    <Screen>
      Settings page
      <ButtonRow>
        <Button id="back" onClick={() => nav.back()}>← back</Button>
      </ButtonRow>
    </Screen>
  );
}

function MainScreen() {
  const [count, setCount] = useState(0);
  const nav = useNavigation();

  return (
    <Screen>
      {\`you tapped \${count} time(s)\`}
      <ButtonRow>
        <Button id="tap" onClick={() => setCount((n) => n + 1)}>tap</Button>
        <Button id="settings" onClick={() => nav.push(SettingsScreen)}>settings</Button>
      </ButtonRow>
    </Screen>
  );
}

const bot = new Bot(process.env.BOT_TOKEN!)
  .install(jsxDialogs({ main: MainScreen, settings: SettingsScreen }));

bot.command("menu", (ctx) => ctx.dialog.start("main"));
bot.start();`;

	const jsxHooks = `/** @jsxImportSource @yaebal/morda */
import {
  Screen, Button,
  useState, useEffect, useNavigation, useUser, useSession,
} from "@yaebal/morda/jsx";

function ProfileScreen() {
  const user = useUser();
  const session = useSession<{ visits: number }>();
  const [loaded, setLoaded] = useState(false);
  const nav = useNavigation();

  useEffect(() => {
    console.log("screen mounted");
  }, []); // empty deps → runs once per mount

  return (
    <Screen>
      {\`hello \${user?.first_name}! visits: \${session.visits}\`}
      <Button id="back" onClick={() => nav.back()}>← back</Button>
    </Screen>
  );
}`;
</script>

<svelte:head>
	<title>@yaebal/morda — yaebal</title>
</svelte:head>

<h1>@yaebal/morda</h1>
<p class="lead">
	dialogs engine + jsx/hooks layer. declarative windows, automatic callback routing, per-chat
	navigation stack — and an optional "react-for-telegram" surface where screens are components and
	state is managed with hooks.
</p>

<h2>install</h2>
<Code code={install} title="terminal" lang="sh" />

<h2>the dialogs API</h2>
<p>
	the core export is <code>dialogs(def, options?)</code>. a <em>dialog</em> is a flat map of named
	windows; each window is a function that returns <code>&#123; text, keyboard &#125;</code>. morda
	encodes button ids into <code>callback_data</code> automatically and routes presses back to the
	right <code>onClick</code> — no manual <code>editMessageText</code> or callback-data wrangling
	needed.
</p>
<Code code={basicDialogs} title="menu.ts" />

<h2>ctx.dialog</h2>
<p>
	installing the plugin adds <code>ctx.dialog</code> on every update. the five methods cover all
	navigation needs:
</p>
<Code code={dialogControl} title="navigation.ts" />

<table>
	<thead>
		<tr><th>method</th><th>description</th></tr>
	</thead>
	<tbody>
		<tr><td><code>start(windowId)</code></td><td>send a new message and start a fresh stack</td></tr>
		<tr><td><code>push(windowId)</code></td><td>push a window; edits the dialog message</td></tr>
		<tr><td><code>replace(windowId)</code></td><td>replace the top window without growing the stack</td></tr>
		<tr><td><code>back()</code></td><td>pop the stack; deletes the message when the stack empties</td></tr>
		<tr><td><code>rerender()</code></td><td>re-render the current window in place</td></tr>
	</tbody>
</table>

<h2>button helpers</h2>
<p>three named helpers build <code>Button</code> objects without constructing them by hand:</p>
<Code code={buttonHelpers} title="buttons.ts" />

<table>
	<thead>
		<tr><th>helper</th><th>signature</th><th>description</th></tr>
	</thead>
	<tbody>
		<tr>
			<td><code>switchTo</code></td>
			<td><code>(label, windowId) =&gt; Button</code></td>
			<td>button that calls <code>ctx.dialog.push(windowId)</code></td>
		</tr>
		<tr>
			<td><code>back</code></td>
			<td><code>(label?) =&gt; Button</code></td>
			<td>button that calls <code>ctx.dialog.back()</code>; default label <code>"← Назад"</code></td>
		</tr>
		<tr>
			<td><code>button</code></td>
			<td><code>(label, &#123; id, onClick? &#125;) =&gt; Button</code></td>
			<td>arbitrary action button</td>
		</tr>
	</tbody>
</table>

<h2>dialogs() options</h2>
<table>
	<thead>
		<tr><th>option</th><th>type</th><th>required</th><th>description</th></tr>
	</thead>
	<tbody>
		<tr>
			<td><code>storage</code></td>
			<td><code>StorageAdapter&lt;DialogState&gt;</code></td>
			<td>no</td>
			<td>where to persist the navigation stack. defaults to <code>MemoryStorage</code> (lost on restart)</td>
		</tr>
		<tr>
			<td><code>onLeave</code></td>
			<td><code>(chatId, windowId) =&gt; void</code></td>
			<td>no</td>
			<td>called when a window leaves the stack. the jsx layer uses this to evict hook state</td>
		</tr>
	</tbody>
</table>
<Code code={customStorage} title="custom-storage.ts" />

<h2>public types</h2>
<table>
	<thead>
		<tr><th>export</th><th>description</th></tr>
	</thead>
	<tbody>
		<tr><td><code>DialogContext</code></td><td><code>Context & &#123; dialog: DialogControl &#125;</code> — context inside a window render or button onClick</td></tr>
		<tr><td><code>DialogControl</code></td><td>the five navigation methods on <code>ctx.dialog</code></td></tr>
		<tr><td><code>DialogDef</code></td><td><code>Record&lt;string, WindowRender&gt;</code> — the map passed to <code>dialogs()</code></td></tr>
		<tr><td><code>WindowRender</code></td><td><code>(ctx: DialogContext) =&gt; WindowView | Promise&lt;WindowView&gt;</code></td></tr>
		<tr><td><code>WindowView</code></td><td><code>&#123; text: string; keyboard?: Button[][] &#125;</code></td></tr>
		<tr><td><code>Button</code></td><td><code>&#123; id: string; label: string; onClick?: (ctx) =&gt; unknown &#125;</code></td></tr>
		<tr><td><code>DialogState</code></td><td>persisted per-chat state: <code>&#123; stack: string[]; messageId: number; chatId: number &#125;</code></td></tr>
		<tr><td><code>DialogsOptions</code></td><td>options interface for <code>dialogs()</code></td></tr>
	</tbody>
</table>

<h2>jsx / hooks layer</h2>
<p>
	<code>@yaebal/morda/jsx</code> is an optional higher-level surface. screens become zero-arg
	components that return <code>&lt;Screen&gt;</code> trees, and React-style hooks manage local
	state. the compiler must be configured to use morda's jsx transform.
</p>
<Code code={jsxSetup} title="tsconfig.json" lang="text" />
<Code code={jsxBasic} title="bot.tsx" />

<h2>hooks</h2>
<Code code={jsxHooks} title="hooks.tsx" />

<table>
	<thead>
		<tr><th>hook</th><th>signature</th><th>description</th></tr>
	</thead>
	<tbody>
		<tr>
			<td><code>useState</code></td>
			<td><code>&lt;T&gt;(initial: T | (() =&gt; T)) =&gt; [T, setter]</code></td>
			<td>per-screen, per-chat state slot. calling the setter triggers <code>ctx.dialog.rerender()</code></td>
		</tr>
		<tr>
			<td><code>useEffect</code></td>
			<td><code>(fn, deps?) =&gt; void</code></td>
			<td>fire-and-forget side-effect after render; <code>deps</code> gate re-runs. no cleanup support</td>
		</tr>
		<tr>
			<td><code>useNavigation</code></td>
			<td><code>() =&gt; Navigation</code></td>
			<td>returns <code>&#123; push, replace, back &#125;</code>; accepts a <code>ScreenComponent</code> or a window id string</td>
		</tr>
		<tr>
			<td><code>useUser</code></td>
			<td><code>() =&gt; User | undefined</code></td>
			<td>the Telegram user from the current update's <code>ctx.from</code></td>
		</tr>
		<tr>
			<td><code>useSession</code></td>
			<td><code>&lt;S&gt;() =&gt; S</code></td>
			<td>raw access to <code>ctx.session</code>; requires <code>@yaebal/session</code> installed before the dialog</td>
		</tr>
		<tr>
			<td><code>useTranslation</code></td>
			<td><code>() =&gt; &#123; t, changeLanguage &#125;</code></td>
			<td>i18n helpers; requires <code>@yaebal/i18n</code> installed before the dialog</td>
		</tr>
	</tbody>
</table>

<h2>jsx components</h2>
<table>
	<thead>
		<tr><th>component</th><th>props</th><th>description</th></tr>
	</thead>
	<tbody>
		<tr>
			<td><code>&lt;Screen&gt;</code></td>
			<td><code>children</code></td>
			<td>root element of every screen component — required</td>
		</tr>
		<tr>
			<td><code>&lt;ButtonRow&gt;</code></td>
			<td><code>children</code></td>
			<td>groups <code>&lt;Button&gt;</code> elements into one keyboard row</td>
		</tr>
		<tr>
			<td><code>&lt;Button&gt;</code></td>
			<td><code>id, onClick?, children</code></td>
			<td>a single inline button; <code>children</code> becomes the label</td>
		</tr>
	</tbody>
</table>

<h2>jsx public exports</h2>
<table>
	<thead><tr><th>export</th><th>subpath</th><th>description</th></tr></thead>
	<tbody>
		<tr><td><code>jsxDialogs</code></td><td><code>@yaebal/morda/jsx</code></td><td>register JSX screens as a dialog plugin.</td></tr>
		<tr><td><code>Screen</code>, <code>ButtonRow</code>, <code>Button</code></td><td><code>@yaebal/morda/jsx</code></td><td>JSX components used to build a Telegram window.</td></tr>
		<tr><td><code>useState</code>, <code>useEffect</code>, <code>useNavigation</code>, <code>useUser</code>, <code>useSession</code>, <code>useTranslation</code></td><td><code>@yaebal/morda/jsx</code></td><td>hooks available during screen render.</td></tr>
		<tr><td><code>ScreenComponent</code>, <code>ButtonProps</code>, <code>Navigation</code>, <code>Translation</code>, <code>VNode</code></td><td><code>@yaebal/morda/jsx</code></td><td>public JSX layer types.</td></tr>
		<tr><td><code>jsx</code>, <code>jsxs</code>, <code>Fragment</code>, <code>JSX</code>, <code>VNODE</code></td><td><code>@yaebal/morda/jsx-runtime</code></td><td>automatic JSX runtime used by TypeScript when <code>jsxImportSource</code> is <code>"@yaebal/morda"</code>. You normally do not import this subpath manually.</td></tr>
	</tbody>
</table>

<h2>registration</h2>
<p>
	both the builder API and the jsx layer use <code>.install()</code> — the same method used by
	every other yaebal plugin.
</p>

<div class="note">
	<strong>stale-press guard.</strong> morda ignores button presses whose window id does not match
	the live stack top — a double-tap or a press on an old keyboard before the edit landed is
	silently discarded and the spinner is cleared.
	<br /><br />
	<strong>no auto re-render in the builder API.</strong> after mutating external state that a
	window reads, call <code>ctx.dialog.rerender()</code> yourself. the jsx layer automates this via
	<code>useState</code>.
	<br /><br />
	<strong>useState fires one edit per call.</strong> calling the setter multiple times in one
	handler issues one <code>editMessageText</code> per call — there is no batching. combine writes
	if you need to update several slots at once.
	<br /><br />
	<strong>hooks must be unconditional.</strong> changing the number of hook calls between renders
	(e.g. hooks inside <code>if</code> blocks) throws at runtime — same rule as React.
	<br /><br />
	<strong>hook state is in-memory.</strong> <code>useState</code> slots are stored in a module-level
	<code>Map</code> and are lost on process restart. they are evicted cleanly when a window leaves
	the stack, so reopened screens re-mount fresh.
</div>
