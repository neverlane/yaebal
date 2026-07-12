import assert from "node:assert/strict";
import test from "node:test";
import { Composer, type Context } from "@yaebal/core";
import { createTestEnv, type TestEnv } from "@yaebal/test";
import { ConversationTimeoutError, conversation, createConversation } from "./index.js";

const TIMEOUT = 5000;

/** lets a conversation's detached builder chain (scheduled outside the dispatch path) settle before assertions. */
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function sentTexts(env: TestEnv): string[] {
	return env.callsTo("sendMessage").map((call) => (call.params as { text: string }).text);
}

test("walks through steps and consumes the chat's updates end to end", {
	timeout: TIMEOUT,
}, async () => {
	const greet = createConversation(async (cv, ctx) => {
		await ctx.send("name?");
		const a = await cv.waitFor("message:text");
		await a.send("age?");
		const b = await cv.waitFor("message:text");
		await b.send(`${a.text} is ${b.text}`);
		return { name: a.text, age: b.text };
	});

	let fellThrough = 0;
	const bot = new Composer<Context>()
		.install(conversation({ greet }))
		.command("greet", (ctx) => ctx.conversation.enter("greet"))
		.on("message:text", () => {
			fellThrough++;
		});

	const env = createTestEnv(bot);
	const user = env.createUser();

	await user.sendCommand("greet");
	await flush();
	await user.sendMessage("Bob");
	await flush();
	await user.sendMessage("30");
	await flush();

	assert.deepEqual(sentTexts(env), ["name?", "age?", "Bob is 30"]);
	assert.equal(fellThrough, 0); // every step was consumed by the conversation, none fell through
});

test("a different chat is not captured by another chat's conversation", {
	timeout: TIMEOUT,
}, async () => {
	const wait1 = createConversation(async (cv) => {
		await cv.wait();
	});

	let seen = "";
	const bot = new Composer<Context>()
		.install(conversation({ wait1 }))
		.command("go", (ctx) => ctx.conversation.enter("wait1"))
		.on("message:text", (ctx) => {
			seen = ctx.text ?? "";
		});

	const env = createTestEnv(bot);
	const userA = env.createUser();
	const userB = env.createUser();

	await userA.sendCommand("go");
	await flush();
	await userB.sendMessage("hello");

	assert.equal(seen, "hello");
});

test("active/current reflect state, and leave() rejects the parked wait so `finally` runs", {
	timeout: TIMEOUT,
}, async () => {
	const cleanupOrder: string[] = [];
	const wait1 = createConversation(async (cv) => {
		try {
			await cv.wait();
			cleanupOrder.push("resumed — should not happen");
		} finally {
			cleanupOrder.push("cleanup");
		}
	});

	const probes: Array<{ active: boolean; current: string | undefined }> = [];
	const bot = new Composer<Context>()
		.install(conversation({ wait1 }))
		.command("go", (ctx) => ctx.conversation.enter("wait1"))
		.command("probe", (ctx) => {
			probes.push({ active: ctx.conversation.active, current: ctx.conversation.current });
		})
		.command("leave", (ctx) => ctx.conversation.leave());

	const env = createTestEnv(bot);
	const user = env.createUser();

	await user.sendCommand("probe"); // before entering
	await user.sendCommand("go");
	await flush();
	await user.sendCommand("probe"); // while parked — commands bypass by default (passCommands)
	await user.sendCommand("leave");
	await flush();
	await user.sendCommand("probe"); // after leave()

	assert.deepEqual(probes, [
		{ active: false, current: undefined },
		{ active: true, current: "wait1" },
		{ active: false, current: undefined },
	]);
	assert.deepEqual(cleanupOrder, ["cleanup"]);
});

test("an update arriving while the builder is busy (not yet parked) is queued in order", {
	timeout: TIMEOUT,
}, async () => {
	let releaseBusyWork: (() => void) | undefined;
	const busy = createConversation(async (cv, ctx) => {
		await ctx.send("start");
		await new Promise<void>((resolve) => {
			releaseBusyWork = resolve;
		});
		const a = await cv.waitFor("message:text");
		const b = await cv.waitFor("message:text");
		await ctx.send(`${a.text},${b.text}`);
	});

	const bot = new Composer<Context>()
		.install(conversation({ busy }))
		.command("go", (ctx) => ctx.conversation.enter("busy"));

	const env = createTestEnv(bot);
	const user = env.createUser();

	await user.sendCommand("go");
	await flush();
	// both arrive while the builder is still parked on the un-resolved promise above (busy, not
	// parked in wait()) — they must queue and be delivered in order once it does park.
	await user.sendMessage("first");
	await user.sendMessage("second");

	assert.ok(releaseBusyWork);
	releaseBusyWork();
	await flush();

	assert.deepEqual(sentTexts(env), ["start", "first,second"]);
});

