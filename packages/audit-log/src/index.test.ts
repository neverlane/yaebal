import assert from "node:assert/strict";
import test from "node:test";
import { Composer, type Context } from "@yaebal/core";
import { apiError, createTestEnv, type TestEnv } from "@yaebal/test";
import {
	type AuditEvent,
	type AuditLogHandle,
	type AuditLogOptions,
	type AuditSink,
	auditLog,
	createAuditLogger,
	DEFAULT_EXCLUDED_METHODS,
	jsonFormatter,
	textFormatter,
} from "./index.js";

function recordingSink(): AuditSink & { entries: unknown[]; events: AuditEvent[] } {
	const entries: unknown[] = [];
	const events: AuditEvent[] = [];

	return {
		entries,
		events,
		write(entry, event) {
			entries.push(entry);
			events.push(event);
		},
	};
}

/**
 * wire `auditLog`'s direct-install form onto a test bot: `createTestEnv` dispatches
 * updates through `bot` but routes outgoing calls through its own mock `env.api`
 * (never the real `Bot.api`) — so hooks must be attached to `env.api`, not `bot`.
 */
function attachAuditLog(
	bot: Composer<Context>,
	env: TestEnv<Context>,
	options: AuditLogOptions,
): AuditLogHandle {
	return auditLog({ use: (...middleware) => bot.use(...middleware), api: env.api }, options);
}

// ── createAuditLogger (pure, no bot) ────────────────────────────────────────────────────────

test("createAuditLogger forwards every event to every sink by default", () => {
	const sink = recordingSink();
	const logger = createAuditLogger({ sinks: [sink] });

	const event: AuditEvent = { kind: "api.call", timestamp: 1, method: "sendMessage", params: {} };
	logger.log(event);

	assert.equal(sink.events.length, 1);
	assert.deepEqual(sink.entries[0], event);
});

test("createAuditLogger drops events the filter rejects", () => {
	const sink = recordingSink();
	const logger = createAuditLogger({
		sinks: [sink],
		filter: (event) => event.kind !== "api.call",
	});

	logger.log({ kind: "api.call", timestamp: 1, method: "sendMessage", params: undefined });
	logger.log({
		kind: "api.result",
		timestamp: 2,
		method: "sendMessage",
		params: undefined,
		result: {},
	});

	assert.equal(sink.events.length, 1);
	assert.equal(sink.events[0]?.kind, "api.result");
});

test("createAuditLogger sample=0 drops, sample=1 keeps", () => {
	const dropped = recordingSink();
	createAuditLogger({ sinks: [dropped], sample: 0 }).log({
		kind: "api.call",
		timestamp: 1,
		method: "sendMessage",
		params: undefined,
	});
	assert.equal(dropped.events.length, 0);

	const kept = recordingSink();
	createAuditLogger({ sinks: [kept], sample: 1 }).log({
		kind: "api.call",
		timestamp: 1,
		method: "sendMessage",
		params: undefined,
	});
	assert.equal(kept.events.length, 1);
});

test("createAuditLogger sample fraction uses the injected random source", () => {
	const sink = recordingSink();
	let nextRandom = 0;
	const logger = createAuditLogger({ sinks: [sink], sample: 0.5, random: () => nextRandom });

	const event: AuditEvent = {
		kind: "api.call",
		timestamp: 1,
		method: "sendMessage",
		params: undefined,
	};

	nextRandom = 0.1; // < 0.5 -> kept
	logger.log(event);
	nextRandom = 0.9; // >= 0.5 -> dropped
	logger.log(event);

	assert.equal(sink.events.length, 1);
});

test("createAuditLogger sample can vary per event via a function", () => {
	const sink = recordingSink();
	const logger = createAuditLogger({
		sinks: [sink],
		sample: (event) => (event.kind === "api.error" ? 1 : 0),
	});

	logger.log({ kind: "api.call", timestamp: 1, method: "sendMessage", params: undefined });
	logger.log({
		kind: "api.error",
		timestamp: 2,
		method: "sendMessage",
		params: undefined,
		error: new Error("boom"),
		attempt: 1,
	});

	assert.equal(sink.events.length, 1);
	assert.equal(sink.events[0]?.kind, "api.error");
});

