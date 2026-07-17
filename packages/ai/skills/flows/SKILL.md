---
name: yaebal-flows
description: Use when building multi-step dialogs in a yaebal bot — choosing between scenes, conversation, and prompt, and wiring their persistence.
---

# multi-step dialogs: scenes vs conversation vs prompt

three first-party options, by shape of the flow:

- **`@yaebal/prompt`** — one-off question: "ask, handle the next message". in-memory, lost on
  restart. reach for it first; escalate only when the flow grows.
- **`@yaebal/conversation`** — linear async flows written as a straight line of
  `await cv.waitFor(...)`. most natural to read; durable only if you opt in.
- **`@yaebal/scenes`** — declarative step machines. each step re-asks on its own, so wizards
  navigate (`next`/`previous`/`go`), nest, validate per step, and resume mid-flow after a
  restart. best for long registration/checkout wizards that must survive deploys.

## prompt — one question

```typescript
import { prompt } from "@yaebal/prompt";

bot.install(prompt());

bot.command("name", (ctx) =>
	ctx.prompt("what's your name?", (answer) => answer.send(`hi ${answer.text}!`)),
);
```

the answering message is consumed — check for `/`-escapes inside the handler if users may
type a command instead of an answer.

## conversation — linear flow

```typescript
import { conversation, createConversation } from "@yaebal/conversation";

const greet = createConversation(async (cv, ctx) => {
	await ctx.send("what's your name?");
	const answer = await cv.waitFor("message:text"); // narrowed: answer.text is string
	await answer.send(`hi ${answer.text}!`);
});

const bot = createBot(token).install(conversation({ greet }));
bot.command("greet", (ctx) => ctx.conversation.enter("greet"));
bot.command("cancel", (ctx) => ctx.conversation.active && ctx.conversation.leave());
```

`cv.form.text/int/choice/confirm` are ready-made ask-validate-reask loops; every wait accepts
a `timeout`. pass `options.storage` (a `@yaebal/sklad` `StorageAdapter`) to switch to the
durable replay engine — then the builder must be deterministic: route every side effect
through `ctx` or `cv.external()`.

## scenes — durable wizard

```typescript
import { ask, defineScene, scenes } from "@yaebal/scenes";

const register = defineScene<Context, { name: string; age: number }>({
	steps: [
		ask("name", { question: "what's your name?" }),
		ask("age", {
			question: (ctx) => `nice, ${ctx.scene.state.name}! how old are you?`,
			parse: (text) => (/^\d+$/.test(text) ? Number(text) : undefined),
			invalid: "age is a number — try again",
		}),
	],
	onLeave: (ctx, info) => info.reason === "finish" && ctx.send(`saved ${ctx.scene.state.name}`),
});

const bot = createBot(token).install(scenes({ register }, { storage }));
bot.command("register", (ctx) => ctx.scene.enter("register"));
bot.command("cancel", (ctx) => ctx.scene.leave({ cancelled: true }));
```

## rules

- none of the three require `@yaebal/session` — persistence goes through a `@yaebal/sklad`
  `StorageAdapter` passed to the plugin itself. the default is in-memory (lost on restart):
  fine for prompt and dev, pass real storage (redis/sqlite/file) for production wizards.
- `/commands` bypass an active scene/conversation by default (`passCommands`), and unclaimed
  updates fall through to normal handlers (`passthrough`) — so a global `/cancel` keeps
  working. don't re-implement command escapes per step.
- scenes key state per `chat.id:from.id` by default — safe in groups.
- `conversation.enter()` resolves when the flow *starts*, not when it finishes — read results
  in `onLeave(ctx, info)` via `info.result`.
- steps claim fresh messages only unless they declare `on` filter queries — for
  inline-keyboard wizards give the step `on: "callback_query:data"`.

## learn more

- https://yaebal.mom/docs/plugins/scenes/
- https://yaebal.mom/docs/plugins/conversation/
- https://yaebal.mom/docs/plugins/prompt/
