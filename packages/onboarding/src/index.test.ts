import assert from "node:assert/strict";
import test from "node:test";
import { Composer, Context, type Middleware } from "@yaebal/core";
import {
	createOnboarding,
	decodeOnboardingToken,
	encodeOnboardingToken,
	MemoryOnboardingStorage,
	memoryStorage,
} from "./index.js";

const noop = async () => {};
const entry = <C extends Context>(c: Composer<C>) =>
	c.toMiddleware() as unknown as Middleware<Context>;

interface Call {
	method: string;
	params: Record<string, unknown>;
}

function fakeApi() {
	const calls: Call[] = [];
	let messageId = 100;

	const api = {
		sendMessage: (params: Record<string, unknown>) => {
			calls.push({ method: "sendMessage", params });
			return Promise.resolve({ message_id: messageId++ });
		},
		answerCallbackQuery: (params: Record<string, unknown> = {}) => {
			calls.push({ method: "answerCallbackQuery", params });
			return Promise.resolve(true);
		},
		call: (method: string, params: Record<string, unknown> = {}) => {
			calls.push({ method, params });
			return Promise.resolve({ message_id: messageId++ });
		},
	} as never;

	return { api, calls };
}

function msgCtx(api: never, text: string, userId = 1, chatId = userId): Context {
	return new Context({
		api,
		update: {
			update_id: 1,
			message: {
				message_id: 1,
				date: 0,
				chat: { id: chatId, type: "private" },
				from: { id: userId, is_bot: false, first_name: "u" },
				text,
			},
		} as never,
		updateType: "message",
	});
}

function callbackCtx(api: never, data: string, userId = 1, chatId = userId): Context {
	return new Context({
		api,
		update: {
			update_id: 2,
			callback_query: {
				id: "cb",
				from: { id: userId, is_bot: false, first_name: "u" },
				message: { message_id: 100, date: 0, chat: { id: chatId, type: "private" } },
				data,
			},
		} as never,
		updateType: "callback_query",
	});
}

function findCall(calls: Call[], method: string): Call {
	const call = calls.find((c) => c.method === method);
	assert.ok(call, `expected ${method} call`);

	return call;
}

function buttonData(params: Record<string, unknown>, label: string): string {
	const markup = params.reply_markup as {
		inline_keyboard: Array<Array<{ text: string; callback_data?: string }>>;
	};

	for (const row of markup.inline_keyboard) {
		for (const button of row) {
			if (button.text === label && button.callback_data) return button.callback_data;
		}
	}

	throw new Error(`button ${label} not found`);
}

test("MemoryOnboardingStorage round-trips records", async () => {
	const storage = new MemoryOnboardingStorage();
	const record = { kind: "global" as const, disabled: true };

	await storage.set("global:1", record);
	assert.deepEqual(await storage.get("global:1"), record);

	await storage.delete("global:1");
	assert.equal(await storage.get("global:1"), undefined);
});

test("tokens round-trip and enforce callback_data length", () => {
	const raw = encodeOnboardingToken("goto", "welcome", "abc123", "hello", "done");

	assert.deepEqual(decodeOnboardingToken(raw), {
		op: "goto",
		flowId: "welcome",
		runId: "abc123",
		stepId: "hello",
		target: "done",
	});
	assert.equal(decodeOnboardingToken("other:next:a:b:c"), null);
	assert.throws(
		() => encodeOnboardingToken("next", "x".repeat(70), "abc123", "hello"),
		/callback_data too long/,
	);
});

test("builder validates flow and step ids", () => {
	assert.throws(() => createOnboarding({ id: "bad:id" }), /must use only/);
	assert.throws(() => createOnboarding({ id: "empty" }).build(), /at least one step/);
	assert.throws(
		() =>
			createOnboarding({ id: "dup" })
				.step("hello", { text: "hello" })
				.step("hello", { text: "again" }),
		/duplicate step id/,
	);
});

test("start renders the first step; callback next renders and completes the last step", async () => {
	const { api, calls } = fakeApi();
	const storage = memoryStorage();
	let startResult = "";
	let completed = 0;

	const welcome = createOnboarding({ id: "welcome_test_start", storage })
		.step("hello", { text: "hello", buttons: ["next"] })
		.step("done", { text: "done" })
		.onComplete(() => {
			completed++;
		})
		.build();

	const mw = entry(
		new Composer<Context>().install(welcome).command("start", async (ctx) => {
			startResult = await ctx.onboarding.welcome_test_start.start();
		}),
	);

	await mw(msgCtx(api, "/start"), noop);

	assert.equal(startResult, "started");

	const sent = findCall(calls, "sendMessage");
	assert.equal(sent.params.text, "hello");

	const next = buttonData(sent.params, "next");
	assert.equal(decodeOnboardingToken(next)?.op, "next");

	const active = await storage.get("flow:welcome_test_start:1");
	assert.equal(active?.status, "active");
	assert.equal(active?.stepId, "hello");

	calls.length = 0;
	await mw(callbackCtx(api, next), noop);

	const edit = findCall(calls, "editMessageText");
	assert.equal(edit.params.text, "done");
	assert.equal(findCall(calls, "answerCallbackQuery").params.text, undefined);
	assert.equal(completed, 1);

	const done = await storage.get("flow:welcome_test_start:1");
	assert.equal(done?.status, "completed");
	assert.equal(done?.stepId, "done");
});

test("disableAll blocks start until enableAll", async () => {
	const { api, calls } = fakeApi();
	const storage = memoryStorage();
	let result = "";

	const flow = createOnboarding({ id: "disable_test", storage })
		.step("hello", { text: "hello", buttons: ["next"] })
		.step("done", { text: "done" })
		.build();

	const mw = entry(
		new Composer<Context>()
			.install(flow)
			.command("disable", (ctx) => ctx.onboarding.disableAll())
			.command("enable", (ctx) => ctx.onboarding.enableAll())
			.command("start", async (ctx) => {
				result = await ctx.onboarding.disable_test.start();
			}),
	);

	await mw(msgCtx(api, "/disable", 7), noop);
	assert.equal((await storage.get("global:7"))?.disabled, true);

	await mw(msgCtx(api, "/start", 7), noop);
	assert.equal(result, "opted-out");
	assert.equal(
		calls.some((c) => c.method === "sendMessage"),
		false,
	);

	await mw(msgCtx(api, "/enable", 7), noop);
	assert.equal((await storage.get("global:7"))?.disabled, false);

	await mw(msgCtx(api, "/start", 7), noop);
	assert.equal(result, "started");
	assert.equal(findCall(calls, "sendMessage").params.text, "hello");
});

test("advanceOn can advance from a message and stop fallthrough", async () => {
	const { api, calls } = fakeApi();
	const storage = memoryStorage();
	let fellThrough = 0;

	const flow = createOnboarding({ id: "advance_test", storage })
		.step("wait", {
			text: "say ok",
			advanceOn: (ctx) => ctx.text === "ok",
			passthrough: false,
		})
		.step("done", { text: "done" })
		.build();

	const mw = entry(
		new Composer<Context>()
			.install(flow)
			.command("start", (ctx) => ctx.onboarding.advance_test.start())
			.on("message:text", () => {
				fellThrough++;
			}),
	);

	await mw(msgCtx(api, "/start", 9), noop);
	calls.length = 0;

	await mw(msgCtx(api, "ok", 9), noop);

	assert.equal(fellThrough, 0);
	assert.equal(findCall(calls, "sendMessage").params.text, "done");
	assert.equal((await storage.get("flow:advance_test:9"))?.status, "completed");
});