test("createAuditLogger reports a throwing or rejecting sink via onSinkError, without throwing itself", async () => {
	const errors: unknown[] = [];
	const throwingSink: AuditSink = {
		write() {
			throw new Error("sync fail");
		},
	};
	const rejectingSink: AuditSink = {
		write() {
			return Promise.reject(new Error("async fail"));
		},
	};

	const logger = createAuditLogger({
		sinks: [throwingSink, rejectingSink],
		onSinkError: (error) => errors.push(error),
	});

	assert.doesNotThrow(() => {
		logger.log({ kind: "api.call", timestamp: 1, method: "sendMessage", params: undefined });
	});

	// let the rejected sink's microtask settle
	await Promise.resolve();
	await Promise.resolve();

	assert.equal(errors.length, 2);
});

test("createAuditLogger.flush awaits every sink's flush", async () => {
	const flushed: string[] = [];
	const a: AuditSink = { write() {}, flush: async () => void flushed.push("a") };
	const b: AuditSink = { write() {}, flush: async () => void flushed.push("b") };

	await createAuditLogger({ sinks: [a, b] }).flush();

	assert.deepEqual(flushed.sort(), ["a", "b"]);
});

// ── formatters ───────────────────────────────────────────────────────────────────────────────

test("jsonFormatter passes the event through unchanged", () => {
	const event: AuditEvent = {
		kind: "api.call",
		timestamp: 1,
		method: "sendMessage",
		params: { text: "hi" },
	};
	assert.equal(jsonFormatter(event), event);
});

test("textFormatter renders a readable line per event kind", () => {
	const at = 1_700_000_000_000;

	assert.match(
		textFormatter({
			kind: "update",
			timestamp: at,
			updateId: 42,
			updateType: "message",
			chatId: 7,
			userId: 9,
			durationMs: 12,
			update: {},
		}),
		/update#42 message chat=7 user=9 \(12ms\)/,
	);

	assert.match(
		textFormatter({
			kind: "api.call",
			timestamp: at,
			method: "sendMessage",
			params: { text: "hi" },
		}),
		/-> sendMessage \{"text":"hi"\}/,
	);

	assert.match(
		textFormatter({
			kind: "api.result",
			timestamp: at,
			method: "sendMessage",
			params: undefined,
			result: {},
		}),
		/<- sendMessage ok/,
	);

	assert.match(
		textFormatter({
			kind: "api.error",
			timestamp: at,
			method: "sendMessage",
			params: undefined,
			error: new Error("nope"),
			attempt: 2,
		}),
		/sendMessage attempt=2 nope/,
	);
});

// ── DEFAULT_EXCLUDED_METHODS ─────────────────────────────────────────────────────────────────

test("DEFAULT_EXCLUDED_METHODS excludes getUpdates", () => {
	assert.deepEqual(DEFAULT_EXCLUDED_METHODS, ["getUpdates"]);
});

// ── auditLog() wired onto a test bot ────────────────────────────────────────────────────────

test("logs an incoming update with duration, chat and user", async () => {
	const sink = recordingSink();
	const bot = new Composer<Context>();
	const env = createTestEnv(bot);
	attachAuditLog(bot, env, { sinks: [sink] });
	bot.on("message", (ctx) => ctx.reply("hi"));

	await env.createUser({ firstName: "Linia" }).sendMessage("hello");

	const updateEvents = sink.events.filter(
		(event): event is Extract<AuditEvent, { kind: "update" }> => event.kind === "update",
	);
	assert.equal(updateEvents.length, 1);
	const [event] = updateEvents;
	assert.equal(event?.updateType, "message");
	assert.equal(typeof event?.chatId, "number");
	assert.equal(typeof event?.userId, "number");
	assert.equal(typeof event?.durationMs, "number");
	assert.ok(event && event.durationMs >= 0);
	assert.equal(event?.error, undefined);
});

