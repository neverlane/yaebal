import assert from "node:assert/strict";
import test from "node:test";
import { Composer, type Context } from "@yaebal/core";
import { MemoryStorage } from "@yaebal/sklad";
import { createTestEnv } from "@yaebal/test";
import {
	defineMachine,
	type EnterInfo,
	type LeaveInfo,
	type MachineSnapshot,
	stateMachine,
} from "./index.js";

type OrderEvent = { type: "PAY" } | { type: "SHIP" } | { type: "CANCEL" };

const sentTexts = (env: { callsTo(method: string): { params?: unknown }[] }): string[] =>
	env.callsTo("sendMessage").map((call) => (call.params as { text: string }).text);

function makeOrderMachine() {
	return defineMachine<Context, OrderEvent, { paidAt?: number }>({
		initial: "created",
		states: {
			created: {
				on: {
					PAY: {
						target: "paid",
						actions: (ctx) => {
							ctx.machine.context.paidAt = 1;
						},
					},
					CANCEL: { target: "cancelled" },
				},
			},
			paid: {
				onEnter: (ctx) => ctx.send("paid"),
				on: {
					SHIP: {
						target: "shipped",
						guard: (ctx) => ctx.machine.context.paidAt !== undefined,
					},
					CANCEL: { target: "cancelled" },
				},
			},
			shipped: {
				onEnter: (ctx) => ctx.send("shipped"),
			},
			cancelled: {
				onEnter: (ctx) => ctx.send("cancelled"),
			},
		},
	});
}

test("a machine activates at initial and transitions on matching events", async () => {
	const storage = new MemoryStorage<MachineSnapshot>();
	const order = makeOrderMachine();

	const bot = new Composer<Context>()
		.install(stateMachine(order, { storage }))
		.command("pay", (ctx) => ctx.machine.send({ type: "PAY" }))
		.command("ship", (ctx) => ctx.machine.send({ type: "SHIP" }))
		.command("status", (ctx) => ctx.reply(ctx.machine.state));

	const env = createTestEnv(bot);
	const user = env.createUser();
	const key = `${user.pmChat.id}:${user.id}`;

	await user.sendCommand("status");
	assert.deepEqual(sentTexts(env), ["created"]);
	assert.equal((await storage.get(key))?.state, "created");

	await user.sendCommand("pay");
	assert.deepEqual((await storage.get(key))?.context, { paidAt: 1 });
	assert.deepEqual(sentTexts(env), ["created", "paid"]);

	await user.sendCommand("ship");
	assert.deepEqual(sentTexts(env), ["created", "paid", "shipped"]);
	assert.equal((await storage.get(key))?.state, "shipped");
});

test("a guard that rejects skips the transition and send() resolves false", async () => {
	const storage = new MemoryStorage<MachineSnapshot>();
	const order = makeOrderMachine();
	let result: boolean | undefined;

	const bot = new Composer<Context>()
		.install(stateMachine(order, { storage }))
		.command("ship", async (ctx) => {
			result = await ctx.machine.send({ type: "SHIP" });
		});

	const env = createTestEnv(bot);
	const user = env.createUser();
	const key = `${user.pmChat.id}:${user.id}`;

	// "paid" without paidAt in context — as if the actions step never ran
	await storage.set(key, { state: "paid", context: {}, updatedAt: 0 });

	await user.sendCommand("ship");
	assert.equal(result, false);
	assert.equal((await storage.get(key))?.state, "paid"); // unchanged — the guard rejected
});

test("an event with no declared transition for the current state resolves false", async () => {
	const order = makeOrderMachine();
	let result: boolean | undefined;

	const bot = new Composer<Context>()
		.install(stateMachine(order))
		.command("ship", async (ctx) => {
			result = await ctx.machine.send({ type: "SHIP" });
		})
		.command("status", (ctx) => ctx.reply(ctx.machine.state));

	const env = createTestEnv(bot);
	const user = env.createUser();

	await user.sendCommand("ship"); // "created" has no SHIP transition
	assert.equal(result, false);

	await user.sendCommand("status");
	assert.deepEqual(sentTexts(env), ["created"]);
});

test("onEnter fires on first activation with info.from undefined", async () => {
	const enters: EnterInfo<OrderEvent>[] = [];
	const order = defineMachine<Context, OrderEvent>({
		initial: "created",
		states: {
			created: {
				onEnter: (_ctx, info) => enters.push(info),
				on: { PAY: { target: "paid" }, CANCEL: { target: "cancelled" } },
			},
			paid: { on: { SHIP: { target: "shipped" }, CANCEL: { target: "cancelled" } } },
			shipped: {},
			cancelled: {},
		},
	});

	const bot = new Composer<Context>()
		.install(stateMachine(order))
		.command("noop", (ctx) => ctx.reply(ctx.machine.state));

	const env = createTestEnv(bot);
	const user = env.createUser();
	await user.sendCommand("noop");

	assert.deepEqual(enters, [{ from: undefined, event: undefined }]);
});

