import assert from "node:assert/strict";
import test from "node:test";
import { Composer, type Context } from "@yaebal/core";
import { MemoryStorage } from "@yaebal/sklad";
import { createTestEnv, type TestEnv } from "@yaebal/test";
import { conversation, createConversation } from "./index.js";

const TIMEOUT = 5000;

function sentTexts(env: TestEnv): string[] {
	return env.callsTo("sendMessage").map((call) => (call.params as { text: string }).text);
}

test("walks through steps exactly like the live engine, end to end", {
	timeout: TIMEOUT,
}, async () => {
	const storage = new MemoryStorage();
	const greet = createConversation(async (cv, ctx) => {
		await ctx.send("name?");
		const a = await cv.waitFor("message:text");
		await a.send("age?");
		const b = await cv.waitFor("message:text");
		await b.send(`${a.text} is ${b.text}`);
	});

	const bot = new Composer<Context>()
		.install(conversation({ greet }, { storage }))
		.command("greet", (ctx) => ctx.conversation.enter("greet"));

	const env = createTestEnv(bot);
	const user = env.createUser();

	await user.sendCommand("greet");
	await user.sendMessage("Bob");
	await user.sendMessage("30");

	assert.deepEqual(sentTexts(env), ["name?", "age?", "Bob is 30"]);
});

test("progress survives a restart: a fresh engine replays the persisted log and resumes", {
	timeout: TIMEOUT,
}, async () => {
	const storage = new MemoryStorage();
	const greet = createConversation(async (cv, ctx) => {
		await ctx.send("name?");
		const a = await cv.waitFor("message:text");
		await a.send("age?");
		const b = await cv.waitFor("message:text");
		await b.send(`${a.text} is ${b.text}`);
	});

	// process 1: enter, answer the first question, then "crash" (nothing more happens with this env/bot).
	const bot1 = new Composer<Context>()
		.install(conversation({ greet }, { storage }))
		.command("greet", (ctx) => ctx.conversation.enter("greet"));
	const env1 = createTestEnv(bot1);
	const user1 = env1.createUser();

	await user1.sendCommand("greet");
	await user1.sendMessage("Bob");
	assert.deepEqual(sentTexts(env1), ["name?", "age?"]);

	// process 2: a brand-new engine instance (same def, same storage) — no in-memory state at all.
	const bot2 = new Composer<Context>().install(conversation({ greet }, { storage }));
	const env2 = createTestEnv(bot2, { results: {} });
	// same chat id as user1 so the durable key matches
	const user2 = env2.createUser({ id: user1.id });

	await user2.sendMessage("30");

	// "name?" and "age?" must NOT be sent again by env2 — replaying history must not re-execute it.
	assert.deepEqual(sentTexts(env2), ["Bob is 30"]);
});

test("a builder with no wait() calls finishes and deletes its storage entry in one turn", {
	timeout: TIMEOUT,
}, async () => {
	const storage = new MemoryStorage();
	const noWait = createConversation(async (_cv, ctx) => {
		await ctx.send("done immediately");
	});

	const leaves: string[] = [];
	const bot = new Composer<Context>()
		.install(
			conversation({ noWait }, { storage, onLeave: (_ctx, info) => leaves.push(info.reason) }),
		)
		.command("go", (ctx) => ctx.conversation.enter("noWait"));

	const env = createTestEnv(bot);
	const user = env.createUser();
	await user.sendCommand("go");

	assert.deepEqual(sentTexts(env), ["done immediately"]);
	assert.deepEqual(leaves, ["finish"]);
	assert.equal(await storage.get(`${user.pmChat.id}:${user.id}`), undefined);
});

test("leave() deletes the persisted state and fires onLeave with reason 'left'", {
	timeout: TIMEOUT,
}, async () => {
	const storage = new MemoryStorage();
	const wait1 = createConversation(async (cv) => {
		await cv.wait();
	});

	const leaves: string[] = [];
	const bot = new Composer<Context>()
		.install(
			conversation({ wait1 }, { storage, onLeave: (_ctx, info) => leaves.push(info.reason) }),
		)
		.command("go", (ctx) => ctx.conversation.enter("wait1"))
		.command("leave", (ctx) => ctx.conversation.leave());

	const env = createTestEnv(bot);
	const user = env.createUser();

	await user.sendCommand("go");
	await user.sendCommand("leave");

	assert.deepEqual(leaves, ["left"]);
	assert.equal(await storage.get(`${user.pmChat.id}:${user.id}`), undefined);
});

test("re-entering while active replaces the persisted session (onLeave reason 'replaced')", {
	timeout: TIMEOUT,
}, async () => {
	const storage = new MemoryStorage();
	const first = createConversation(async (cv) => {
		await cv.wait();
	});
	const second = createConversation(async (_cv, ctx) => {
		await ctx.send("second started");
	});

	const leaves: string[] = [];
	const bot = new Composer<Context>()
		.install(
			conversation(
				{ first, second },
				{ storage, onLeave: (_ctx, info) => leaves.push(info.reason) },
			),
		)
		.command("one", (ctx) => ctx.conversation.enter("first"))
		.command("two", (ctx) => ctx.conversation.enter("second"));

	const env = createTestEnv(bot);
	const user = env.createUser();

	await user.sendCommand("one");
	await user.sendCommand("two");

	assert.deepEqual(leaves, ["replaced", "finish"]);
	assert.deepEqual(sentTexts(env), ["second started"]);
});

