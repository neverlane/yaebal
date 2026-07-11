import { defineMachine, type MachineContext, stateMachine } from "@yaebal/state-machine";
import { type Context, createBot } from "yaebal";

// a focused tour of @yaebal/state-machine.
//
// pnpm --filter @yaebal/example-state-machine dev (needs BOT_TOKEN in .env)

const token = process.env.BOT_TOKEN;
if (!token) {
	console.error("set BOT_TOKEN in examples/state-machine/.env first (copy .env.example)");
	process.exit(1);
}

type OrderEvent = { type: "PAY" } | { type: "SHIP" } | { type: "DELIVER" } | { type: "CANCEL" };

interface OrderContext {
	paidAt?: number;
	cancelLocked: boolean;
}

type OrderCtx = MachineContext<Context, OrderEvent, OrderContext>;

const order = defineMachine<Context, OrderEvent, OrderContext>({
	initial: "created",
	context: () => ({ cancelLocked: false }),
	states: {
		created: {
			// info.from is undefined on the very first activation, set after a /reset
			onEnter: (ctx, info) => info.from !== undefined && ctx.send("starting a new order."),
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
			onEnter: (ctx) => ctx.send("payment received - ship when ready with /ship."),
			on: {
				SHIP: { target: "shipped", guard: (ctx) => ctx.machine.context.paidAt !== undefined },
				CANCEL: {
					target: "cancelled",
					guard: (ctx) => !ctx.machine.context.cancelLocked,
				},
			},
		},
		shipped: {
			onEnter: (ctx) => ctx.send("shipped 📦 - mark it delivered with /deliver."),
			on: {
				DELIVER: { target: "delivered" },
			},
		},
		delivered: {
			onEnter: (ctx) => ctx.send("delivered ✅ this order is done. /reset to start another."),
		},
		cancelled: {
			onEnter: (ctx) => ctx.send("order cancelled. /reset to start another."),
		},
	},
});

async function sendEvent(ctx: OrderCtx, event: OrderEvent): Promise<unknown> {
	if (!ctx.machine.can(event.type)) {
		return ctx.reply(`can't ${event.type.toLowerCase()} from "${ctx.machine.state}".`);
	}

	const moved = await ctx.machine.send(event);
	if (!moved) return ctx.reply("blocked - a guard rejected that transition.");
}

const bot = createBot(token)
	.install(stateMachine(order))
	.command("start", (ctx) =>
		ctx.reply(
			"a focused tour of @yaebal/state-machine. commands: /status /pay /ship /deliver /cancel /lockcancel /reset",
		),
	)
	.command("status", (ctx) =>
		ctx.reply(`state=${ctx.machine.state} context=${JSON.stringify(ctx.machine.context)}`),
	)
	.command("pay", (ctx) => sendEvent(ctx, { type: "PAY" }))
	.command("ship", (ctx) => sendEvent(ctx, { type: "SHIP" }))
	.command("deliver", (ctx) => sendEvent(ctx, { type: "DELIVER" }))
	.command("cancel", (ctx) => sendEvent(ctx, { type: "CANCEL" }))
	.command("lockcancel", (ctx) => {
		ctx.machine.context.cancelLocked = true;
		return ctx.reply(
			"cancellation locked for this order - /cancel will now be rejected by the guard.",
		);
	})
	.command("reset", async (ctx) => {
		await ctx.machine.reset();
		return ctx.reply("order reset.");
	})
	.onError((error, ctx) => {
		console.error(`update ${ctx.update.update_id} failed:`, error);
	})
	.onStart(async (info) => {
		await bot.api
			.call("setMyCommands", {
				commands: [
					{ command: "start", description: "show the available commands" },
					{ command: "status", description: "show the current state and context" },
					{ command: "pay", description: "send the PAY event" },
					{ command: "ship", description: "send the SHIP event" },
					{ command: "deliver", description: "send the DELIVER event" },
					{ command: "cancel", description: "send the CANCEL event" },
					{ command: "lockcancel", description: "lock cancellation (guard demo)" },
					{ command: "reset", description: "reset the order to its initial state" },
				],
			})
			.catch(() => {});

		console.log(`@${info.username} is live - DM it /start`);
	});

process.once("SIGINT", () => bot.stop());
process.once("SIGTERM", () => bot.stop());

await bot.start();
