# @yaebal/state-machine

a declarative finite-state machine backed by [`@yaebal/sklad`](../sklad/) storage: typed events,
guarded transitions, `onEnter`/`onLeave` hooks. unlike [`@yaebal/scenes`](../scenes/), there are
no steps and no explicit `enter()` — a key's machine is always active, starting at `initial` the
first time it's seen, and moves only when a typed event you send matches a transition declared
for the current state.

## install

```sh
pnpm add @yaebal/state-machine
```

## usage

```ts
import { defineMachine, stateMachine } from "@yaebal/state-machine";
import { createBot, type Context } from "yaebal";

type OrderEvent = { type: "PAY" } | { type: "SHIP" } | { type: "CANCEL" };

const order = defineMachine<Context, OrderEvent, { paidAt?: number }>({
	initial: "created",
	states: {
		created: {
			on: {
				PAY: {
					target: "paid",
					actions: (ctx) => {
						ctx.machine.context.paidAt = Date.now();
					},
				},
				CANCEL: { target: "cancelled" },
			},
		},
		paid: {
			onEnter: (ctx) => ctx.send("payment received — shipping soon"),
			on: {
				SHIP: { target: "shipped" },
				CANCEL: { target: "cancelled", guard: (ctx) => ctx.machine.context.paidAt !== undefined },
			},
		},
		shipped: {
			onEnter: (ctx) => ctx.send("your order shipped 📦"),
		},
		cancelled: {
			onEnter: (ctx) => ctx.send("order cancelled"),
		},
	},
});

const bot = createBot(token).install(stateMachine(order));

bot.command("pay", (ctx) => ctx.machine.send({ type: "PAY" }));
bot.command("ship", (ctx) => ctx.machine.send({ type: "SHIP" }));
bot.command("status", (ctx) => ctx.reply(`order is ${ctx.machine.state}`));
```

## behavior

- **always active** — every key starts in `initial` the moment it's first seen; there is no
  `enter()`/`leave()` lifecycle like `@yaebal/scenes`. `onEnter` fires on that first activation
  too, with `info.from === undefined`.
- **typed events** — `on` is keyed by your event union's `type` field, so `ctx.machine.send(...)`
  only accepts events the current state's type signature allows, and guards/actions receive the
  narrowed event.
- **guarded transitions** — a state can declare several transitions for the same event as an
  array; they're tried in order, and a `guard` returning `false` skips to the next candidate.
  `send()` resolves `true` only if a transition actually fired.
- **extended state** — `ctx.machine.context` is a plain, mutable, json-serializable bag (built by
  `def.context(ctx)`), persisted after every transition alongside the current state name.
- **durable snapshots** — state + context persist as one json snapshot per `chat:user` key in any
  `StorageAdapter` (see `@yaebal/sklad`); restarts resume a key in the same state. `ttl` resets an
  inactive machine to `initial` lazily; snapshots pointing at a state a deploy removed self-heal
  instead of shadowing the key.
- **hooks** — `onEnter(ctx, { from, event })` / `onLeave(ctx, { to, event })` fire on every
  transition into/out of the state they're declared on.

## options

```ts
stateMachine(order, {
	storage: myStorageAdapter, // defaults to in-memory (lost on restart)
	getKey: (ctx) => ctx.chat?.id?.toString(), // defaults to `chat.id:from.id`
	ttl: 24 * 60 * 60 * 1000, // reset an inactive machine after a day
});
```

---

part of [**yaebal**](https://github.com/neverlane/yaebal) — a type-safe, runtime-agnostic Telegram Bot API framework. MIT.
