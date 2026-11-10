import assert from "node:assert/strict";
import test from "node:test";
import { callbackData, field } from "@yaebal/callback-data";
import { Composer, type Context } from "@yaebal/core";
import { createTestEnv } from "@yaebal/test";
import { WidgetError } from "./limits.js";
import { TRACKER_CAP, targetOf, targetParams, widgets } from "./plugin.js";
import { widgetState } from "./state.js";

const vote = callbackData("vote", { option: field.enum(["yes", "no"]) });
const votes = widgetState<{ yes: number; no: number }>({ revision: true });

test("bot.widgetQuery + ctx.widget: decode the payload, edit state, answer with json", async () => {
	const tally = { yes: 0, no: 0 };
	const bot = new Composer<Context>().install(widgets()).widgetQuery(vote, async (ctx) => {
		tally[ctx.queryData.option]++;
		assert.equal(ctx.widget.kind, "data");
		assert.equal(ctx.widget.isShared, false);
		assert.equal(ctx.widget.isForward, false);
		assert.equal(ctx.widget.isInline, false);
		await ctx.widget.setData({ publicData: votes.encode(tally) });
		await ctx.widget.answer(tally);
	});
	const env = createTestEnv(bot);
	const user = env.createUser();

	const query = await user.queryWidget(vote.pack({ option: "yes" }));
	assert.deepEqual(env.widgetAnswer(query.id), { data: '{"yes":1,"no":0}' });

	const edit = env.lastApiCall("editMessageWidgetData")?.params;
	assert.equal(edit?.chat_id, user.id);
	assert.equal(edit?.message_id, query.message_id);
	assert.deepEqual(votes.decode(edit?.public_data as string), { yes: 1, no: 0 });
	assert.equal(env.callsTo("answerWidgetQuery").length, 1); // no auto-answer on top
});

test("an unanswered query is auto-answered with no data once the chain finishes", async () => {
	const bot = new Composer<Context>().install(widgets()).widgetQuery("noop", () => {});
	const env = createTestEnv(bot);
	const query = await env.createUser().queryWidget("noop");
	assert.deepEqual(env.widgetAnswer(query.id), { data: undefined });
	assert.deepEqual(env.lastApiCall("answerWidgetQuery")?.params, { widget_query_id: query.id });
});

test("no auto-answer when disabled, skipped, on non-widget updates, or when the chain throws", async () => {
	const off = createTestEnv(new Composer<Context>().install(widgets({ autoAnswer: false })));
	await off.createUser().queryWidget("x");
	assert.equal(off.callsTo("answerWidgetQuery").length, 0);

	const skipped = createTestEnv(
		new Composer<Context>()
			.install(widgets())
			.widgetQuery("later", (ctx) => ctx.widget.skipAutoAnswer()),
	);
	await skipped.createUser().queryWidget("later");
	assert.equal(skipped.callsTo("answerWidgetQuery").length, 0);

	const plain = createTestEnv(
		new Composer<Context>().install(widgets()).on("message", (ctx) => {
			assert.equal(ctx.widget.query, undefined);
			assert.equal(ctx.widget.kind, undefined);
			assert.equal(ctx.widget.answered, false);
			assert.equal(ctx.widget.target, undefined);
			assert.throws(
				() => ctx.widget.answer(),
				(e: unknown) => e instanceof WidgetError && e.code === "WIDGET_NOT_A_QUERY",
			);
			assert.throws(() => ctx.widget.answerRaw("x"), /needs a widget_query/);
			assert.throws(
				() => ctx.widget.setData({ publicData: "x" }),
				(e: unknown) => e instanceof WidgetError && e.code === "WIDGET_NO_TARGET",
			);
			assert.throws(() => ctx.widget.setSharedData("x"), /pass widgetId/);
		}),
	);
	await plain.createUser().sendMessage("hi");
	assert.equal(plain.callsTo("answerWidgetQuery").length, 0);

	const throwing = createTestEnv(
		new Composer<Context>().install(widgets()).widgetQuery("boom", () => {
			throw new Error("boom");
		}),
	);
	await assert.rejects(throwing.createUser().queryWidget("boom"), /boom/);
	assert.equal(throwing.callsTo("answerWidgetQuery").length, 0);
});

