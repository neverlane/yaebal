import assert from "node:assert/strict";
import test from "node:test";
import { Composer, type Context } from "@yaebal/core";
import { apiError, createTestEnv } from "@yaebal/test";
import { autoAnswer } from "./index.js";

// every test that awaits a real (non-virtual-clock) timer gets a generous but bounded timeout —
// a hang here means the plugin never answered, which is exactly the bug this suite guards against.
const T = { timeout: 5_000 };

test(
	"deadline mode (default): answers once the handler chain finishes with time to spare",
	T,
	async () => {
		const bot = new Composer<Context>().install(autoAnswer());
		const env = createTestEnv(bot);

		await env.createUser().click("noop");

		assert.equal(env.callsTo("answerCallbackQuery").length, 1);
	},
);

test("deadline mode: a fast handler's own alert wins, no fallback ack sent", T, async () => {
	const bot = new Composer<Context>()
		.install(autoAnswer())
		.on("callback_query", (ctx) => ctx.answerCallbackQuery({ text: "handled", show_alert: true }));
	const env = createTestEnv(bot);

	await env.createUser().click("noop");

	assert.equal(env.callsTo("answerCallbackQuery").length, 1);
	assert.equal(env.lastApiCall("answerCallbackQuery")?.params?.text, "handled");
});

test(
	"deadline mode: falls back to an empty ack once the timer fires on a handler that never answers",
	T,
	async () => {
		const bot = new Composer<Context>()
			.install(autoAnswer({ timeout: 50 }))
			.on("callback_query", async (_ctx, next) => {
				// slower than the deadline, but still resolves — the timer must not wait for it.
				await new Promise((resolve) => setTimeout(resolve, 200));
				await next();
			});
		const env = createTestEnv(bot);
		env.useFakeTimers();

		const clicked = env.createUser().click("noop");
		await env.advanceTime(50);
		assert.equal(env.callsTo("answerCallbackQuery").length, 1, "fallback fired at the deadline");

		await env.advanceTime(150);
		await clicked;
		assert.equal(
			env.callsTo("answerCallbackQuery").length,
			1,
			"the slow handler's own next() resuming afterward must not trigger a second answer",
		);

		// installTestClock() patches the *global* setTimeout/clearTimeout for the rest of this
		// process — every later test in this file would silently hang on a real setTimeout otherwise.
		env.shutdown();
	},
);

test("deadline mode: a handler that throws still gets its spinner cleared", T, async () => {
	const bot = new Composer<Context>()
		.install(autoAnswer({ timeout: 50 }))
		.on("callback_query", () => {
			throw new Error("handler boom");
		});
	const env = createTestEnv(bot);

	await assert.rejects(env.createUser().click("noop"), /handler boom/);
	assert.equal(env.callsTo("answerCallbackQuery").length, 1);
});

test("deferred mode: a handler's own answer wins, no double-answer", T, async () => {
	const bot = new Composer<Context>()
		.install(autoAnswer({ mode: "deferred" }))
		.on("callback_query", (ctx) => ctx.answerCallbackQuery({ text: "handled" }));
	const env = createTestEnv(bot);

	await env.createUser().click("noop");

	assert.equal(env.callsTo("answerCallbackQuery").length, 1);
	assert.equal(env.lastApiCall("answerCallbackQuery")?.params?.text, "handled");
});

test("deferred mode: falls back to auto-answer when the handler forgets", T, async () => {
	const bot = new Composer<Context>()
		.install(autoAnswer({ mode: "deferred" }))
		.on("callback_query", (_ctx, next) => next());
	const env = createTestEnv(bot);

	await env.createUser().click("noop");

	assert.equal(env.callsTo("answerCallbackQuery").length, 1);
});

