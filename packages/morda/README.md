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