test("waitFor lets a non-matching update fall through to normal handlers (passthrough)", {
	timeout: TIMEOUT,
}, async () => {
	const textOnly = createConversation(async (cv, ctx) => {
		const a = await cv.waitFor("message:text");
		await ctx.send(`got ${a.text}`);
	});

	let stickerSeen = 0;
	const bot = new Composer<Context>()
		.install(conversation({ textOnly }))
		.command("go", (ctx) => ctx.conversation.enter("textOnly"))
		.on("message:sticker", () => {
			stickerSeen++;
		});

	const env = createTestEnv(bot);
	const user = env.createUser();

	await user.sendCommand("go");
	await flush();
	await user.sendSticker(); // doesn't match waitFor("message:text") — passthrough (default true)
	await user.sendMessage("hi");
	await flush();

	assert.equal(stickerSeen, 1);
	assert.deepEqual(sentTexts(env), ["got hi"]);
});

test("passthrough: false queues non-matching updates instead of letting them fall through", {
	timeout: TIMEOUT,
}, async () => {
	const textOnly = createConversation(async (cv, ctx) => {
		const a = await cv.waitFor("message:text");
		await ctx.send(`got ${a.text}`);
	});

	let stickerSeen = 0;
	const bot = new Composer<Context>()
		.install(conversation({ textOnly }, { passthrough: false }))
		.command("go", (ctx) => ctx.conversation.enter("textOnly"))
		.on("message:sticker", () => {
			stickerSeen++;
		});

	const env = createTestEnv(bot);
	const user = env.createUser();

	await user.sendCommand("go");
	await flush();
	await user.sendSticker(); // queued and discarded (never matches a text-only wait) — see docs
	await user.sendMessage("hi");
	await flush();

	assert.equal(stickerSeen, 0);
	assert.deepEqual(sentTexts(env), ["got hi"]);
});

test("passCommands lets /commands bypass an active conversation by default", {
	timeout: TIMEOUT,
}, async () => {
	const wait1 = createConversation(async (cv) => {
		await cv.wait();
	});

	let cancelled = false;
	const bot = new Composer<Context>()
		.install(conversation({ wait1 }))
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
	await flush();
	await user.sendCommand("cancel");
	await flush();

	assert.equal(cancelled, true);
	assert.equal((await user.sendCommand("cancel").then(() => "reached")) !== undefined, true); // sanity: bot still responsive
});

test("re-entering while active cancels the old builder (runs its finally) instead of racing it", {
	timeout: TIMEOUT,
}, async () => {
	const events: string[] = [];
	const first = createConversation(async (cv) => {
		try {
			await cv.wait();
			events.push("first resumed — should not happen");
		} finally {
			events.push("first cleanup");
		}
	});
	const second = createConversation(async (_cv, ctx) => {
		await ctx.send("second started");
		events.push("second ran");
	});

	const bot = new Composer<Context>()
		.install(conversation({ first, second }))
		.command("one", (ctx) => ctx.conversation.enter("first"))
		.command("two", (ctx) => ctx.conversation.enter("second"));

	const env = createTestEnv(bot);
	const user = env.createUser();

	await user.sendCommand("one");
	await flush();
	await user.sendCommand("two");
	await flush();

	assert.deepEqual(events, ["first cleanup", "second ran"]);
});

test("a thrown builder error reaches onError, not onLeave's silence, and ends the conversation", {
	timeout: TIMEOUT,
}, async () => {
	const errors: unknown[] = [];
	const leaves: string[] = [];
	const boom = createConversation(async () => {
		throw new Error("boom");
	});

	const bot = new Composer<Context>()
		.install(
			conversation(
				{ boom },
				{
					onError: (error) => errors.push(error),
					onLeave: (_ctx, info) => leaves.push(info.reason),
				},
			),
		)
		.command("go", (ctx) => ctx.conversation.enter("boom"));

	const env = createTestEnv(bot);
	const user = env.createUser();

	await user.sendCommand("go");
	await flush();

	assert.equal(errors.length, 1);
	assert.equal((errors[0] as Error).message, "boom");
	assert.deepEqual(leaves, ["error"]);
});

test("enter() returns quickly (doesn't wait for the conversation to finish) and onLeave carries the result", {
	timeout: TIMEOUT,
}, async () => {
	const noWait = createConversation(async (_cv, ctx) => {
		await ctx.send("done immediately");
		return { ok: true as const };
	});

	let result: unknown;
	const bot = new Composer<Context>()
		.install(conversation({ noWait }, { onLeave: (_ctx, info) => (result = info.result) }))
		.command("go", async (ctx) => {
			// safe to await here precisely because enter() never waits on a *future* update —
			// see ConversationControl.enter's doc.
			await ctx.conversation.enter("noWait");
		});

	const env = createTestEnv(bot);
	const user = env.createUser();
	await user.sendCommand("go");

	assert.deepEqual(result, { ok: true });
});

test("enter() as a bare command-handler return value doesn't deadlock a conversation that parks", {
	timeout: TIMEOUT,
}, async () => {
	// the most natural way to call enter() — and, before the enter()-return-value fix, exactly the
	// shape that deadlocked: core's compose() awaits whatever a handler returns.
	const parks = createConversation(async (cv, ctx) => {
		await ctx.send("waiting");
		const a = await cv.waitFor("message:text");
		await a.send(`got ${a.text}`);
	});

	const bot = new Composer<Context>()
		.install(conversation({ parks }))
		.command("go", (ctx) => ctx.conversation.enter("parks"));

	const env = createTestEnv(bot);
	const user = env.createUser();

	await user.sendCommand("go");
	await user.sendMessage("hi");

	assert.deepEqual(sentTexts(env), ["waiting", "got hi"]);
});