test("answers are sent once: a second answer, or one after a raw api call, is a no-op", async () => {
	const results: boolean[] = [];
	const bot = new Composer<Context>()
		.install(widgets())
		.widgetQuery("twice", async (ctx) => {
			results.push(await ctx.widget.answerRaw("first"));
			results.push(await ctx.widget.answer("second"));
			assert.equal(ctx.widget.answered, true);
		})
		.widgetQuery("raw", async (ctx) => {
			await ctx.api.answerWidgetQuery({
				widget_query_id: (ctx.widgetQuery as { id: string }).id,
				data: "raw",
			});
		});
	const env = createTestEnv(bot);
	const user = env.createUser();

	const q1 = await user.queryWidget("twice");
	assert.deepEqual(results, [true, false]);
	assert.deepEqual(env.widgetAnswer(q1.id), { data: "first" });

	await user.queryWidget("raw");
	assert.equal(env.callsTo("answerWidgetQuery").length, 2); // the raw one; no auto-answer after it
});

test("answer values are json-encoded and size-checked", async () => {
	const bot = new Composer<Context>()
		.install(widgets())
		.widgetQuery("null", (ctx) => ctx.widget.answer(null))
		.widgetQuery("big", (ctx) => {
			assert.throws(
				() => ctx.widget.answer("x".repeat(2000)),
				(e: unknown) => e instanceof WidgetError && e.code === "WIDGET_RESULT_TOO_LARGE",
			);
			return ctx.widget.answer(() => {});
		});
	const env = createTestEnv(bot);
	const user = env.createUser();
	assert.deepEqual(env.widgetAnswer((await user.queryWidget("null")).id), { data: "null" });
	// a value JSON can't represent (a function) is sent as "null"
	assert.deepEqual(env.widgetAnswer((await user.queryWidget("big")).id), { data: "null" });
});

test("shared widgets: setSharedData edits by widget_id, forwards have no message to edit", async () => {
	const seen: unknown[] = [];
	const bot = new Composer<Context>().install(widgets()).widgetQuery("tap", async (ctx) => {
		seen.push([ctx.widget.isShared, ctx.widget.isForward, ctx.widget.widgetId, ctx.widget.target]);
		await ctx.widget.setSharedData(votes.encode({ yes: 1, no: 0 }), { cacheTime: 10 });
		if (ctx.widget.isForward) {
			assert.throws(() => ctx.widget.setData({ publicData: "x" }), /pass a target/);
			await ctx.widget.setData({ chatData: null }, { chatId: 5, messageId: 6 });
		}
	});
	const env = createTestEnv(bot);
	const user = env.createUser();

	await user.queryWidget("tap", { widgetId: "sw" });
	await user.querySharedWidget("sw", "tap");
	assert.deepEqual(seen, [
		[true, false, "sw", { chatId: user.id, messageId: 1 }],
		[true, true, "sw", undefined],
	]);
	const shared = env.callsTo("editSharedWidgetData");
	assert.equal(shared.length, 2);
	assert.equal(shared[0]?.params?.widget_id, "sw");
	assert.equal(shared[0]?.params?.cache_time, 10);
	assert.deepEqual(env.lastApiCall("editMessageWidgetData")?.params, {
		chat_id: 5,
		message_id: 6,
		chat_data: "",
	});
});

test("setSharedData with an explicit widgetId, a cleared value, and a bad cache time", async () => {
	const bot = new Composer<Context>().install(widgets()).widgetQuery("go", async (ctx) => {
		assert.throws(
			() => ctx.widget.setSharedData("x", { cacheTime: 1, widgetId: "w" }),
			/cache_time/,
		);
		await ctx.widget.setSharedData(null, { widgetId: "other" });
	});
	const env = createTestEnv(bot);
	await env.createUser().queryWidget("go");
	assert.deepEqual(env.lastApiCall("editSharedWidgetData")?.params, {
		widget_id: "other",
		public_data: "",
	});
});

test("inline widgets are edited by inline_message_id", async () => {
	const bot = new Composer<Context>().install(widgets()).widgetQuery("i", async (ctx) => {
		assert.equal(ctx.widget.isInline, true);
		await ctx.widget.setData({ publicData: "p", chatData: "c" });
	});
	const env = createTestEnv(bot);
	await env.createUser().queryWidget("i", { inlineMessageId: "inl", chatType: "group" });
	assert.deepEqual(env.lastApiCall("editMessageWidgetData")?.params, {
		inline_message_id: "inl",
		public_data: "p",
		chat_data: "c",
	});
});