test("a non-matching update falls through (passthrough) without persisting duplicate progress", {
	timeout: TIMEOUT,
}, async () => {
	const storage = new MemoryStorage();
	const textOnly = createConversation(async (cv, ctx) => {
		const a = await cv.waitFor("message:text");
		await ctx.send(`got ${a.text}`);
	});

	let stickerSeen = 0;
	const bot = new Composer<Context>()
		.install(conversation({ textOnly }, { storage }))
		.command("go", (ctx) => ctx.conversation.enter("textOnly"))
		.on("message:sticker", () => {
			stickerSeen++;
		});

	const env = createTestEnv(bot);
	const user = env.createUser();

	await user.sendCommand("go");
	await user.sendSticker();
	await user.sendMessage("hi");

	assert.equal(stickerSeen, 1);
	assert.deepEqual(sentTexts(env), ["got hi"]);
});

test("passCommands lets /commands bypass an active durable conversation by default", {
	timeout: TIMEOUT,
}, async () => {
	const storage = new MemoryStorage();
	const wait1 = createConversation(async (cv) => {
		await cv.wait();
	});

	let cancelled = false;
	const bot = new Composer<Context>()
		.install(conversation({ wait1 }, { storage }))
		.command("go", (ctx) => ctx.conversation.enter("wait1"))
		.command("cancel", async (ctx) => {
			if (ctx.conversation.active) {
				await ctx.conversation.leave();
				cancelled = true;
			}
		});

	const env = createTestEnv(bot);
	const user = env.createUser();

	await user.sendCommand("go");
	await user.sendCommand("cancel");

	assert.equal(cancelled, true);
});

test("active/current/snapshot reflect the persisted session", { timeout: TIMEOUT }, async () => {
	const storage = new MemoryStorage();
	const wait1 = createConversation(async (cv) => {
		await cv.wait();
	});

	const probes: Array<{ active: boolean; current: string | undefined }> = [];
	const bot = new Composer<Context>()
		.install(conversation({ wait1 }, { storage }))
		.command("go", (ctx) => ctx.conversation.enter("wait1"))
		.command("probe", (ctx) => {
			probes.push({ active: ctx.conversation.active, current: ctx.conversation.current });
		});

	const env = createTestEnv(bot);
	const user = env.createUser();

	await user.sendCommand("probe");
	await user.sendCommand("go");
	await user.sendCommand("probe");

	assert.deepEqual(probes, [
		{ active: false, current: undefined },
		{ active: true, current: "wait1" },
	]);
});

test("a builder that isn't deterministic is caught with a clear error instead of misbehaving", {
	timeout: TIMEOUT,
}, async () => {
	const storage = new MemoryStorage();
	let turnNumber = 0;
	// every turn replays the *whole* builder from scratch, re-running this line each time — a
	// deterministic builder must reach the same branch a given turn already committed to the log.
	// this one doesn't: turn 2 (turnNumber becomes 2, even) records an `external` call inside the
	// "else" branch; turn 3's fresh replay (turnNumber becomes 3, odd) takes the "if" branch
	// instead when it reaches that same point — a real, detectable divergence from history, not a
	// harmless extension of it (see the docs' determinism contract).
	const flaky = createConversation(async (cv, ctx) => {
		turnNumber++;
		if (turnNumber % 2 === 1) {
			await cv.waitFor("message:text"); // step A
		} else {
			await cv.external(() => 1);
			await cv.waitFor("message:text"); // step A
		}
		await cv.waitFor("message:text"); // step B — keeps the conversation open for a turn 3
		await ctx.send("done");
	});

	const errors: unknown[] = [];
	const bot = new Composer<Context>()
		.install(conversation({ flaky }, { storage, onError: (error) => errors.push(error) }))
		.command("go", (ctx) => ctx.conversation.enter("flaky"));

	const env = createTestEnv(bot);
	const user = env.createUser();

	await user.sendCommand("go"); // turn 1 (fresh enter): odd — takes the "if" branch, parks at step A
	await user.sendMessage("a-answer"); // turn 2: even — takes the "else" branch, records external(), parks at step B
	await user.sendMessage("b-answer"); // turn 3: odd again — replaying turn 2's "else" branch, but now takes "if" — mismatch

	assert.equal(errors.length, 1);
	assert.match((errors[0] as Error).message, /durable replay expected/);
});

test("enter() with an unregistered name throws synchronously, not as an unhandled rejection", {
	timeout: TIMEOUT,
}, async () => {
	const storage = new MemoryStorage();
	const known = createConversation(async () => {});

	let threwSynchronously = false;
	const bot = new Composer<Context>()
		.install(conversation({ known }, { storage }))
		.command("go", (ctx) => {
			try {
				(ctx.conversation.enter as unknown as (name: string) => Promise<unknown>)("nope");
			} catch {
				threwSynchronously = true;
			}
		});

	const env = createTestEnv(bot);
	const user = env.createUser();
	await user.sendCommand("go");

	assert.equal(threwSynchronously, true);
});
