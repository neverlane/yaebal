import assert from "node:assert/strict";
import test from "node:test";
import { Composer, type Context } from "@yaebal/core";
import { createTestEnv } from "@yaebal/test";
import { chatSink } from "./chat-sink.js";
import { serializeError } from "./errors.js";
import type { AuditApiErrorEvent } from "./types.js";

const errorEvent = (
	overrides: Partial<Omit<AuditApiErrorEvent, "kind">> = {},
): AuditApiErrorEvent => ({
	kind: "api.error",
	level: "error",
	timestamp: 1,
	callId: "c1",
	method: "sendPhoto",
	params: undefined,
	error: serializeError(new Error("boom")),
	attempt: 1,
	...overrides,
});

function setup(options: Parameters<typeof chatSink>[1]) {
	const bot = new Composer<Context>();
	const env = createTestEnv(bot);
	const sink = chatSink({ api: env.api }, options);
	return { env, sink };
}

test("sends errors to the chat by default (minLevel: error)", async () => {
	const { env, sink } = setup({ chatId: 123 });
	await sink.write(undefined, errorEvent());

	const call = env.lastApiCall("sendMessage");
	assert.ok(call);
	assert.equal(call?.params?.chat_id, 123);
});

test("does not send info-level events under the default minLevel", async () => {
	const { env, sink } = setup({ chatId: 123 });
	await sink.write(undefined, {
		kind: "api.call",
		level: "info",
		timestamp: 1,
		callId: "c1",
		method: "sendMessage",
		params: undefined,
		attempt: 1,
	});

	assert.equal(env.lastApiCall("sendMessage"), undefined);
});

test('minLevel: "info" sends everything, including its own echoed api.call/api.result — without looping', async () => {
	const { env, sink } = setup({ chatId: 123, minLevel: "info", dedupeWindowMs: 0, throttleMs: 0 });

	await sink.write(undefined, {
		kind: "api.call",
		level: "info",
		timestamp: 1,
		callId: "c1",
		method: "sendMessage",
		params: { text: "hi" },
		attempt: 1,
	});

	// exactly one sendMessage — the alert itself. if the self-exclusion guard failed,
	// the alert's own api.call/api.result would trigger further sends here.
	assert.equal(env.callsTo("sendMessage").length, 1);
});

test("dedupes repeats of the same signature within the dedupe window", async () => {
	const { env, sink } = setup({ chatId: 123, dedupeWindowMs: 60_000, throttleMs: 0 });

	await sink.write(undefined, errorEvent());
	await sink.write(undefined, errorEvent());

	assert.equal(env.callsTo("sendMessage").length, 1);
});

test("throttles distinct signatures that arrive faster than throttleMs", async () => {
	const { env, sink } = setup({ chatId: 123, dedupeWindowMs: 0, throttleMs: 60_000 });

	await sink.write(undefined, errorEvent({ method: "sendPhoto" }));
	await sink.write(undefined, errorEvent({ method: "sendVideo" }));

	assert.equal(env.callsTo("sendMessage").length, 1);
});

test("a custom format() controls the alert text", async () => {
	const { env, sink } = setup({ chatId: 123, format: () => "custom alert" });
	await sink.write(undefined, errorEvent());

	assert.equal(env.lastApiCall("sendMessage")?.params?.text, "custom alert");
});
