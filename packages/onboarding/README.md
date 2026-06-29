# @yaebal/onboarding

declarative first-run tutorials and feature tours. build a flow once, install it as a typed plugin, then start it from handlers through `ctx.onboarding.<id>`.

## install

```sh
pnpm add @yaebal/onboarding
```

## usage

```ts
import { Bot } from "@yaebal/core";
import { createOnboarding } from "@yaebal/onboarding";

const welcome = createOnboarding({ id: "welcome" })
	.step("hello", {
		text: "hi. i'll show you around.",
		buttons: ["next", "dismiss"],
	})
	.step("commands", {
		text: "use /help to list commands and /settings to tune the bot.",
		buttons: ["next", "exit"],
	})
	.step("done", {
		text: "you're ready.",
	})
	.onComplete((ctx) => ctx.send("welcome aboard."))
	.build();

const bot = new Bot(process.env.BOT_TOKEN!).install(welcome);

bot.command("start", (ctx) => ctx.onboarding.welcome.start());
bot.command("tour", (ctx) => ctx.onboarding.welcome.start({ force: true }));

bot.start();
```

`install(welcome)` enriches the context type, so `ctx.onboarding.welcome` is a `FlowControl<"hello" | "commands" | "done">` with typed `goto`, `next({ from })`, and `start({ from })` step ids.

## controls

```ts
ctx.onboarding.welcome.status;       // "null" | "active" | "completed" | ...
ctx.onboarding.welcome.currentStep;  // typed step id, or null
ctx.onboarding.welcome.data.plan = "pro";

await ctx.onboarding.welcome.start();
await ctx.onboarding.welcome.next({ from: "hello" });
await ctx.onboarding.welcome.goto("commands");
await ctx.onboarding.welcome.exit();
await ctx.onboarding.welcome.dismiss();
await ctx.onboarding.welcome.undismiss();
await ctx.onboarding.welcome.complete();
```

`ctx.onboarding` also exposes `active`, `list`, `disableAll()`, `enableAll()`, `exitAll()`, and `flow(id)` for multi-flow bots.

## storage

state is in memory by default and shared between onboarding flows in the same process. pass a persistent adapter to survive restarts:

```ts
createOnboarding({
	id: "welcome",
	storage: myStorage, // { get(key), set(key, value), delete(key) }
	scope: "user",     // default. use "chat" for per-chat tours
});
```

## buttons

`buttons` accepts simple built-in controls or explicit button objects:

```ts
.step("pick", {
	text: "where next?",
	buttons: [
		"next",
		{ text: "skip setup", goto: "done" },
		{ text: "docs", url: "https://yaebal.pages.dev" },
	],
})
```

flow and step ids are embedded into telegram `callback_data`, so keep them short and use only letters, numbers, `_`, and `-`.

---

part of [**yaebal**](https://github.com/neverlane/yaebal) - a type-safe, runtime-agnostic Telegram Bot API framework. MIT.
