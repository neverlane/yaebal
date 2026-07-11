<script lang="ts">
	import Code from "$lib/Code.svelte";

	const install = `pnpm add @yaebal/morda`;

	const basicDialogs = `import { Bot } from "@yaebal/core";
import { dialogs, switchTo, back, button, url } from "@yaebal/morda";

const bot = new Bot(process.env.BOT_TOKEN!)
  .install(dialogs({
    main: () => ({
      text: "main menu",
      keyboard: [
        [switchTo("settings →", "settings")],
        [button("ping", { id: "ping", onClick: (ctx) => ctx.answerCallbackQuery({ text: "pong" }) })],
        [url("docs", "https://example.com")],
      ],
    }),
    settings: () => ({
      text: "settings",
      keyboard: [[back("← back")]],
    }),
  }));

// window ids are typed: start("mian") is a compile error
bot.command("menu", (ctx) => ctx.dialog.start("main"));
bot.start();`;

	const dialogControl = `// ctx.dialog is available on every update after .install(dialogs(...))

// open a fresh dialog (closes any previous one, sends a new message)
await ctx.dialog.start("main", { params: { orderId: 42 }, data: { step: 1 } });

// push a window onto the stack (edits the message); params land in frame.params
await ctx.dialog.push("confirm", { orderId: 42 });

// replace the top window without growing the stack
await ctx.dialog.replace("done");

// pop one window; the result (if any) reaches the parent window's onResult.
// at the root this closes the dialog (message deleted, state dropped)
await ctx.dialog.back("2026-07-08");

// close the whole dialog from anywhere
await ctx.dialog.close();

// re-render right now / schedule one re-render after the handler
await ctx.dialog.rerender();
ctx.dialog.invalidate();

// the dialog-wide data bag (persisted; every window's render sees frame.data)
await ctx.dialog.update({ dark: true });   // merge + re-render
await ctx.dialog.setData({ dark: true });  // merge only
const data = await ctx.dialog.getData();   // read (undefined when closed)`;

	const windowDefs = `import { dialogs } from "@yaebal/morda";
import { format, bold } from "@yaebal/core";

bot.install(dialogs({
  // a window is a render function…
  main: (ctx, frame) => ({
    text: format\`hello \${bold(ctx.from?.first_name ?? "there")}\`, // entities flow to the wire
    keyboard: [[switchTo("ask →", "ask")]],
  }),

  // …or a full def with lifecycle + free-text input
  ask: {
    render: (ctx, frame) => ({
      text: frame.data.name ? \`hi, \${frame.data.name}!\` : "what's your name?",
    }),
    onText: (ctx) => ctx.dialog.update({ name: ctx.text }), // commands are never routed here
    onEnter: (ctx, frame) => {},          // pushed / replaced in
    onLeave: (ctx, frame) => {},          // popped / replaced out / dialog closed
    onResult: (ctx, result, frame) => {}, // a child window's back(result)
  },

  // media windows: text becomes the caption; media↔text transitions are
  // handled for you (delete + resend where telegram refuses to edit)
  photo: () => ({
    text: "caption",
    media: { type: "photo", media: "<file_id or url or media.file(...)>" },
  }),
}));`;

	const options = `import { dialogs, type DialogState } from "@yaebal/morda";
import { redisStorage } from "@yaebal/sklad";
import Redis from "ioredis"; // or \`createClient\` from "redis" — both fit structurally

// any @yaebal/sklad StorageAdapter works — redis/sqlite/cloudflare-kv/file survive
// restarts and share dialog state across horizontally-scaled instances
const storage = redisStorage<DialogState>(new Redis(), { prefix: "bot:dialog:" });

bot.install(dialogs(def, {
  storage,                        // default: in-memory (dev only)
  prefix: "shop",                 // callback namespace — unique per install
  getKey: (ctx) => \`\${ctx.chat?.id}\`, // default: chat id, chat:user in groups
  access: (ctx) => ctx.from?.id === ADMIN_ID, // gate who may press buttons
  maxStack: 32,                   // navigation depth cap
  events: {
    onStale: (ctx) => ctx.answerCallbackQuery({ text: "this menu expired" }),
    onAccessDenied: (ctx) => ctx.answerCallbackQuery({ text: "not for you" }),
    onClose: (ctx, result) => {}, // dialog fully closed
  },
}));`;

	const backgroundUpdates = `import { createDialogs } from "@yaebal/morda";

const { plugin, background } = createDialogs(def, { storage });
bot.install(plugin);

// later — from a timer, queue worker, or webhook, with no incoming update:
const control = await background(bot.api, String(chatId)); // key = getKey's value
if (control) {
  await control.update({ price: 42 }); // merge data + edit the message in place
  await control.push("alert");         // or navigate
}`;

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
  Screen, ButtonRow, Button, Url,
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
      <ButtonRow>
        <Url url="https://example.com">docs</Url>
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
  Screen, ButtonRow, Button,
  useState, useEffect, useNavigation, useParams, useDialogData, useUser,
} from "@yaebal/morda/jsx";