test("a throwing handler still emits the update event, with error set, and the error still propagates", async () => {
	const sink = recordingSink();
	const bot = new Composer<Context>();
	const env = createTestEnv(bot);
	attachAuditLog(bot, env, { sinks: [sink] });
	bot.on("message", () => {
		throw new Error("handler exploded");
	});

	await assert.rejects(env.createUser().sendMessage("hello"), /handler exploded/);

	const [event] = sink.events;
	assert.equal(event?.kind, "update");
	assert.ok(event?.kind === "update" && event.error instanceof Error);
});

test("logs outgoing api calls and their results", async () => {
	const sink = recordingSink();
	const bot = new Composer<Context>();
	const env = createTestEnv(bot);
	attachAuditLog(bot, env, { sinks: [sink] });
	bot.on("message", (ctx) => ctx.reply("hi"));

	await env.createUser().sendMessage("hello");

	const call = sink.events.find(
		(event) => event.kind === "api.call" && event.method === "sendMessage",
	);
	const result = sink.events.find(
		(event) => event.kind === "api.result" && event.method === "sendMessage",
	);
	assert.ok(call, "expected an api.call event for sendMessage");
	assert.ok(result, "expected an api.result event for sendMessage");
});

test("logs outgoing api errors", async () => {
	const sink = recordingSink();
	const bot = new Composer<Context>();
	const env = createTestEnv(bot);
	attachAuditLog(bot, env, { sinks: [sink] });
	bot.on("message", (ctx) => ctx.reply("hi"));
	env.onApi("sendMessage", apiError(429, "Too Many Requests", { retry_after: 1 }), { times: 1 });

	await assert.rejects(env.createUser().sendMessage("hello"));

	const errorEvent = sink.events.find((event) => event.kind === "api.error");
	assert.ok(errorEvent);
	assert.ok(errorEvent.kind === "api.error" && errorEvent.method === "sendMessage");
	assert.ok(errorEvent.kind === "api.error" && errorEvent.attempt === 1);
});

test("excluded methods are skipped from api.* logging by default", async () => {
	const sink = recordingSink();
	const bot = new Composer<Context>();
	const env = createTestEnv(bot);
	attachAuditLog(bot, env, { sinks: [sink] });

	await env.api.getUpdates({});

	assert.equal(sink.events.filter((event) => event.kind.startsWith("api.")).length, 0);
});

test("a custom formatter's output — not the raw event — reaches the sink", async () => {
	const sink = recordingSink();
	const bot = new Composer<Context>();
	const env = createTestEnv(bot);
	attachAuditLog(bot, env, { sinks: [sink], formatter: (event) => `custom:${event.kind}` });
	bot.on("message", (ctx) => ctx.reply("hi"));

	await env.createUser().sendMessage("hello");

	assert.ok(sink.entries.includes("custom:update"));
	assert.ok(sink.entries.every((entry) => typeof entry === "string"));
});

test("flush() awaits every sink's flush", async () => {
	let flushed = false;
	const sink: AuditSink = {
		write() {},
		async flush() {
			flushed = true;
		},
	};

	const plugin = auditLog({ sinks: [sink] });
	await plugin.flush();

	assert.equal(flushed, true);
});

test("auditLog(options) returns a plugin function usable via bot.install()-style invocation", () => {
	const events: AuditEvent[] = [];
	const registeredMiddleware: unknown[] = [];
	const fakeBot = {
		use: (...middleware: unknown[]) => registeredMiddleware.push(...middleware),
		api: {
			before(hook: (method: string, params?: Record<string, unknown>) => unknown) {
				void hook("sendMessage", { text: "hi" });
				return fakeBot.api;
			},
			after: () => fakeBot.api,
			onError: () => fakeBot.api,
		},
	};

	const plugin = auditLog({ sinks: [{ write: (_entry, event) => void events.push(event) }] });
	plugin(fakeBot as never);

	assert.equal(registeredMiddleware.length, 1);
	assert.equal(events[0]?.kind, "api.call");
});