test(
	"deferred mode: a handler that throws still gets its spinner cleared, and the error still propagates",
	T,
	async () => {
		const bot = new Composer<Context>()
			.install(autoAnswer({ mode: "deferred" }))
			.on("callback_query", () => {
				throw new Error("handler boom");
			});
		const env = createTestEnv(bot);

		await assert.rejects(env.createUser().click("noop"), /handler boom/);
		assert.equal(env.callsTo("answerCallbackQuery").length, 1);
	},
);

test(
	"immediate mode: answers the moment the callback query arrives, with no handler at all",
	T,
	async () => {
		const bot = new Composer<Context>().install(autoAnswer({ mode: "immediate" }));
		const env = createTestEnv(bot);

		await env.createUser().click("noop");

		assert.equal(env.callsTo("answerCallbackQuery").length, 1);
	},
);

test("immediate mode: fires before the handler runs", T, async () => {
	const order: string[] = [];
	const bot = new Composer<Context>()
		.install(autoAnswer({ mode: "immediate" }))
		.on("callback_query", (_ctx, next) => {
			order.push("handler-start");
			return next();
		});
	const env = createTestEnv(bot);
	env.hooks.before.push((method) => {
		if (method === "answerCallbackQuery") order.push("answered");
	});

	await env.createUser().click("noop");

	assert.deepEqual(order, ["answered", "handler-start"]);
});

test(
	"immediate mode: a handler's own alert is skipped and never reaches the api — the known trade-off of this mode",
	T,
	async () => {
		const bot = new Composer<Context>()
			.install(autoAnswer({ mode: "immediate" }))
			.on("callback_query", (ctx) =>
				ctx.answerCallbackQuery({ text: "handled", show_alert: true }),
			);
		const env = createTestEnv(bot);

		await env.createUser().click("noop");

		// the plugin's own empty ack wins the race; the handler's manual call is dropped by the
		// dispatch-time tracker instead of reaching the api and failing against telegram.
		assert.equal(env.callsTo("answerCallbackQuery").length, 1);
		assert.equal(env.lastApiCall("answerCallbackQuery")?.params?.text, undefined);
	},
);

test("filter skips auto-answering for matching updates", T, async () => {
	const bot = new Composer<Context>().install(
		autoAnswer({ filter: (ctx) => ctx.callbackQuery.data !== "skip" }),
	);
	const env = createTestEnv(bot);

	await env.createUser().click("skip");
	assert.equal(env.callsTo("answerCallbackQuery").length, 0);

	await env.createUser().click("go");
	assert.equal(env.callsTo("answerCallbackQuery").length, 1);
});

test("static params are forwarded to answerCallbackQuery", T, async () => {
	const bot = new Composer<Context>().install(
		autoAnswer({
			params: { text: "done", showAlert: true, url: "https://example.invalid", cacheTime: 30 },
		}),
	);
	const env = createTestEnv(bot);

	await env.createUser().click("noop");

	const params = env.lastApiCall("answerCallbackQuery")?.params;
	assert.equal(typeof params?.callback_query_id, "string");
	assert.equal(params?.text, "done");
	assert.equal(params?.show_alert, true);
	assert.equal(params?.url, "https://example.invalid");
	assert.equal(params?.cache_time, 30);
});

test("params can be computed per update, sync or async", T, async () => {
	const bot = new Composer<Context>().install(
		autoAnswer({ params: async (ctx) => ({ text: `got:${ctx.callbackQuery.data}` }) }),
	);
	const env = createTestEnv(bot);

	await env.createUser().click("hello");

	assert.equal(env.lastApiCall("answerCallbackQuery")?.params?.text, "got:hello");
});

