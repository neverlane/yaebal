# @yaebal/scenes

durable, step-by-step wizards. every step is self-contained — it asks its own question on a
`firstTime` pass, then processes each answer — so wizards navigate (`next`/`previous`/`go`),
nest (`enterSub`/`exitSub`), validate (`ask` with any standard-schema library or a plain
function), and resume mid-flow after a restart from any persistent storage adapter.

## install

```sh
pnpm add @yaebal/scenes
```

## usage

```ts
import { ask, defineScene, scenes } from "@yaebal/scenes";
import { createBot, type Context } from "yaebal";

const register = defineScene<Context, { name: string; age: number }>({
	steps: [
		ask("name", { question: "what's your name?" }),
		ask("age", {
			question: (ctx) => `nice, ${ctx.scene.state.name}! how old are you?`,
			parse: (text) => (/^\d+$/.test(text) ? Number(text) : undefined),
			invalid: "age is a number — try again",
		}),
	],
	onLeave: (ctx, info) =>
		info.reason === "finish" &&
		ctx.send(`saved ${ctx.scene.state.name}, ${ctx.scene.state.age} ✨`),
});

const bot = createBot(token).install(scenes({ register }));

bot.command("register", (ctx) => ctx.scene.enter("register")); // scene names are typed
bot.command("cancel", (ctx) => ctx.scene.leave({ cancelled: true })); // works mid-wizard
```

## behavior

- **the step model** — a step runs a question pass (`ctx.scene.firstTime === true`), then a
  processing pass per update it claims. not navigating keeps the user on the step (that's the
  validation loop); running past the last step finishes the scene.
- **polite routing** — updates the current step doesn't claim fall through to normal handlers
  (`passthrough`), and `/commands` bypass the scene (`passCommands`), so a global `/cancel`
  keeps working. steps claim fresh messages only unless they declare `on` filter queries
  (e.g. `"callback_query:data"` for inline-keyboard wizards).
- **durable snapshots** — scene, step, typed state bag, params and the sub-scene stack persist
  as one json snapshot per `chat:user` key in any `StorageAdapter` (see `@yaebal/sklad`);
  restarts resume users mid-wizard. `ttl` expires abandoned wizards; snapshots pointing at
  steps a deploy removed self-heal instead of shadowing the user.
- **hooks** — `onEnter`, `onLeave(ctx, { reason, cancelled })` with reasons
  `finish | leave | switch | reenter | expired`, plus `beforeStep`/`afterStep`.

---

part of [**yaebal**](https://github.com/neverlane/yaebal) — a type-safe, runtime-agnostic Telegram Bot API framework. MIT.