test("onLeave fires with the target state and event on a matched transition", async () => {
	const leaves: LeaveInfo<OrderEvent>[] = [];
	const order = defineMachine<Context, OrderEvent>({
		initial: "created",
		states: {
			created: {
				onLeave: (_ctx, info) => leaves.push(info),
				on: { PAY: { target: "paid" }, CANCEL: { target: "cancelled" } },
			},
			paid: { on: { SHIP: { target: "shipped" }, CANCEL: { target: "cancelled" } } },
			shipped: {},
			cancelled: {},
		},
	});

	const bot = new Composer<Context>()
		.install(stateMachine(order))
		.command("pay", (ctx) => ctx.machine.send({ type: "PAY" }));

	const env = createTestEnv(bot);
	const user = env.createUser();
	await user.sendCommand("pay");

	assert.deepEqual(leaves, [{ to: "paid", event: { type: "PAY" } }]);
});

test("reset() returns to initial and rebuilds the context bag", async () => {
	const storage = new MemoryStorage<MachineSnapshot>();
	const order = makeOrderMachine();

	const bot = new Composer<Context>()
		.install(stateMachine(order, { storage }))
		.command("pay", (ctx) => ctx.machine.send({ type: "PAY" }))
		.command("reset", (ctx) => ctx.machine.reset());

	const env = createTestEnv(bot);
	const user = env.createUser();
	const key = `${user.pmChat.id}:${user.id}`;

	await user.sendCommand("pay");
	assert.equal((await storage.get(key))?.state, "paid");

	await user.sendCommand("reset");
	assert.equal((await storage.get(key))?.state, "created");
	assert.deepEqual((await storage.get(key))?.context, {});
});

test("ttl resets an inactive machine to initial, firing onEnter with the expired state as from", async () => {
	let clock = 1_000;
	const enters: EnterInfo<OrderEvent>[] = [];
	const storage = new MemoryStorage<MachineSnapshot>();
	const order = defineMachine<Context, OrderEvent>({
		initial: "created",
		states: {
			created: {
				onEnter: (_ctx, info) => enters.push(info),
				on: { PAY: { target: "paid" }, CANCEL: { target: "cancelled" } },
			},
			paid: { on: { SHIP: { target: "shipped" }, CANCEL: { target: "cancelled" } } },
			shipped: {},
			cancelled: {},
		},
	});

	const bot = new Composer<Context>()
		.install(stateMachine(order, { storage, ttl: 60_000, now: () => clock }))
		.command("pay", (ctx) => ctx.machine.send({ type: "PAY" }))
		.command("status", (ctx) => ctx.reply(ctx.machine.state));

	const env = createTestEnv(bot);
	const user = env.createUser();

	await user.sendCommand("pay");
	clock += 61_000; // the user wandered off for a minute
	await user.sendCommand("status");

	assert.deepEqual(sentTexts(env), ["created"]);
	assert.deepEqual(enters.at(-1), { from: "paid", event: undefined });
});

test("a snapshot pointing at a removed state self-heals back to initial", async () => {
	const storage = new MemoryStorage<MachineSnapshot>();
	const order = makeOrderMachine();

	const bot = new Composer<Context>()
		.install(stateMachine(order, { storage }))
		.command("status", (ctx) => ctx.reply(ctx.machine.state));

	const env = createTestEnv(bot);
	const user = env.createUser();
	const key = `${user.pmChat.id}:${user.id}`;

	await storage.set(key, { state: "delivered", context: {}, updatedAt: 0 }); // deploy removed this state

	await user.sendCommand("status");
	assert.deepEqual(sentTexts(env), ["created"]);
});

test("can() reports whether the current state declares a transition for an event type", async () => {
	const order = makeOrderMachine();
	const seen: boolean[] = [];

	const bot = new Composer<Context>().install(stateMachine(order)).command("check", (ctx) => {
		seen.push(ctx.machine.can("PAY"), ctx.machine.can("SHIP"));
	});

	const env = createTestEnv(bot);
	const user = env.createUser();
	await user.sendCommand("check");

	assert.deepEqual(seen, [true, false]); // "created" declares PAY, not SHIP
});