test("async params racing a manual answer: no double-answer, no spurious onError", T, async () => {
	const errors: unknown[] = [];
	const bot = new Composer<Context>()
		.install(
			autoAnswer({
				params: async () => {
					await new Promise((resolve) => setTimeout(resolve, 10));
					return { text: "auto" };
				},
				onError: (error) => errors.push(error),
			}),
		)
		.on("callback_query", (ctx) => ctx.answerCallbackQuery({ text: "manual" }));
	const env = createTestEnv(bot);

	await env.createUser().click("noop");
	await new Promise((resolve) => setTimeout(resolve, 20));

	assert.equal(env.callsTo("answerCallbackQuery").length, 1);
	assert.equal(env.lastApiCall("answerCallbackQuery")?.params?.text, "manual");
	assert.deepEqual(errors, []);
});

test("skipAutoAnswer() opts a specific update out, even with no filter configured", T, async () => {
	const bot = new Composer<Context>().install(autoAnswer()).on("callback_query", (ctx) => {
		ctx.skipAutoAnswer();
	});
	const env = createTestEnv(bot);

	await env.createUser().click("noop");

	assert.equal(env.callsTo("answerCallbackQuery").length, 0);
});

test(
	"a manual answer via a raw ctx.api.call (bypassing ctx.answerCallbackQuery entirely) still dedupes",
	T,
	async () => {
		const bot = new Composer<Context>()
			.install(autoAnswer({ mode: "deferred" }))
			.on("callback_query", (ctx) =>
				ctx.api.call("answerCallbackQuery", {
					callback_query_id: ctx.callbackQuery.id,
					text: "bypassed the wrapper",
				}),
			);
		const env = createTestEnv(bot);

		await env.createUser().click("noop");

		assert.equal(env.callsTo("answerCallbackQuery").length, 1);
		assert.equal(env.lastApiCall("answerCallbackQuery")?.params?.text, "bypassed the wrapper");
	},
);

test("onAnswer observes a successful auto-answer", T, async () => {
	const seen: (string | undefined)[] = [];
	const bot = new Composer<Context>().install(
		autoAnswer({ onAnswer: (ctx) => seen.push(ctx.callbackQuery.data) }),
	);
	const env = createTestEnv(bot);

	await env.createUser().click("pressed");

	assert.deepEqual(seen, ["pressed"]);
});

test("a failed auto-answer never throws — onError observes it instead", T, async () => {
	const errors: unknown[] = [];
	const bot = new Composer<Context>().install(
		autoAnswer({ onError: (error) => errors.push(error) }),
	);
	const env = createTestEnv(bot);
	env.onApi("answerCallbackQuery", apiError(400, "Bad Request: query is too old"));

	await env.createUser().click("noop");

	assert.equal(errors.length, 1);
});

test("a throwing filter never crashes the chain — onError observes it instead", T, async () => {
	const errors: unknown[] = [];
	const bot = new Composer<Context>().install(
		autoAnswer({
			filter: () => {
				throw new Error("filter boom");
			},
			onError: (error) => errors.push(error),
		}),
	);
	const env = createTestEnv(bot);

	await env.createUser().click("noop");

	assert.equal(errors.length, 1);
	assert.equal(env.callsTo("answerCallbackQuery").length, 0);
});

test("a throwing onError never crashes the chain", T, async () => {
	const bot = new Composer<Context>().install(
		autoAnswer({
			onError: () => {
				throw new Error("onError boom");
			},
		}),
	);
	const env = createTestEnv(bot);
	env.onApi("answerCallbackQuery", apiError(400, "Bad Request: query is too old"));

	await env.createUser().click("noop");
	// reaching here (with no unhandled rejection / test crash) is the assertion.
});

test(
	"a throwing onAnswer never crashes the chain and doesn't get reported as a failure",
	T,
	async () => {
		const errors: unknown[] = [];
		const bot = new Composer<Context>().install(
			autoAnswer({
				onAnswer: () => {
					throw new Error("onAnswer boom");
				},
				onError: (error) => errors.push(error),
			}),
		);
		const env = createTestEnv(bot);

		await env.createUser().click("noop");

		assert.equal(env.callsTo("answerCallbackQuery").length, 1);
		assert.deepEqual(errors, []);
	},
);
