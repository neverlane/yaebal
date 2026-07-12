import assert from "node:assert/strict";
import test from "node:test";
import { Composer, type Context, type Middleware } from "@yaebal/core";
import { apiError, createTestEnv, type TestEnv } from "@yaebal/test";
import {
	type AuditEvent,
	type AuditLogHandle,
	type AuditLogOptions,
	type AuditSink,
	auditLog,
	DEFAULT_EXCLUDED_METHODS,
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
 * (never a real `Bot.api`) — so hooks must be attached to `env.api`, not `bot`.
 */
function attachAuditLog(
	bot: Composer<Context>,
	env: TestEnv<Context>,
	options: AuditLogOptions,
): AuditLogHandle {
	return auditLog({ use: (...middleware) => bot.use(...middleware), api: env.api }, options);
}

function updateEvents(sink: ReturnType<typeof recordingSink>) {
	return sink.events.filter(
		(event): event is Extract<AuditEvent, { kind: "update" }> => event.kind === "update",
	);
}

// ── updates ──────────────────────────────────────────────────────────────────────────────────

test("logs an incoming update with duration, chat, user and a correlationId", async () => {
	const sink = recordingSink();
	const bot = new Composer<Context>();
	const env = createTestEnv(bot);
	attachAuditLog(bot, env, { sinks: [sink] });
	bot.on("message", (ctx) => ctx.reply("hi"));

	await env.createUser({ firstName: "Linia" }).sendMessage("hello");

	const [event] = updateEvents(sink);
	assert.equal(event?.updateType, "message");
	assert.equal(typeof event?.chatId, "number");
	assert.equal(typeof event?.userId, "number");
	assert.equal(typeof event?.durationMs, "number");
	assert.ok(event && event.durationMs >= 0);
	assert.equal(event?.error, undefined);
	assert.equal(event?.level, "info");
	assert.ok(event?.correlationId && event.correlationId.length > 0);
});

test("a throwing handler still emits the update event, with a serialized error, and the error still propagates", async () => {
	const sink = recordingSink();
	const bot = new Composer<Context>();
	const env = createTestEnv(bot);
	attachAuditLog(bot, env, { sinks: [sink] });
	bot.on("message", () => {
		throw new Error("handler exploded");
	});

	await assert.rejects(env.createUser().sendMessage("hello"), /handler exploded/);

	const [event] = updateEvents(sink);
	assert.equal(event?.level, "error");
	assert.equal(event?.error?.name, "Error");
	assert.equal(event?.error?.message, "handler exploded");
});

test("logUpdates: false skips update events entirely, api events still logged", async () => {
	const sink = recordingSink();
	const bot = new Composer<Context>();
	const env = createTestEnv(bot);
	attachAuditLog(bot, env, { sinks: [sink], logUpdates: false });
	bot.on("message", (ctx) => ctx.reply("hi"));

	await env.createUser().sendMessage("hello");

	assert.equal(updateEvents(sink).length, 0);
	assert.ok(sink.events.some((e) => e.kind === "api.call"));
});

// ── outgoing api calls ──────────────────────────────────────────────────────────────────────

test("logs outgoing api calls and results, with a matching callId, attempt=1 and durationMs", async () => {
	const sink = recordingSink();
	const bot = new Composer<Context>();
	const env = createTestEnv(bot);
	attachAuditLog(bot, env, { sinks: [sink] });
	bot.on("message", (ctx) => ctx.reply("hi"));

	await env.createUser().sendMessage("hello");

	const call = sink.events.find(
		(e): e is Extract<AuditEvent, { kind: "api.call" }> =>
			e.kind === "api.call" && e.method === "sendMessage",
	);
	const result = sink.events.find(
		(e): e is Extract<AuditEvent, { kind: "api.result" }> =>
			e.kind === "api.result" && e.method === "sendMessage",
	);

	assert.ok(call, "expected an api.call event for sendMessage");
	assert.ok(result, "expected an api.result event for sendMessage");
	assert.equal(call?.attempt, 1);
	assert.equal(call?.callId, result?.callId);
	assert.equal(typeof result?.durationMs, "number");
});

test("logs outgoing api errors with the method, attempt and a serialized error", async () => {
	const sink = recordingSink();
	const bot = new Composer<Context>();
	const env = createTestEnv(bot);
	attachAuditLog(bot, env, { sinks: [sink] });
	bot.on("message", (ctx) => ctx.reply("hi"));
	env.onApi("sendMessage", apiError(429, "Too Many Requests", { retry_after: 1 }), { times: 1 });

	await assert.rejects(env.createUser().sendMessage("hello"));

	const errorEvent = sink.events.find(
		(e): e is Extract<AuditEvent, { kind: "api.error" }> => e.kind === "api.error",
	);
	assert.ok(errorEvent);
	assert.equal(errorEvent.method, "sendMessage");
	assert.equal(errorEvent.attempt, 1);
	assert.equal(errorEvent.error.code, 429);
	assert.equal(errorEvent.error.description, "Too Many Requests");
	assert.equal(errorEvent.level, "error");
});

test("logApiCalls/logApiResults/logApiErrors toggles are independent", async () => {
	const sink = recordingSink();
	const bot = new Composer<Context>();
	const env = createTestEnv(bot);
	attachAuditLog(bot, env, {
		sinks: [sink],
		logApiCalls: false,
		logApiErrors: false,
	});
	bot.on("message", (ctx) => ctx.reply("hi"));

	await env.createUser().sendMessage("hello");

	assert.equal(sink.events.filter((e) => e.kind === "api.call").length, 0);
	assert.ok(sink.events.some((e) => e.kind === "api.result"));
});

// ── excluded / included methods ─────────────────────────────────────────────────────────────

test("excluded methods are skipped from api.* logging by default", async () => {
	const sink = recordingSink();
	const bot = new Composer<Context>();
	const env = createTestEnv(bot);
	attachAuditLog(bot, env, { sinks: [sink] });

	await env.api.getUpdates({});

	assert.equal(sink.events.filter((event) => event.kind.startsWith("api.")).length, 0);
});

test("DEFAULT_EXCLUDED_METHODS excludes getUpdates", () => {
	assert.deepEqual(DEFAULT_EXCLUDED_METHODS, ["getUpdates"]);
});

test("excludedMethods supports a trailing-* prefix pattern", async () => {
	const sink = recordingSink();
	const bot = new Composer<Context>();
	const env = createTestEnv(bot);
	attachAuditLog(bot, env, { sinks: [sink], excludedMethods: ["send*"] });
	bot.on("message", (ctx) => ctx.reply("hi"));

	await env.createUser().sendMessage("hello");

	assert.equal(
		sink.events.filter((e) => e.kind === "api.call" && e.method === "sendMessage").length,
		0,
	);
});

test("includeMethods restricts logging to an allowlist, prefix syntax included", async () => {
	const sink = recordingSink();
	const bot = new Composer<Context>();
	const env = createTestEnv(bot);
	attachAuditLog(bot, env, { sinks: [sink], includeMethods: ["send*"] });
	bot.on("message", async (ctx) => {
		await ctx.reply("hi");
		await ctx.api.getMe();
	});

	await env.createUser().sendMessage("hello");

	const methods = new Set(sink.events.filter((e) => e.kind === "api.call").map((e) => e.method));
	assert.ok(methods.has("sendMessage"));
	assert.ok(!methods.has("getMe"));
});

// ── correlation ──────────────────────────────────────────────────────────────────────────────

test("api.* events fired inside a handler carry the same updateId/correlationId/chatId/userId as the update event", async () => {
	const sink = recordingSink();
	const bot = new Composer<Context>();
	const env = createTestEnv(bot);
	attachAuditLog(bot, env, { sinks: [sink] });
	bot.on("message", (ctx) => ctx.reply("hi"));

	await env.createUser().sendMessage("hello");

	const [update] = updateEvents(sink);
	const call = sink.events.find(
		(e): e is Extract<AuditEvent, { kind: "api.call" }> =>
			e.kind === "api.call" && e.method === "sendMessage",
	);

	assert.ok(update && call);
	assert.equal(call.updateId, update.updateId);
	assert.equal(call.correlationId, update.correlationId);
	assert.equal(call.chatId, update.chatId);
	assert.equal(call.userId, update.userId);
});

test("an api call made outside update handling carries no correlation", async () => {
	const sink = recordingSink();
	const bot = new Composer<Context>();
	const env = createTestEnv(bot);
	attachAuditLog(bot, env, { sinks: [sink] });

	await env.api.sendMessage({ chat_id: 1, text: "standalone" });

	const call = sink.events.find(
		(e): e is Extract<AuditEvent, { kind: "api.call" }> => e.kind === "api.call",
	);
	assert.ok(call);
	assert.equal(call.updateId, undefined);
	assert.equal(call.correlationId, undefined);
});

test("correlate: false turns correlation off — api events carry no updateId/correlationId even inside a handler", async () => {
	const sink = recordingSink();
	const bot = new Composer<Context>();
	const env = createTestEnv(bot);
	attachAuditLog(bot, env, { sinks: [sink], correlate: false });
	bot.on("message", (ctx) => ctx.reply("hi"));

	await env.createUser().sendMessage("hello");

	const call = sink.events.find(
		(e): e is Extract<AuditEvent, { kind: "api.call" }> => e.kind === "api.call",
	);
	assert.ok(call);
	assert.equal(call.updateId, undefined);
});

// ── formatter / flush / stats through the installed plugin ─────────────────────────────────

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

test("stats() reports live counters through the installed plugin", async () => {
	const bot = new Composer<Context>();
	const env = createTestEnv(bot);
	const handle = attachAuditLog(bot, env, { sinks: [{ write() {} }] });
	bot.on("message", (ctx) => ctx.reply("hi"));

	await env.createUser().sendMessage("hello");

	assert.ok(handle.stats().received > 0);
});

// ── plugin form (bot.install()-style invocation, no real Bot needed) ───────────────────────

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

test("installing the same plugin instance twice throws instead of silently double-logging", () => {
	const plugin = auditLog({ sinks: [{ write() {} }] });
	const bot = new Composer<Context>();
	const env = createTestEnv(bot);

	plugin({ use: (...mw: Middleware<Context>[]) => bot.use(...mw), api: env.api } as never);
	assert.throws(
		() => plugin({ use: (...mw: Middleware<Context>[]) => bot.use(...mw), api: env.api } as never),
		/already installed/,
	);
});

// ── lifecycle (onStart/onStop, feature-detected) ────────────────────────────────────────────

function fakeLifecycleTarget(env: TestEnv<Context>, bot: Composer<Context>) {
	const starters: Array<(info: unknown) => unknown> = [];
	const stoppers: Array<() => unknown> = [];
	const target = {
		use: (...mw: Middleware<Context>[]) => bot.use(...mw),
		api: env.api,
		onStart: (h: (info: unknown) => unknown) => starters.push(h),
		onStop: (h: () => unknown) => stoppers.push(h),
	};
	return { target, starters, stoppers };
}

test("logs bot.start/bot.stop when the install target exposes onStart/onStop", async () => {
	const sink = recordingSink();
	const bot = new Composer<Context>();
	const env = createTestEnv(bot);
	const { target, starters, stoppers } = fakeLifecycleTarget(env, bot);

	auditLog(target as never, { sinks: [sink] });

	await starters[0]?.({ id: 1, is_bot: true, first_name: "bot" });
	await stoppers[0]?.();

	assert.ok(sink.events.some((e) => e.kind === "bot.start"));
	assert.ok(sink.events.some((e) => e.kind === "bot.stop"));
});

test("autoFlush runs flush() automatically on onStop", async () => {
	let flushed = false;
	const sink: AuditSink = {
		write() {},
		flush: async () => {
			flushed = true;
		},
	};
	const bot = new Composer<Context>();
	const env = createTestEnv(bot);
	const { target, stoppers } = fakeLifecycleTarget(env, bot);

	auditLog(target as never, { sinks: [sink] });

	await stoppers[0]?.();

	assert.equal(flushed, true);
});

test("autoFlush: false skips the automatic flush on onStop", async () => {
	let flushed = false;
	const sink: AuditSink = {
		write() {},
		flush: async () => {
			flushed = true;
		},
	};
	const bot = new Composer<Context>();
	const env = createTestEnv(bot);
	const { target, stoppers } = fakeLifecycleTarget(env, bot);

	auditLog(target as never, { sinks: [sink], autoFlush: false });

	await stoppers[0]?.();

	assert.equal(flushed, false);
});

test("logLifecycle: false skips bot.start/bot.stop events but autoFlush still runs", async () => {
	let flushed = false;
	const sink: AuditSink = {
		write() {},
		flush: async () => {
			flushed = true;
		},
	};
	const bot = new Composer<Context>();
	const env = createTestEnv(bot);
	const { target, starters, stoppers } = fakeLifecycleTarget(env, bot);

	auditLog(target as never, { sinks: [sink], logLifecycle: false });

	await starters[0]?.({ id: 1 });
	await stoppers[0]?.();

	assert.equal(flushed, true);
});

test("a direct-install target with no onStart/onStop (a bare {use, api} pair) never throws", async () => {
	const bot = new Composer<Context>();
	const env = createTestEnv(bot);
	assert.doesNotThrow(() => attachAuditLog(bot, env, { sinks: [{ write() {} }] }));
});