test("wallet queries expose the wallet, card, msg_hash and sign_data", async () => {
	const wallet = { address: "EQw", amount: "100", public_key: "ab" };
	const card = { address: "EQc", nfts: [] } as never;
	const seen: unknown[] = [];
	const bot = new Composer<Context>().install(widgets()).widgetQuery(/^pay/, (ctx) => {
		const w = ctx.widget;
		seen.push({
			kind: w.kind,
			wallet: w.wallet,
			card: w.walletCard,
			hash: w.msgHash,
			sign: w.signData,
		});
	});
	const env = createTestEnv(bot);
	const user = env.createUser();
	await user.queryWidget("pay:1", { type: { type: "data", wallet_card: card } });
	await user.queryWidget("pay:2", { type: { type: "sent_transaction", wallet, msg_hash: "h" } });
	await user.queryWidget("pay:3", { type: { type: "sign_data", wallet, sign_data: '{"s":1}' } });
	assert.deepEqual(seen, [
		{ kind: "data", wallet: undefined, card, hash: undefined, sign: undefined },
		{ kind: "sent_transaction", wallet, card: undefined, hash: "h", sign: undefined },
		{ kind: "sign_data", wallet, card: undefined, hash: undefined, sign: '{"s":1}' },
	]);
});

test("a failing auto-answer is reported to onError and swallowed, even if onError throws", async () => {
	const errors: unknown[] = [];
	const make = (onError: (e: unknown) => void) => {
		const env = createTestEnv(new Composer<Context>().install(widgets({ onError })));
		env.onApi("answerWidgetQuery", () => {
			throw new Error("query is too old");
		});
		return env;
	};
	await make((e) => errors.push(e))
		.createUser()
		.queryWidget("x");
	assert.match(String(errors[0]), /too old/);
	await make(() => {
		throw new Error("observer broke");
	})
		.createUser()
		.queryWidget("x");
	const silent = createTestEnv(new Composer<Context>().install(widgets()));
	silent.onApi("answerWidgetQuery", () => {
		throw new Error("x");
	});
	await silent.createUser().queryWidget("x");
});

test("the guard rejects oversized payloads locally; guard: false leaves the api alone", async () => {
	const guarded = createTestEnv(
		new Composer<Context>().install(widgets()).widgetQuery("big", async (ctx) => {
			await assert.rejects(
				ctx.api.editMessageWidgetData({ chat_id: 1, message_id: 1, public_data: "x".repeat(2000) }),
				(e: unknown) => e instanceof WidgetError && e.code === "INPUT_MEDIA_WIDGET_DATA_TOO_LARGE",
			);
		}),
	);
	await guarded.createUser().queryWidget("big");
	assert.equal(guarded.callsTo("editMessageWidgetData").length, 0);

	const unguarded = createTestEnv(
		new Composer<Context>().install(widgets({ guard: false })).widgetQuery("big", async (ctx) => {
			await ctx.api.editMessageWidgetData({
				chat_id: 1,
				message_id: 1,
				public_data: "x".repeat(2000),
			});
		}),
	);
	await unguarded.createUser().queryWidget("big");
	assert.equal(unguarded.callsTo("editMessageWidgetData").length, 1);
});

test("the answered-id tracker is bounded: the oldest ids are forgotten", async () => {
	const seen: boolean[] = [];
	const bot = new Composer<Context>()
		.install(widgets({ autoAnswer: false }))
		.widgetQuery("replay", (ctx) => {
			seen.push(ctx.widget.answered);
		})
		.widgetQuery(/^q/, (ctx) => ctx.widget.answerRaw());
	const env = createTestEnv(bot);
	const user = env.createUser();
	const first = await user.queryWidget("q0");
	const second = await user.queryWidget("q1");
	for (let i = 2; i <= TRACKER_CAP; i++) await user.queryWidget(`q${i}`);
	assert.equal(env.callsTo("answerWidgetQuery").length, TRACKER_CAP + 1);

	const replay = (id: string) =>
		env.dispatch({ update_id: 1, widget_query: { ...first, id, data: "replay" } });
	await replay(first.id); // evicted: no longer known as answered
	await replay(second.id); // still tracked
	assert.deepEqual(seen, [false, true]);
});

test("targetOf / targetParams", () => {
	const from = { id: 1, is_bot: false, first_name: "u" };
	const base = { id: "q", from, chat_instance: "c", type: { type: "data" as const }, data: "d" };
	assert.equal(targetOf(undefined), undefined);
	assert.equal(targetOf({ ...base }), undefined);
	assert.equal(targetOf({ ...base, chat: { id: 1, type: "private" } }), undefined);
	assert.deepEqual(targetOf({ ...base, chat: { id: 1, type: "private" }, message_id: 2 }), {
		chatId: 1,
		messageId: 2,
	});
	assert.deepEqual(targetOf({ ...base, inline_message_id: "i" }), { inlineMessageId: "i" });
	assert.equal(targetOf({ id: "q", from, type: base.type, data: "d", widget_id: "w" }), undefined);
	assert.deepEqual(targetParams({ chatId: "@c", messageId: 3 }), { chat_id: "@c", message_id: 3 });
	assert.deepEqual(targetParams({ inlineMessageId: "i" }), { inline_message_id: "i" });
});