test("enter() with an unregistered name throws", { timeout: TIMEOUT }, async () => {
	const known = createConversation(async () => {});

	let error: unknown;
	const bot = new Composer<Context>()
		.install(conversation({ known }))
		.command("go", async (ctx) => {
			try {
				await (ctx.conversation.enter as unknown as (name: string) => Promise<unknown>)("nope");
			} catch (caught) {
				error = caught;
			}
		});

	const env = createTestEnv(bot);
	const user = env.createUser();
	await user.sendCommand("go");

	assert.match((error as Error).message, /unknown conversation "nope"/);
});

test("enter() with an unregistered name throws synchronously, not as an unhandled rejection", {
	timeout: TIMEOUT,
}, async () => {
	const known = createConversation(async () => {});

	let threwSynchronously = false;
	const bot = new Composer<Context>().install(conversation({ known })).command("go", (ctx) => {
		try {
			// deliberately not awaited — the recommended "fire and forget" enter() calling style.
			// validation (unknown name) must throw immediately here, not surface later as an
			// unhandled promise rejection with nobody to catch it.
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

test("calling wait() while one is already pending rejects immediately", {
	timeout: TIMEOUT,
}, async () => {
	let secondError: unknown;
	const doubleWait = createConversation(async (cv) => {
		const first = cv.wait();
		const second = cv.wait();
		try {
			await second;
		} catch (error) {
			secondError = error;
		}
		await first.catch(() => {});
	});

	const bot = new Composer<Context>()
		.install(conversation({ doubleWait }))
		.command("go", (ctx) => ctx.conversation.enter("doubleWait"));

	const env = createTestEnv(bot);
	const user = env.createUser();
	await user.sendCommand("go");
	await flush();

	assert.match((secondError as Error).message, /already pending/);
});

test("a wait() timeout rejects with ConversationTimeoutError and can be caught by the builder", {
	timeout: TIMEOUT,
}, async () => {
	const leaves: string[] = [];
	const patient = createConversation(async (cv, ctx) => {
		try {
			await cv.waitFor("message:text", { timeout: 1000 });
		} catch (error) {
			if (error instanceof ConversationTimeoutError) {
				await ctx.send("timed out");
				return;
			}
			throw error;
		}
	});

	const bot = new Composer<Context>()
		.install(conversation({ patient }, { onLeave: (_ctx, info) => leaves.push(info.reason) }))
		.command("go", (ctx) => ctx.conversation.enter("patient"));

	const env = createTestEnv(bot);
	env.useFakeTimers();
	try {
		const user = env.createUser();

		await user.sendCommand("go");
		await env.advanceTime(1500);
		await env.advanceTime(0); // let the caught-timeout continuation (ctx.send + finish) settle

		assert.deepEqual(sentTexts(env), ["timed out"]);
		assert.deepEqual(leaves, ["finish"]); // caught inside the builder — a normal finish, not a timeout leave
	} finally {
		// installTestClock() overrides the *global* setTimeout — leaving it faked would hang every
		// later test's real-timer flush() in this process.
		env.shutdown();
	}
});

test("an uncaught wait() timeout ends the conversation with onLeave reason 'timeout'", {
	timeout: TIMEOUT,
}, async () => {
	const leaves: Array<{ reason: string }> = [];
	const impatient = createConversation(async (cv) => {
		await cv.waitFor("message:text", { timeout: 1000 }); // never caught
	});

	const bot = new Composer<Context>()
		.install(
			conversation(
				{ impatient },
				{ onLeave: (_ctx, info) => leaves.push({ reason: info.reason }) },
			),
		)
		.command("go", (ctx) => ctx.conversation.enter("impatient"));

	const env = createTestEnv(bot);
	env.useFakeTimers();
	try {
		const user = env.createUser();

		await user.sendCommand("go");
		await env.advanceTime(1500);

		assert.deepEqual(leaves, [{ reason: "timeout" }]);
	} finally {
		env.shutdown();
	}
});

test("cv.form.int validates and re-asks on invalid input", { timeout: TIMEOUT }, async () => {
	const ageForm = createConversation(async (cv, ctx) => {
		const age = await cv.form.int({
			question: "age?",
			min: 1,
			max: 120,
			invalid: "digits 1-120 only",
		});
		await ctx.send(`age: ${age}`);
	});

	const bot = new Composer<Context>()
		.install(conversation({ ageForm }))
		.command("go", (ctx) => ctx.conversation.enter("ageForm"));

	const env = createTestEnv(bot);
	const user = env.createUser();

	await user.sendCommand("go");
	await flush();
	await user.sendMessage("not a number");
	await flush();
	await user.sendMessage("999"); // out of range
	await flush();
	await user.sendMessage("42");
	await flush();

	assert.deepEqual(sentTexts(env), ["age?", "digits 1-120 only", "digits 1-120 only", "age: 42"]);
});