function ProfileScreen() {
  const user = useUser();
  const { userId } = useParams<{ userId: number }>();   // from nav.push(Profile, { userId })
  const [data, patch] = useDialogData<{ theme?: string }>(); // dialog-wide bag
  const [profile, setProfile] = useState<Profile | null>(null);

  // effects run AFTER the render is delivered, so the load-then-show
  // pattern works: the screen shows "loading…", then edits itself.
  useEffect(() => {
    loadProfile(userId).then(setProfile);
  }, [userId]);

  return (
    <Screen onText={(ctx) => patch({ theme: ctx.text })}>
      {profile ? \`\${profile.name} (\${data.theme ?? "light"})\` : "loading…"}
      <ButtonRow>
        <Button id="hi">{\`hello \${user?.first_name ?? "?"}\`}</Button>
      </ButtonRow>
    </Screen>
  );
}`;

	const jsxWidgets = `/** @jsxImportSource @yaebal/morda */
import { Screen, Counter, Toggle, Select, Pagination, useState } from "@yaebal/morda/jsx";

function SettingsScreen() {
  const [page, setPage] = useState(1);
  return (
    <Screen>
      settings
      <Counter id="volume" min={0} max={10} />
      <Toggle id="dark">dark mode</Toggle>
      <Select
        id="lang"
        items={[{ code: "en", name: "english" }, { code: "ru", name: "русский" }]}
        itemId={(l) => l.code}
        label={(l) => l.name}
        columns={2}
      />
      <Pagination id="p" page={page} pages={5} onPage={setPage} />
    </Screen>
  );
}`;

	const testing = `import { Composer, Context } from "@yaebal/core";
import { MemoryStorage } from "@yaebal/session";
import { dialogs, type DialogState } from "@yaebal/morda";

// morda talks to telegram only through api.call — a structural fake records
// every call, and callback_data can be read straight off the recorded keyboard
const storage = new MemoryStorage<DialogState>();
const mw = new Composer<Context>()
  .install(dialogs(def, { storage }))
  .command("go", (ctx) => ctx.dialog.start("main"))
  .toMiddleware();

await mw(msgCtx(api, "/go", chatId), noop);
const sent = calls.find((c) => c.method === "sendMessage");
const data = sent.params.reply_markup.inline_keyboard[0][0].callback_data;
await mw(cbCtx(api, data, chatId, 100), noop); // press the button`;
</script>

<svelte:head>
	<title>@yaebal/morda — yaebal</title>
</svelte:head>

<h1>@yaebal/morda</h1>
<p class="lead">
	dialogs engine + jsx/hooks layer. declarative windows rendered into one message, automatic
	callback routing, a persisted navigation stack — and an optional "react-for-telegram" surface
	where screens are components and state is managed with hooks. the engine owns the unglamorous
	parts: per-key locking, stale-press detection, edit/delete fallbacks, per-user dialogs in
	groups, business-chat routing.
</p>

<h2>install</h2>
<Code code={install} title="terminal" lang="sh" />

<h2>the dialogs API</h2>
<p>
	the core export is <code>dialogs(def, options?)</code>. a <em>dialog</em> is a flat map of named
	windows; each window is a render function (or a full <code>WindowDef</code>) returning
	<code>&#123; text, keyboard?, media?, linkPreview? &#125;</code>. morda encodes button ids into
	<code>callback_data</code> automatically and routes presses back to the right
	<code>onClick</code> — no manual <code>editMessageText</code> or callback-data wrangling.
	window ids are part of the type: <code>ctx.dialog.start("mian")</code> is a compile error.
</p>
<Code code={basicDialogs} title="menu.ts" />

<h2>ctx.dialog</h2>
<p>installing the plugin adds <code>ctx.dialog</code> on every update:</p>
<Code code={dialogControl} title="navigation.ts" />

<table>
	<thead>
		<tr><th>method</th><th>description</th></tr>
	</thead>
	<tbody>
		<tr><td><code>start(w, &#123; params?, data? &#125;)</code></td><td>close any open dialog, send a new message, start a fresh stack</td></tr>
		<tr><td><code>push(w, params?)</code></td><td>push a window; edits the dialog message</td></tr>
		<tr><td><code>replace(w, params?)</code></td><td>replace the top window without growing the stack</td></tr>
		<tr><td><code>back(result?)</code></td><td>pop the stack; <code>result</code> reaches the parent's <code>onResult</code>. closes the dialog at the root</td></tr>
		<tr><td><code>close()</code></td><td>delete the message and drop the state from anywhere</td></tr>
		<tr><td><code>rerender()</code></td><td>re-render the current window in place, immediately</td></tr>
		<tr><td><code>invalidate()</code></td><td>schedule one re-render after the current handler (batched)</td></tr>
		<tr><td><code>update(patch)</code></td><td>merge into the dialog <code>data</code> bag + re-render</td></tr>
		<tr><td><code>setData(patch)</code></td><td>merge into <code>data</code>, persist, no render</td></tr>
		<tr><td><code>getData()</code></td><td>read the <code>data</code> bag (<code>undefined</code> when closed)</td></tr>
		<tr><td><code>active()</code></td><td>whether a dialog is open for this key</td></tr>
	</tbody>
</table>

<h2>windows: lifecycle, input, media, formatting</h2>
<p>
	a window render receives <code>(ctx, frame)</code> — <code>frame.params</code> are the values
	passed to <code>push</code>/<code>start</code>, <code>frame.data</code> is the dialog-wide
	persisted bag. <code>text</code> accepts a plain string or a core
	<code>format</code> result (entities are threaded into <code>sendMessage</code> /
	<code>editMessageText</code> automatically).
</p>
<Code code={windowDefs} title="windows.ts" />

<h2>button helpers</h2>
<table>
	<thead>
		<tr><th>helper</th><th>description</th></tr>
	</thead>
	<tbody>
		<tr><td><code>button(label, &#123; id, onClick? &#125;)</code></td><td>arbitrary action button</td></tr>
		<tr><td><code>switchTo(label, windowId, params?)</code></td><td>pushes another window on click</td></tr>
		<tr><td><code>back(label?, result?)</code></td><td>pops the stack, optionally handing a result up</td></tr>
		<tr><td><code>cancel(label?)</code></td><td>closes the whole dialog</td></tr>
		<tr><td><code>url(label, url)</code></td><td>opens a url</td></tr>
		<tr><td><code>webApp(label, url)</code></td><td>opens a web app</td></tr>
		<tr><td><code>copy(label, text)</code></td><td>copies text to the clipboard</td></tr>
		<tr><td><code>switchInline(label, query?, &#123; currentChat? &#125;)</code></td><td>starts an inline query</td></tr>
	</tbody>
</table>
<p>
	every helper takes optional <code>icon</code> / <code>style</code> — a custom-emoji id and one of
	<code>"danger" | "success" | "primary"</code> — forwarded to the inline keyboard. pass them in the
	options object for <code>button</code> / <code>switchInline</code>, or as a trailing
	<code>{'{ icon, style }'}</code> argument on the others, e.g.
	<code>button("delete", &#123; id: "del", style: "danger" &#125;)</code> or
	<code>url("site", "https://…", &#123; icon: "5368324170671202286" &#125;)</code>.
</p>

<h2>dialogs() options</h2>
<Code code={options} title="options.ts" />
<table>
	<thead>
		<tr><th>option</th><th>default</th><th>description</th></tr>
	</thead>
	<tbody>
		<tr>
			<td><code>storage</code></td>
			<td><code>MemoryStorage</code></td>
			<td>where dialog state persists — stack, params, data, jsx hook state. any
			<a href="/docs/plugins/sklad"><code>@yaebal/sklad</code></a> <code>StorageAdapter</code>
			works — swap in <code>redisStorage()</code> (or sqlite/cloudflare-kv/file) in production
			and dialogs survive restarts</td>
		</tr>
		<tr>
			<td><code>prefix</code></td>
			<td><code>"dlg"</code></td>
			<td>callback_data namespace. <strong>set a unique prefix per install</strong> when
			installing several dialogs on one bot</td>
		</tr>
		<tr>
			<td><code>getKey</code></td>
			<td>chat id / <code>chat:user</code></td>
			<td>state key per update. the default gives every group member an independent dialog</td>
		</tr>
		<tr>
			<td><code>access</code></td>
			<td>—</td>
			<td>predicate gating presses and text input on an open dialog</td>
		</tr>
		<tr>
			<td><code>maxStack</code></td>
			<td><code>32</code></td>
			<td>navigation depth cap; <code>push</code> beyond it throws</td>
		</tr>
		<tr>
			<td><code>events</code></td>
			<td>silent</td>
			<td><code>onStale</code> / <code>onAccessDenied</code> / <code>onClose(ctx, result)</code></td>
		</tr>
	</tbody>
</table>

<h2>background updates</h2>
<p>
	<code>createDialogs</code> returns the plugin plus a <code>background</code> handle — edit a
	user's open dialog from outside a handler. renders get a synthetic context
	(<code>ctx.chat</code> carries the stored chat id, <code>ctx.from</code> is undefined).
</p>
<Code code={backgroundUpdates} title="background.ts" />

<h2>jsx / hooks layer</h2>
<p>
	<code>@yaebal/morda/jsx</code> is an optional higher-level surface. screens become zero-arg
	components that return <code>&lt;Screen&gt;</code> trees, and react-style hooks manage state.
	hook state is persisted in the dialog frames — with a persistent storage it survives restarts
	and horizontal scaling. values must be JSON-serializable.
</p>
<Code code={jsxSetup} title="tsconfig.json" lang="text" />
<Code code={jsxBasic} title="bot.tsx" />

<h2>hooks</h2>
<Code code={jsxHooks} title="hooks.tsx" />

<table>
	<thead>
		<tr><th>hook</th><th>description</th></tr>
	</thead>
	<tbody>
		<tr>
			<td><code>useState&lt;T&gt;(initial)</code></td>
			<td>persisted per-screen state slot. the setter batches: any number of calls in one
			handler produce one edit</td>
		</tr>
		<tr>
			<td><code>useEffect(fn, deps?)</code></td>
			<td>runs after the render is delivered; <code>deps</code> are persisted, so
			<code>[]</code> means once per screen instance (not once per process). no cleanup</td>
		</tr>
		<tr>
			<td><code>useNavigation()</code></td>
			<td><code>&#123; push, replace, back, close &#125;</code> — navigate by component:
			<code>nav.push(Settings, params)</code></td>
		</tr>
		<tr><td><code>useParams&lt;P&gt;()</code></td><td>params passed to <code>push</code>/<code>replace</code>/<code>start</code></td></tr>
		<tr><td><code>useDialogData&lt;T&gt;()</code></td><td><code>[data, patch]</code> — the dialog-wide persisted bag</td></tr>
		<tr><td><code>useUser()</code> / <code>useChat()</code></td><td><code>ctx.from</code> / <code>ctx.chat</code></td></tr>
		<tr><td><code>useContext&lt;C&gt;()</code></td><td>the full context — the escape hatch</td></tr>
		<tr><td><code>useSession&lt;S&gt;()</code></td><td><code>ctx.session</code>; throws a clear error if <code>@yaebal/session</code> is missing</td></tr>
		<tr><td><code>useTranslation()</code></td><td><code>&#123; t, changeLanguage &#125;</code>; requires <code>@yaebal/i18n</code></td></tr>
	</tbody>
</table>

<h2>jsx components &amp; widgets</h2>
<Code code={jsxWidgets} title="widgets.tsx" />
<table>
	<thead>
		<tr><th>component</th><th>description</th></tr>
	</thead>
	<tbody>
		<tr><td><code>&lt;Screen onText? media? linkPreview?&gt;</code></td><td>root of every screen. <code>onText</code> consumes free text (return <code>false</code> to decline)</td></tr>
		<tr><td><code>&lt;ButtonRow&gt;</code></td><td>groups buttons into one keyboard row</td></tr>
		<tr><td><code>&lt;Button id onClick?&gt;</code></td><td>callback button; children become the label</td></tr>
		<tr><td><code>&lt;Url&gt;</code> / <code>&lt;WebApp&gt;</code> / <code>&lt;Copy&gt;</code> / <code>&lt;SwitchInline&gt;</code></td><td>the other telegram button kinds</td></tr>
		<tr><td><code>&lt;Counter id min? max? step? value? onChange?&gt;</code></td><td><code>− n +</code> stepper (uncontrolled or controlled)</td></tr>
		<tr><td><code>&lt;Toggle id value? onChange?&gt;</code></td><td>on/off switch with a ☑/☐ mark</td></tr>
		<tr><td><code>&lt;Select id items itemId label selected? onSelect? columns?&gt;</code></td><td>single-choice list, chosen item marked ✓</td></tr>
		<tr><td><code>&lt;Pagination id page pages onPage&gt;</code></td><td><code>« ‹ n/m › »</code> pager (controlled)</td></tr>
	</tbody>
</table>

<h2>reliability &amp; production notes</h2>
<div class="note">
	<strong>concurrent taps are serialized.</strong> a per-key lock wraps every state
	read-modify-write, so a double-tap in webhook mode can't corrupt the stack — the second press
	sees the new window and is discarded as stale (single-process; multi-process deployments need
	sticky routing per chat).
	<br /><br />
	<strong>stale presses are detected by dialog instance.</strong> every <code>start()</code> mints
	a new intent id; presses from previous instances, from windows no longer on top, or on buttons
	that vanished from a fresh render are answered silently (customize via
	<code>events.onStale</code>).
	<br /><br />
	<strong>telegram refusals are handled.</strong> <code>message is not modified</code> is
	swallowed (identical renders are skipped before the API call); a message the user deleted is
	replaced by a fresh send; <code>deleteMessage</code> past the 48-hour window falls back to
	disarming the keyboard — a dialog can always close.
	<br /><br />
	<strong>the spinner always clears.</strong> <code>answerCallbackQuery</code> runs even when an
	<code>onClick</code> throws; answering again inside <code>onClick</code> (e.g. with a text) is
	safe.
	<br /><br />
	<strong>several installs need distinct prefixes.</strong> two <code>dialogs()</code> installs
	sharing the default <code>"dlg"</code> prefix can misattribute each other's presses when both
	have an open dialog in one chat — pass <code>prefix</code> to each install.
	<br /><br />
	<strong>hooks must be unconditional.</strong> rendering fewer hooks than the persisted slots
	throws (same rule as react). appending new hooks in a deploy over live dialogs is allowed.
</div>

<h2>testing</h2>
<p>
	morda reaches telegram only through <code>api.call</code>, so a structural fake api records
	everything; read <code>callback_data</code> from the recorded keyboard and feed it back as a
	callback update. <code>packages/morda/src/index.test.ts</code> is a complete worked example.
</p>
<Code code={testing} title="morda.test.ts" />

<h2>related</h2>
<p>
	<a href="/docs/plugins/scenes">@yaebal/scenes</a> for message-per-step wizards,
	<a href="/docs/plugins/prompt">@yaebal/prompt</a> for one-off questions,
	<a href="/docs/plugins/sklad">@yaebal/sklad</a> for the storage adapters morda's <code>storage</code>
	option takes, and the <a href="/docs/examples">dialog-quest example</a> for a running bot.
</p>
