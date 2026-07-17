# @yaebal/morda

dialogs engine for telegram ui: declarative windows rendered into one message,
callback routing by stable button id, a persisted navigation stack — plus a
jsx/hooks layer on top (`@yaebal/morda/jsx`). no manual `editMessageText`, no
`callback_data` wrangling, no hand-rolled fsm.

the engine owns the unglamorous parts: per-key locking against concurrent taps,
stale-press detection by dialog instance, `message is not modified` swallowing,
delete/edit fallbacks for messages telegram refuses to touch, per-user dialogs
in group chats, business-chat routing, and a spinner that always clears.

## install

```sh
pnpm add @yaebal/morda
```

## builder api

```ts
import { back, button, dialogs, switchTo, url } from "@yaebal/morda";

const bot = createBot(token)
	.install(
		dialogs({
			main: () => ({
				text: "cockpit",
				keyboard: [
					[switchTo("settings →", "settings")],
					[url("docs", "https://example.com")],
				],
			}),
			settings: (ctx, frame) => ({
				text: `dark mode: ${frame.data.dark ? "on" : "off"}`,
				keyboard: [
					[button("toggle", { id: "t", onClick: (c) => c.dialog.update({ dark: !frame.data.dark }) })],
					[back()],
				],
			}),
		}),
	)
	.command("start", (ctx) => ctx.dialog.start("main"));
```

window ids are typed — `start`/`push`/`replace` only accept names that exist in
the def, so a typo is a compile error. windows can be a bare render function or
a full def with lifecycle:

```ts
ask: {
	render: () => ({ text: "your name?" }),
	onText: (ctx) => ctx.dialog.update({ name: ctx.text }), // free text input
	onResult: (ctx, result) => {},                           // child's back(result)
	onEnter / onLeave / onCommit,                            // lifecycle
},
```

`ctx.dialog`: `start(w, { params, data })` · `push(w, params)` · `replace` ·
`back(result)` · `close()` · `rerender()` · `invalidate()` · `update(patch)` ·
`setData(patch)` · `getData()` · `active()`.

text accepts `format` results (entities flow to the wire), windows can carry
`media` (photo/video/animation/document/audio — transitions handled via
delete + resend), and buttons come in callback / url / webApp / copy /
switchInline flavors.

## typed ambient context

window callbacks see the bare `Context` by default. declare the context your bot actually
accumulates with `defineDialog` (curried, so window ids stay literal) — `render` /
`onText` / lifecycle hooks then see plugin fields with no casts, and installing the
dialog on a bot that lacks them is a compile error, not a runtime surprise:

```ts
import { defineDialog, dialogs } from "@yaebal/morda";

type BotContext = Context & { session: { name: string } };

const def = defineDialog<BotContext>()({
	profile: {
		render: (ctx) => ({ text: `hi ${ctx.session.name}` }),
		onText: (ctx) => {
			ctx.session.name = ctx.text; // typed — session comes from BotContext
			return ctx.dialog.rerender();
		},
	},
});

bot.install(session({ initial: () => ({ name: "anon" }) })).install(dialogs(def));
```

on a `createBot()` bot the runtime context inside windows is the rich per-update class —
include it in the declared context (e.g. `MessageContext & { session: … }`) and generated
shortcuts like `ctx.delete()` type-check inside `onText` too. `button<C>()` accepts the
same context for a helper-built button's `onClick`.

## jsx + hooks

```tsx
import { Button, ButtonRow, jsxDialogs, Screen, useEffect, useState } from "@yaebal/morda/jsx";

function Counter() {
	const [n, setN] = useState(0);
	useEffect(() => console.log("mounted"), []);
	return (
		<Screen>
			{`count: ${n}`}
			<ButtonRow>
				<Button id="inc" onClick={() => setN((v) => v + 1)}>+</Button>
			</ButtonRow>
		</Screen>
	);
}

bot.install(jsxDialogs({ counter: Counter }));
```

hook state lives in the dialog's persisted frames: with a persistent storage it
survives restarts and horizontal scaling, and values must be JSON-serializable.
`setState` batches — any number of calls in one handler produce one edit, and
effects run *after* the render is delivered, so `setState` inside `useEffect`
(the load-then-show pattern) just works.

hooks: `useState` · `useEffect(fn, deps?)` · `useNavigation` (navigate by
component: `nav.push(Settings, params)`) · `useParams` · `useDialogData` ·
`useUser` · `useChat` · `useSession` · `useTranslation` · `useContext`.

widgets (ready-made stateful components): `Counter`, `Toggle`, `Select`,
`Pagination` — plus `Url`, `WebApp`, `Copy`, `SwitchInline` buttons and a
`<Screen onText media linkPreview>` surface.

```json
// tsconfig.json — for the jsx layer
{ "jsx": "react-jsx", "jsxImportSource": "@yaebal/morda" }
```

## options

```ts
dialogs(def, {
	storage,                       // StorageAdapter — default in-memory (dev only)
	prefix: "dlg",                 // callback namespace; unique per install
	getKey: (ctx) => string,       // default: chat id, `chat:user` in groups
	access: (ctx) => boolean,      // gate who may press the buttons
	maxStack: 32,                  // navigation depth cap
	events: { onStale, onAccessDenied, onClose },
});
```

### persistent storage

`storage` takes any [`@yaebal/sklad`](https://npmx.dev/package/@yaebal/sklad) `StorageAdapter` —
the default `MemoryStorage` loses every open dialog on restart/redeploy. swap in `redisStorage()`
(or the sqlite/cloudflare-kv/file adapters) to survive both and to share dialog state across
horizontally-scaled instances:

```ts
import { dialogs } from "@yaebal/morda";
import { redisStorage } from "@yaebal/sklad";
import type { DialogState } from "@yaebal/morda";
import Redis from "ioredis"; // or `createClient` from "redis" — both fit structurally

const storage = redisStorage<DialogState>(new Redis(), {
	prefix: "bot:dialog:",
	ttl: 24 * 60 * 60_000, // EXPIRE, refreshed on every write and touch
});

bot.install(dialogs(def, { storage }));
```

## background updates

edit an open dialog from a timer, queue worker, or webhook — no incoming update:

```ts
const { plugin, background } = createDialogs(def, { storage });
bot.install(plugin);

const control = await background(bot.api, String(chatId));
await control?.update({ price: 42 }); // merges data + re-renders in place
```

(`createJsxDialogs` is the jsx twin.)

---

part of [**yaebal**](https://github.com/neverlane/yaebal) — a type-safe, runtime-agnostic Telegram Bot API framework. MIT.
